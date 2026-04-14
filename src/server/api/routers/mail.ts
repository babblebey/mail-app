import { z } from "zod";
import type { MessageStructureObject } from "imapflow";
import { simpleParser } from "mailparser";
import sanitizeHtml from "sanitize-html";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { withImapClient, resolveAccountId } from "~/server/imap/client";

/** Check whether a BODYSTRUCTURE tree contains attachments. */
function hasAttachments(structure?: MessageStructureObject): boolean {
  if (!structure) return false;
  // A part is an attachment if it has a "attachment" disposition,
  // or if it's not a text/html/multipart with a filename
  if (structure.disposition === "attachment") return true;
  if (
    structure.dispositionParameters?.filename ||
    structure.parameters?.name
  ) {
    // inline images with a CID are not counted as user-facing attachments
    if (structure.disposition === "inline" && structure.id) return false;
    return true;
  }
  if (structure.childNodes) {
    return structure.childNodes.some(hasAttachments);
  }
  return false;
}

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

  /**
   * Returns a paginated list of message summaries for a given folder,
   * ordered newest-first using sequence-number-based cursor pagination.
   */
  listMessages: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
        folder: z.string().min(1),
        cursor: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      return withImapClient(accountId, ctx.session.user.id, async (client) => {
        const mailbox = await client.mailboxOpen(input.folder, {
          readOnly: true,
        });

        const total = mailbox.exists;
        if (total === 0) {
          return { messages: [], nextCursor: null as number | null };
        }

        // Determine the sequence range (newest-first).
        // cursor is the sequence number to paginate FROM (exclusive upper bound).
        const upperSeq = input.cursor ? input.cursor - 1 : total;
        if (upperSeq <= 0) {
          return { messages: [], nextCursor: null as number | null };
        }

        const lowerSeq = Math.max(1, upperSeq - input.limit + 1);
        const range = `${lowerSeq}:${upperSeq}`;

        const messages: Array<{
          uid: number;
          sequenceNumber: number;
          subject: string;
          from: { name: string; address: string };
          to: { name: string; address: string }[];
          cc: { name: string; address: string }[];
          bcc: { name: string; address: string }[];
          date: string;
          flags: string[];
          read: boolean;
          starred: boolean;
          snippet: string;
          hasAttachments: boolean;
        }> = [];

        for await (const msg of client.fetch(range, {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          bodyParts: ["1"],
        })) {
          const flags = msg.flags ? Array.from(msg.flags) : [];
          const fromAddr = msg.envelope?.from?.[0];
          const toAddrs = msg.envelope?.to ?? [];
          const ccAddrs = msg.envelope?.cc ?? [];
          const bccAddrs = msg.envelope?.bcc ?? [];

          // Extract a plain-text snippet from body part "1" (first text part)
          let snippet = "";
          if (msg.bodyParts) {
            const textBuf = msg.bodyParts.get("1");
            if (textBuf) {
              snippet = sanitizeHtml(textBuf.toString("utf-8"), {
                  allowedTags: [],
                  allowedAttributes: {},
                })
                .replace(/\r?\n/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 120);
            }
          }

          messages.push({
            uid: msg.uid,
            sequenceNumber: msg.seq,
            subject: msg.envelope?.subject ?? "(no subject)",
            from: {
              name: fromAddr?.name ?? fromAddr?.address ?? "Unknown",
              address: fromAddr?.address ?? "",
            },
            to: toAddrs.map((a) => ({
              name: a.name ?? a.address ?? "Unknown",
              address: a.address ?? "",
            })),
            cc: ccAddrs.map((a) => ({
              name: a.name ?? a.address ?? "Unknown",
              address: a.address ?? "",
            })),
            bcc: bccAddrs.map((a) => ({
              name: a.name ?? a.address ?? "Unknown",
              address: a.address ?? "",
            })),
            date: msg.envelope?.date
              ? msg.envelope.date.toISOString()
              : new Date().toISOString(),
            flags,
            read: flags.includes("\\Seen"),
            starred: flags.includes("\\Flagged"),
            snippet,
            hasAttachments: hasAttachments(msg.bodyStructure),
          });
        }

        // Sort newest-first (highest sequence number first)
        messages.sort((a, b) => b.sequenceNumber - a.sequenceNumber);

        const nextCursor: number | null = lowerSeq > 1 ? lowerSeq : null;

        return { messages, nextCursor };
      });
    }),

  /**
   * Fetches and parses a single email by UID, sanitises HTML,
   * and auto-marks it as read on the IMAP server.
   */
  getMessage: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
        folder: z.string().min(1),
        uid: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      return withImapClient(accountId, ctx.session.user.id, async (client) => {
        await client.mailboxOpen(input.folder);

        // Download the full RFC822 message source by UID
        const downloadResult = await client.download(
          String(input.uid),
          undefined,
          { uid: true },
        );

        // Collect the stream into a buffer
        const chunks: Buffer[] = [];
        for await (const chunk of downloadResult.content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawSource = Buffer.concat(chunks);

        // Parse with mailparser
        const parsed = await simpleParser(rawSource);

        // Fetch flags for this message
        const flagMsg = await client.fetchOne(
          String(input.uid),
          { uid: true, flags: true },
          { uid: true },
        );
        const flags = flagMsg && flagMsg.flags ? Array.from(flagMsg.flags) : [];
        const isRead = flags.includes("\\Seen");

        // Auto-mark as \Seen if not already read
        if (!isRead) {
          await client.messageFlagsAdd(
            String(input.uid),
            ["\\Seen"],
            { uid: true },
          );
          flags.push("\\Seen");
        }

        // Helper to normalise mailparser address objects
        const normaliseAddresses = (
          addr:
            | import("mailparser").AddressObject
            | import("mailparser").AddressObject[]
            | undefined,
        ) => {
          if (!addr) return [];
          const list = Array.isArray(addr) ? addr : [addr];
          return list.flatMap((a) =>
            a.value.map((v) => ({
              name: v.name ?? v.address ?? "Unknown",
              address: v.address ?? "",
            })),
          );
        };

        const fromAddrs = normaliseAddresses(parsed.from);
        const toAddrs = normaliseAddresses(parsed.to);
        const ccAddrs = normaliseAddresses(parsed.cc);
        const bccAddrs = normaliseAddresses(parsed.bcc);
        const replyToAddrs = normaliseAddresses(parsed.replyTo);

        // Sanitise HTML body
        const htmlBody = parsed.html
          ? sanitizeHtml(parsed.html, {
              allowedTags: sanitizeHtml.defaults.allowedTags.concat([
                "img",
                "span",
                "div",
                "table",
                "thead",
                "tbody",
                "tr",
                "td",
                "th",
                "center",
                "hr",
              ]),
              allowedAttributes: {
                ...sanitizeHtml.defaults.allowedAttributes,
                img: ["src", "alt", "width", "height", "style"],
                td: ["style", "align", "valign", "width", "colspan", "rowspan"],
                th: ["style", "align", "valign", "width", "colspan", "rowspan"],
                table: ["style", "width", "cellpadding", "cellspacing", "border"],
                div: ["style", "class"],
                span: ["style", "class"],
                a: ["href", "target", "rel", "style"],
                tr: ["style"],
                center: ["style"],
                hr: ["style"],
              },
              allowedSchemes: ["http", "https", "mailto", "cid"],
              transformTags: {
                a: (tagName, attribs) => ({
                  tagName,
                  attribs: {
                    ...attribs,
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                }),
              },
            })
          : null;

        // Map attachments
        const attachments = (parsed.attachments ?? []).map((att) => ({
          filename: att.filename ?? "unnamed",
          contentType: att.contentType,
          size: att.size,
          cid: att.cid ?? undefined,
        }));

        // Normalise references to string[]
        const references = parsed.references
          ? Array.isArray(parsed.references)
            ? parsed.references
            : [parsed.references]
          : undefined;

        return {
          uid: input.uid,
          messageId: parsed.messageId ?? "",
          subject: parsed.subject ?? "(no subject)",
          from: fromAddrs[0] ?? { name: "Unknown", address: "" },
          to: toAddrs,
          cc: ccAddrs,
          bcc: bccAddrs,
          replyTo: replyToAddrs,
          date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
          flags,
          read: true, // We just marked it as read
          starred: flags.includes("\\Flagged"),
          textBody: parsed.text ?? null,
          htmlBody,
          attachments,
          inReplyTo: parsed.inReplyTo,
          references,
        };
      });
    }),

  /**
   * Marks a message as read or unread by adding/removing the \Seen flag.
   */
  markAsRead: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
        folder: z.string().min(1),
        uid: z.number().int().positive(),
        read: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      return withImapClient(accountId, ctx.session.user.id, async (client) => {
        await client.mailboxOpen(input.folder);

        if (input.read) {
          await client.messageFlagsAdd(
            String(input.uid),
            ["\\Seen"],
            { uid: true },
          );
        } else {
          await client.messageFlagsRemove(
            String(input.uid),
            ["\\Seen"],
            { uid: true },
          );
        }

        return { ok: true };
      });
    }),

  /**
   * Toggles the starred/flagged state by adding/removing the \Flagged flag.
   */
  toggleStar: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
        folder: z.string().min(1),
        uid: z.number().int().positive(),
        starred: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      return withImapClient(accountId, ctx.session.user.id, async (client) => {
        await client.mailboxOpen(input.folder);

        if (input.starred) {
          await client.messageFlagsAdd(
            String(input.uid),
            ["\\Flagged"],
            { uid: true },
          );
        } else {
          await client.messageFlagsRemove(
            String(input.uid),
            ["\\Flagged"],
            { uid: true },
          );
        }

        return { ok: true };
      });
    }),
});
