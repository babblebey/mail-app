import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { withImapClient, resolveAccountId } from "~/server/imap/client";

/** Ordering for well-known special-use folders. Lower = higher priority. */
const SPECIAL_USE_ORDER: Record<string, number> = {
  "\\Inbox": 0,
  "\\Drafts": 1,
  "\\Sent": 2,
  "\\Junk": 3,
  "\\Trash": 4,
  "\\Archive": 5,
};

export const mailRouter = createTRPCRouter({
  /**
   * Lists all IMAP mailbox folders for a mail account, sorted with
   * well-known special-use folders first, then alphabetically.
   */
  listFolders: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      return withImapClient(accountId, ctx.session.user.id, async (client) => {
        const mailboxes = await client.list({
          statusQuery: {
            messages: true,
            unseen: true,
          },
        });

        const folders = mailboxes.map((mailbox) => ({
          path: mailbox.path,
          name: mailbox.name,
          specialUse: mailbox.specialUse,
          delimiter: mailbox.delimiter,
          listed: mailbox.listed,
          subscribed: mailbox.subscribed,
          totalMessages: mailbox.status?.messages,
          unseenMessages: mailbox.status?.unseen,
        }));

        // Sort: special-use folders first (by known order), then alphabetically
        folders.sort((a, b) => {
          const aOrder =
            a.specialUse && a.specialUse in SPECIAL_USE_ORDER
              ? SPECIAL_USE_ORDER[a.specialUse]!
              : 100;
          const bOrder =
            b.specialUse && b.specialUse in SPECIAL_USE_ORDER
              ? SPECIAL_USE_ORDER[b.specialUse]!
              : 100;

          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.name.localeCompare(b.name);
        });

        return folders;
      });
    }),
});
