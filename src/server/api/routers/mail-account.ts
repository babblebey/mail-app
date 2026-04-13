import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ImapFlow } from "imapflow";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { encrypt, decrypt } from "~/lib/crypto";

/** Shared Zod shape for mail-account fields. */
const mailAccountFields = {
  label: z.string().min(1).max(255),
  email: z.string().email(),
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapTls: z.boolean().default(true),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpTls: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
};

const createInput = z.object(mailAccountFields);

const updateInput = z.object({
  id: z.string().cuid(),
  ...Object.fromEntries(
    Object.entries(mailAccountFields).map(([k, v]) => [k, v.optional()]),
  ),
}) as z.ZodType<
  { id: string } & Partial<z.infer<typeof createInput>>
>;

const testConnectionInput = z.object({
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapTls: z.boolean(),
  username: z.string().min(1),
  password: z.string().min(1),
});

/** Fields to exclude from API responses. */
const passwordField = { password: true } as const;

export const mailAccountRouter = createTRPCRouter({
  /** Create a new mail account for the current user. Auto-defaults the first account. */
  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const existingCount = await ctx.db.mailAccount.count({
        where: { userId: ctx.session.user.id },
      });

      const account = await ctx.db.mailAccount.create({
        data: {
          ...input,
          password: encrypt(input.password),
          isDefault: existingCount === 0,
          user: { connect: { id: ctx.session.user.id } },
        },
      });

      const { password: _, ...rest } = account;
      return rest;
    }),

  /** List all mail accounts for the current user (passwords excluded). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await ctx.db.mailAccount.findMany({
      where: { userId: ctx.session.user.id },
      omit: passwordField,
      orderBy: { createdAt: "asc" },
    });

    return accounts;
  }),

  /** Get a single mail account by ID (password excluded). */
  getById: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.db.mailAccount.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        omit: passwordField,
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Mail account not found",
        });
      }

      return account;
    }),

  /** Update an existing mail account. Re-encrypts password if changed. */
  update: protectedProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      // Verify ownership
      const existing = await ctx.db.mailAccount.findFirst({
        where: { id, userId: ctx.session.user.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Mail account not found",
        });
      }

      // Re-encrypt password if it was provided
      const data: Record<string, unknown> = { ...fields };
      if (fields.password) {
        data.password = encrypt(fields.password);
      }

      const updated = await ctx.db.mailAccount.update({
        where: { id },
        data,
      });

      const { password: _, ...rest } = updated;
      return rest;
    }),

  /** Delete a mail account by ID. Reassigns default if needed. */
  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const existing = await ctx.db.mailAccount.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Mail account not found",
        });
      }

      await ctx.db.mailAccount.delete({ where: { id: input.id } });

      // If we deleted the default account, promote the oldest remaining one
      if (existing.isDefault) {
        const oldest = await ctx.db.mailAccount.findFirst({
          where: { userId: ctx.session.user.id },
          orderBy: { createdAt: "asc" },
        });
        if (oldest) {
          await ctx.db.mailAccount.update({
            where: { id: oldest.id },
            data: { isDefault: true },
          });
        }
      }

      return { success: true };
    }),

  /** Set a mail account as the default. Unsets all others in a transaction. */
  setDefault: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const existing = await ctx.db.mailAccount.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Mail account not found",
        });
      }

      await ctx.db.$transaction([
        ctx.db.mailAccount.updateMany({
          where: { userId: ctx.session.user.id, isDefault: true },
          data: { isDefault: false },
        }),
        ctx.db.mailAccount.update({
          where: { id: input.id },
          data: { isDefault: true },
        }),
      ]);

      return { success: true };
    }),

  /**
   * Test connection with the given IMAP credentials.
   * Attempts a real IMAP connection, authenticates, and immediately disconnects.
   */
  testConnection: protectedProcedure
    .input(testConnectionInput)
    .mutation(async ({ input }) => {
      const client = new ImapFlow({
        host: input.imapHost,
        port: input.imapPort,
        secure: input.imapTls,
        auth: {
          user: input.username,
          pass: input.password,
        },
        logger: false,
      });

      try {
        await client.connect();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown connection error";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `IMAP connection failed: ${message}`,
        });
      } finally {
        try {
          await client.logout();
        } catch {
          // Ignore logout errors
        }
      }

      return { ok: true };
    }),
});
