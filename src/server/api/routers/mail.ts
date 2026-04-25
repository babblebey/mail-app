import { z } from "zod";
import type { MessageStructureObject, MessageEnvelopeObject } from "imapflow";
import { simpleParser } from "mailparser";
import sanitizeHtml from "sanitize-html";
import iconv from "iconv-lite";
import { convert } from "html-to-text";

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

/** Find the first MIME part matching a given type (e.g. "text/plain"). */
function findPartByType(
  structure: MessageStructureObject,
  mimeType: string,
): { part: string; type: string; charset: string | null; encoding: string | null } | null {
  if (structure.type === mimeType && structure.part) {
    return {
      part: structure.part,
      type: mimeType,
      charset: structure.parameters?.charset ?? null,
      encoding: structure.encoding ?? null,
    };
  }
  if (structure.childNodes) {
    for (const child of structure.childNodes) {
      const found = findPartByType(child, mimeType);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Walks the BODYSTRUCTURE tree to find the best part for generating a
 * snippet. Prefers text/plain; falls back to text/html.
 */
function findSnippetPart(
  structure?: MessageStructureObject,
): { part: string; type: string; charset: string | null; encoding: string | null } | null {
  if (!structure) return null;
  return (
    findPartByType(structure, "text/plain") ??
    findPartByType(structure, "text/html")
  );
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
   * Lists all mailbox folders for a mail account, reading from the local
   * cache. Falls back to a live IMAP fetch when the cache is empty (first
   * load before the sync worker has run).
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

      // Try local cache first
      const cachedFolders = await ctx.db.mailFolder.findMany({
        where: { mailAccountId: accountId },
      });

      if (cachedFolders.length > 0) {
        const folders = cachedFolders.map((f) => ({
          path: f.path,
          name: f.name,
          specialUse: f.specialUse ?? undefined,
          delimiter: f.delimiter ?? undefined,
          listed: true as const,
          subscribed: true as const,
          totalMessages: f.totalMessages,
          unseenMessages: f.unseenMessages,
        }));

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
      }

      // Fallback: live IMAP fetch (cache not yet populated)
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
   * ordered newest-first using date-based cursor pagination (reads from
   * local cache, falls back to live IMAP when cache is empty).
   */
  listMessages: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
        folder: z.string().min(1),
        cursor: z.string().optional(), // ISO date string
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      // Look up the cached folder
      const folder = await ctx.db.mailFolder.findUnique({
        where: {
          mailAccountId_path: {
            mailAccountId: accountId,
            path: input.folder,
          },
        },
      });

      const cachedCount = folder
        ? await ctx.db.mailMessage.count({ where: { folderId: folder.id } })
        : 0;

      if (folder && cachedCount > 0) {
        // Cache path: read from database
        const where: { folderId: string; date?: { lt: Date } } = {
          folderId: folder.id,
        };
        if (input.cursor) {
          where.date = { lt: new Date(input.cursor) };
        }

        const rows = await ctx.db.mailMessage.findMany({
          where,
          orderBy: { date: "desc" },
          take: input.limit + 1,
        });

        const hasMore = rows.length > input.limit;
        const page = hasMore ? rows.slice(0, input.limit) : rows;
        const nextCursor: string | null =
          hasMore && page[page.length - 1]?.date
            ? page[page.length - 1]!.date!.toISOString()
            : null;

        return {
          messages: page.map((m) => ({
            uid: m.uid,
            sequenceNumber: 0,
            subject: m.subject ?? "(no subject)",
            from: m.fromAddress as { name: string; address: string },
            to: (m.toAddress ?? []) as { name: string; address: string }[],
            cc: (m.ccAddress ?? []) as { name: string; address: string }[],
            bcc: (m.bccAddress ?? []) as { name: string; address: string }[],
            date: m.date ? m.date.toISOString() : new Date().toISOString(),
            flags: m.flags,
            read: m.read,
            starred: m.starred,
            snippet: m.snippet ?? "",
            hasAttachments: m.hasAttachments,
          })),
          nextCursor,
        };
      }

      // Fallback: live IMAP fetch (cache not yet populated)
      return withImapClient(accountId, ctx.session.user.id, async (client) => {
        const mailbox = await client.mailboxOpen(input.folder, {
          readOnly: true,
        });

        const total = mailbox.exists;
        if (total === 0) {
          return { messages: [] as Array<{
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
          }>, nextCursor: null as string | null };
        }

        // Fetch the most recent messages (no cursor support in fallback)
        const upperSeq = total;
        const lowerSeq = Math.max(1, upperSeq - input.limit + 1);
        const range = `${lowerSeq}:${upperSeq}`;

        const fetched: Array<{
          uid: number;
          seq: number;
          flags: string[];
          envelope?: MessageEnvelopeObject;
          bodyStructure?: MessageStructureObject;
        }> = [];

        for await (const msg of client.fetch(range, {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
        })) {
          fetched.push({
            uid: msg.uid,
            seq: msg.seq,
            flags: msg.flags ? Array.from(msg.flags) : [],
            envelope: msg.envelope,
            bodyStructure: msg.bodyStructure,
          });
        }

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

        for (const msg of fetched) {
          const flags = msg.flags;
          const fromAddr = msg.envelope?.from?.[0];
          const toAddrs = msg.envelope?.to ?? [];
          const ccAddrs = msg.envelope?.cc ?? [];
          const bccAddrs = msg.envelope?.bcc ?? [];

          let snippet = "";
          const snippetPart = findSnippetPart(msg.bodyStructure);

          if (snippetPart) {
            try {
              const { content, meta } = await client.download(
                String(msg.uid),
                snippetPart.part,
                { uid: true },
              );
              const chunks: Buffer[] = [];
              for await (const chunk of content) {
                chunks.push(
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                  Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
                );
              }
              const rawBuf = Buffer.concat(chunks);

              const charset = meta.charset ?? snippetPart.charset ?? "utf-8";
              const text = iconv.encodingExists(charset)
                ? iconv.decode(rawBuf, charset)
                : rawBuf.toString("utf-8");
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const plain =
                snippetPart.type === "text/html"
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                  ? convert(text, {
                      wordwrap: false,
                      selectors: [
                        { selector: "img", format: "skip" },
                        { selector: "a", options: { ignoreHref: true } },
                      ],
                    })
                  : text;
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
              snippet = plain
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                .replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
            } catch {
              // If downloading the part fails, leave snippet empty
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

        // Sort newest-first
        messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Date-based next cursor from the oldest message in this page
        const nextCursor: string | null =
          lowerSeq > 1 && messages.length > 0
            ? messages[messages.length - 1]!.date
            : null;

        return { messages, nextCursor };
      });
    }),

  /**
   * Fetches a single email by UID. Reads from the local cache when the
   * body has already been synced; otherwise performs a live IMAP download,
   * persists the result, and returns it. Auto-marks the message as read.
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

      // Try to find the cached message
      const folder = await ctx.db.mailFolder.findUnique({
        where: {
          mailAccountId_path: {
            mailAccountId: accountId,
            path: input.folder,
          },
        },
      });

      const cachedMsg = folder
        ? await ctx.db.mailMessage.findUnique({
            where: {
              folderId_uid: { folderId: folder.id, uid: input.uid },
            },
            include: { body: true },
          })
        : null;

      // ── Cached-body path ──────────────────────────────────────────
      if (cachedMsg?.body) {
        let autoMarkedRead = false;

        // Auto-mark as read on IMAP + local cache
        if (!cachedMsg.read) {
          autoMarkedRead = true;

          // Fire IMAP flag update (best-effort)
          withImapClient(accountId, ctx.session.user.id, async (client) => {
            await client.mailboxOpen(input.folder);
            await client.messageFlagsAdd(
              String(input.uid),
              ["\\Seen"],
              { uid: true },
            );
          }).catch(() => {/* swallow – sync will reconcile */});

          await ctx.db.mailMessage.update({
            where: { id: cachedMsg.id },
            data: {
              read: true,
              flags: cachedMsg.flags.includes("\\Seen")
                ? cachedMsg.flags
                : [...cachedMsg.flags, "\\Seen"],
            },
          });

          if (folder && folder.unseenMessages > 0) {
            await ctx.db.mailFolder.update({
              where: { id: folder.id },
              data: { unseenMessages: folder.unseenMessages - 1 },
            });
          }
        }

        const flags = cachedMsg.flags.includes("\\Seen")
          ? cachedMsg.flags
          : [...cachedMsg.flags, "\\Seen"];

        // Process cached attachment metadata
        const rawAttachments = (cachedMsg.body.attachments ?? []) as Array<{
          filename: string;
          contentType: string;
          size: number;
          cid?: string | null;
          index: number;
          inline?: boolean;
        }>;

        // Replace cid: references in cached HTML with /api/attachments URLs
        const inlineIndices = new Set<number>();
        let htmlBody = cachedMsg.body.htmlBody;
        if (htmlBody) {
          const cidMap = new Map<string, number>();
          for (const att of rawAttachments) {
            if (att.cid) {
              const cleanCid = att.cid.replace(/^<|>$/g, "");
              cidMap.set(cleanCid, att.index);
            }
          }
          if (cidMap.size > 0) {
            htmlBody = htmlBody.replace(
              /cid:([^"'\s)]+)/g,
              (_match, cidValue: string) => {
                const idx = cidMap.get(cidValue);
                if (idx !== undefined) {
                  inlineIndices.add(idx);
                  const params = new URLSearchParams({
                    folder: input.folder,
                    uid: String(input.uid),
                    index: String(idx),
                    preview: "1",
                  });
                  return `/api/attachments?${params.toString()}`;
                }
                return _match;
              },
            );
          }
        }

        const attachments = rawAttachments
          .filter((att) => !inlineIndices.has(att.index) && !att.inline)
          .map(({ index: _index, cid: _cid, inline: _inline, ...rest }) => rest);

        return {
          uid: cachedMsg.uid,
          messageId: cachedMsg.messageId ?? "",
          subject: cachedMsg.subject ?? "(no subject)",
          from: cachedMsg.fromAddress as { name: string; address: string },
          to: (cachedMsg.toAddress ?? []) as { name: string; address: string }[],
          cc: (cachedMsg.ccAddress ?? []) as { name: string; address: string }[],
          bcc: (cachedMsg.bccAddress ?? []) as { name: string; address: string }[],
          replyTo: [] as { name: string; address: string }[],
          date: cachedMsg.date
            ? cachedMsg.date.toISOString()
            : new Date().toISOString(),
          flags,
          read: true,
          starred: flags.includes("\\Flagged"),
          textBody: cachedMsg.body.textBody,
          htmlBody,
          attachments,
          inReplyTo: cachedMsg.inReplyTo ?? undefined,
          references: cachedMsg.references.length > 0 ? cachedMsg.references : undefined,
          autoMarkedRead,
        };
      }

      // ── Lazy-fetch path (body not cached) ─────────────────────────
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawSource = Buffer.concat(chunks);

        // Parse with mailparser – skip converting cid: links to data: URIs
        // so we can replace them with /api/attachments URLs ourselves
        const parsed = await simpleParser(rawSource, {
          skipImageLinks: true,
        });

        // Fetch flags for this message
        const flagMsg = await client.fetchOne(
          String(input.uid),
          { uid: true, flags: true },
          { uid: true },
        );
        const flags = flagMsg && flagMsg.flags ? Array.from(flagMsg.flags) : [];
        const isRead = flags.includes("\\Seen");
        const autoMarkedRead = !isRead;

        // Auto-mark as \Seen if not already read
        if (autoMarkedRead) {
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

        // Map attachments and build CID lookup
        const allAttachments = (parsed.attachments ?? []).map((att, idx) => ({
          filename: att.filename ?? "unnamed",
          contentType: att.contentType,
          size: att.size,
          cid: att.cid ?? undefined,
          index: idx,
        }));

        // Replace cid: references in raw HTML BEFORE sanitisation, because
        // sanitize-html strips cid: src values even when listed in allowedSchemes
        const inlineIndices = new Set<number>();
        let rawHtml = parsed.html ?? null;
        if (rawHtml) {
          const cidMap = new Map<string, number>();
          for (const att of allAttachments) {
            if (att.cid) {
              // mailparser CIDs may include angle brackets, strip them
              const cleanCid = att.cid.replace(/^<|>$/g, "");
              cidMap.set(cleanCid, att.index);
            }
          }

          if (cidMap.size > 0) {
            rawHtml = rawHtml.replace(
              /cid:([^"'\s)]+)/g,
              (_match, cidValue: string) => {
                const idx = cidMap.get(cidValue);
                if (idx !== undefined) {
                  inlineIndices.add(idx);
                  const params = new URLSearchParams({
                    folder: input.folder,
                    uid: String(input.uid),
                    index: String(idx),
                    preview: "1",
                  });
                  return `/api/attachments?${params.toString()}`;
                }
                return _match;
              },
            );
          }
        }

        // Sanitise HTML body (cid: URLs already replaced with /api/attachments)
        const htmlBody = rawHtml
          ? sanitizeHtml(rawHtml, {
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
                img: ["src", "alt", "width", "height", "style", "align"],
                td: ["style", "align", "valign", "width", "colspan", "rowspan"],
                th: ["style", "align", "valign", "width", "colspan", "rowspan"],
                table: ["style", "width", "cellpadding", "cellspacing", "border", "align"],
                div: ["style", "class", "align"],
                span: ["style", "class", "align"],
                a: ["href", "target", "rel", "style"],
                tr: ["style"],
                center: ["style"],
                hr: ["style"],
              },
              allowedSchemes: ["http", "https", "mailto"],
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

        // Exclude inline CID attachments from the attachment list
        const attachments = allAttachments
          .filter((att) => !inlineIndices.has(att.index))
          .map(({ index: _index, ...rest }) => rest);

        // Normalise references to string[]
        const references = parsed.references
          ? Array.isArray(parsed.references)
            ? parsed.references
            : [parsed.references]
          : undefined;

        // Persist body to cache (best-effort, don't fail the response)
        if (cachedMsg && !cachedMsg.bodyFetched) {
          const attachmentMeta = (parsed.attachments ?? []).map((att, idx) => ({
            filename: att.filename ?? "unnamed",
            contentType: att.contentType,
            size: att.size,
            cid: att.cid ?? null,
            index: idx,
          }));

          ctx.db.$transaction([
            ctx.db.mailMessageBody.create({
              data: {
                messageId: cachedMsg.id,
                textBody: parsed.text ?? null,
                htmlBody,
                attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
              },
            }),
            ctx.db.mailMessage.update({
              where: { id: cachedMsg.id },
              data: { bodyFetched: true },
            }),
          ]).catch(() => {/* swallow – sync will retry */});
        }

        // Auto-mark-as-read in cache
        if (cachedMsg && !cachedMsg.read) {
          const updates = [
            ctx.db.mailMessage.update({
              where: { id: cachedMsg.id },
              data: {
                read: true,
                flags: cachedMsg.flags.includes("\\Seen")
                  ? cachedMsg.flags
                  : [...cachedMsg.flags, "\\Seen"],
              },
            }),
          ];

          if (folder && folder.unseenMessages > 0) {
            updates.push(
              ctx.db.mailFolder.update({
                where: { id: folder.id },
                data: { unseenMessages: folder.unseenMessages - 1 },
              }),
            );
          }

          ctx.db.$transaction(updates).catch(() => {/* swallow */});
        }

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
          autoMarkedRead,
        };
      });
    }),

  /**
   * Marks a message as read or unread by adding/removing the \Seen flag.
   * Write-through: updates both IMAP and the local cache.
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

        // Write-through to local cache
        const folder = await ctx.db.mailFolder.findUnique({
          where: {
            mailAccountId_path: { mailAccountId: accountId, path: input.folder },
          },
        });
        if (folder) {
          const cached = await ctx.db.mailMessage.findUnique({
            where: { folderId_uid: { folderId: folder.id, uid: input.uid } },
          });
          if (cached) {
            const readStateChanged = cached.read !== input.read;
            const newFlags = input.read
              ? cached.flags.includes("\\Seen") ? cached.flags : [...cached.flags, "\\Seen"]
              : cached.flags.filter((f) => f !== "\\Seen");
            await ctx.db.mailMessage.update({
              where: { id: cached.id },
              data: { read: input.read, flags: newFlags },
            });

            if (readStateChanged) {
              if (input.read) {
                await ctx.db.mailFolder.updateMany({
                  where: {
                    id: folder.id,
                    unseenMessages: { gt: 0 },
                  },
                  data: {
                    unseenMessages: { decrement: 1 },
                  },
                });
              } else {
                await ctx.db.mailFolder.update({
                  where: { id: folder.id },
                  data: {
                    unseenMessages: { increment: 1 },
                  },
                });
              }
            }
          }
        }

        return { ok: true };
      });
    }),

  /**
   * Toggles the starred/flagged state by adding/removing the \Flagged flag.
   * Write-through: updates both IMAP and the local cache.
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

        // Write-through to local cache
        const folder = await ctx.db.mailFolder.findUnique({
          where: {
            mailAccountId_path: { mailAccountId: accountId, path: input.folder },
          },
        });
        if (folder) {
          const cached = await ctx.db.mailMessage.findUnique({
            where: { folderId_uid: { folderId: folder.id, uid: input.uid } },
          });
          if (cached) {
            const newFlags = input.starred
              ? cached.flags.includes("\\Flagged") ? cached.flags : [...cached.flags, "\\Flagged"]
              : cached.flags.filter((f) => f !== "\\Flagged");
            await ctx.db.mailMessage.update({
              where: { id: cached.id },
              data: { starred: input.starred, flags: newFlags },
            });
          }
        }

        return { ok: true };
      });
    }),

  /**
   * Moves a message from one IMAP folder to another (e.g. Trash, Junk).
   * Write-through: deletes the message from the source folder cache.
   */
  moveMessage: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
        folder: z.string().min(1),
        uid: z.number().int().positive(),
        destinationFolder: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      return withImapClient(accountId, ctx.session.user.id, async (client) => {
        await client.mailboxOpen(input.folder);
        await client.messageMove(
          String(input.uid),
          input.destinationFolder,
          { uid: true },
        );

        // Write-through: remove from source folder cache and adjust unseen counts
        const folder = await ctx.db.mailFolder.findUnique({
          where: {
            mailAccountId_path: { mailAccountId: accountId, path: input.folder },
          },
        });
        if (folder) {
          const cached = await ctx.db.mailMessage.findUnique({
            where: { folderId_uid: { folderId: folder.id, uid: input.uid } },
            select: { read: true },
          });

          await ctx.db.mailMessage.deleteMany({
            where: { folderId: folder.id, uid: input.uid },
          });

          const movedToDifferentFolder = input.destinationFolder !== input.folder;
          if (cached && !cached.read && movedToDifferentFolder) {
            await ctx.db.mailFolder.updateMany({
              where: {
                id: folder.id,
                unseenMessages: { gt: 0 },
              },
              data: {
                unseenMessages: { decrement: 1 },
              },
            });

            const destinationFolder = await ctx.db.mailFolder.findUnique({
              where: {
                mailAccountId_path: {
                  mailAccountId: accountId,
                  path: input.destinationFolder,
                },
              },
              select: { id: true },
            });

            if (destinationFolder) {
              await ctx.db.mailFolder.update({
                where: { id: destinationFolder.id },
                data: {
                  unseenMessages: { increment: 1 },
                },
              });
            }
          }
        }

        return { ok: true };
      });
    }),

  /**
   * Marks multiple messages as read or unread in a single IMAP operation
   * using a UID sequence set.
   * Write-through: batch-updates the local cache.
   */
  batchMarkAsRead: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
        folder: z.string().min(1),
        uids: z.array(z.number().int().positive()).min(1),
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

        const uidSet = input.uids.join(",");

        if (input.read) {
          await client.messageFlagsAdd(uidSet, ["\\Seen"], { uid: true });
        } else {
          await client.messageFlagsRemove(uidSet, ["\\Seen"], { uid: true });
        }

        // Write-through to local cache
        const folder = await ctx.db.mailFolder.findUnique({
          where: {
            mailAccountId_path: { mailAccountId: accountId, path: input.folder },
          },
        });
        if (folder) {
          const cached = await ctx.db.mailMessage.findMany({
            where: { folderId: folder.id, uid: { in: input.uids } },
          });
          let unseenDelta = 0;

          for (const msg of cached) {
            if (msg.read !== input.read) {
              unseenDelta += input.read ? -1 : 1;
            }

            const newFlags = input.read
              ? msg.flags.includes("\\Seen") ? msg.flags : [...msg.flags, "\\Seen"]
              : msg.flags.filter((f) => f !== "\\Seen");
            await ctx.db.mailMessage.update({
              where: { id: msg.id },
              data: { read: input.read, flags: newFlags },
            });
          }

          if (unseenDelta > 0) {
            await ctx.db.mailFolder.update({
              where: { id: folder.id },
              data: {
                unseenMessages: { increment: unseenDelta },
              },
            });
          } else if (unseenDelta < 0) {
            const decrementBy = Math.min(folder.unseenMessages, -unseenDelta);
            if (decrementBy > 0) {
              await ctx.db.mailFolder.updateMany({
                where: {
                  id: folder.id,
                  unseenMessages: { gte: decrementBy },
                },
                data: {
                  unseenMessages: { decrement: decrementBy },
                },
              });
            }
          }
        }

        return { ok: true };
      });
    }),

  /**
   * Moves multiple messages to a destination folder in a single IMAP
   * operation using a UID sequence set.
   * Write-through: batch-deletes messages from the source folder cache.
   */
  batchMoveMessages: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
        folder: z.string().min(1),
        uids: z.array(z.number().int().positive()).min(1),
        destinationFolder: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      return withImapClient(accountId, ctx.session.user.id, async (client) => {
        await client.mailboxOpen(input.folder);

        const uidSet = input.uids.join(",");
        await client.messageMove(uidSet, input.destinationFolder, {
          uid: true,
        });

        // Write-through: remove from source folder cache
        const folder = await ctx.db.mailFolder.findUnique({
          where: {
            mailAccountId_path: { mailAccountId: accountId, path: input.folder },
          },
        });
        if (folder) {
          await ctx.db.mailMessage.deleteMany({
            where: { folderId: folder.id, uid: { in: input.uids } },
          });
        }

        return { ok: true };
      });
    }),

  /**
   * Returns the sync state for a mail account.
   */
  getSyncStatus: protectedProcedure
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

      const syncState = await ctx.db.syncState.findUnique({
        where: { mailAccountId: accountId },
      });

      return {
        status: syncState?.status ?? "idle",
        error: syncState?.error ?? null,
        lastSyncStartedAt: syncState?.lastSyncStartedAt?.toISOString() ?? null,
        lastSyncCompletedAt: syncState?.lastSyncCompletedAt?.toISOString() ?? null,
      };
    }),

  /**
   * Requests an immediate sync for a mail account by setting its SyncState
   * to "pending". The background worker picks up pending accounts first.
   */
  triggerSync: protectedProcedure
    .input(
      z.object({
        accountId: z.string().cuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = await resolveAccountId(
        input.accountId,
        ctx.session.user.id,
      );

      await ctx.db.syncState.upsert({
        where: { mailAccountId: accountId },
        create: { mailAccountId: accountId, status: "pending" },
        update: { status: "pending" },
      });

      return { ok: true };
    }),
});
