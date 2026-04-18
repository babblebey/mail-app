import type { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import sanitizeHtml from "sanitize-html";

import { db } from "~/server/db";
import type { MailFolder } from "../../../generated/prisma";

/**
 * Eagerly downloads and caches full message bodies for the most recent
 * unfetched messages in a folder (up to 50 per call).
 *
 * The caller must have already opened the mailbox read-only on the client.
 */
export async function syncBodies(
  client: ImapFlow,
  folder: MailFolder,
): Promise<void> {
  // Find messages that haven't had their body fetched yet, newest first
  const unfetched = await db.mailMessage.findMany({
    where: { folderId: folder.id, bodyFetched: false },
    orderBy: { uid: "desc" },
    take: 50,
    select: { id: true, uid: true },
  });

  if (unfetched.length === 0) return;

  for (const msg of unfetched) {
    try {
      // Download the full RFC822 source by UID
      const { content } = await client.download(
        String(msg.uid),
        undefined,
        { uid: true },
      );

      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawSource = Buffer.concat(chunks);

      // Parse with mailparser
      const parsed = await simpleParser(rawSource, {
        skipImageLinks: true,
      });

      // Sanitise HTML body using the same config as getMessage
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

      // Extract attachment metadata (binary data is NOT cached)
      const attachments = (parsed.attachments ?? []).map((att, idx) => ({
        filename: att.filename ?? "unnamed",
        contentType: att.contentType,
        size: att.size,
        cid: att.cid ?? null,
        index: idx,
      }));

      // Persist body and mark as fetched in a single transaction
      await db.$transaction([
        db.mailMessageBody.create({
          data: {
            messageId: msg.id,
            textBody: parsed.text ?? null,
            htmlBody,
            attachments: attachments.length > 0 ? attachments : undefined,
          },
        }),
        db.mailMessage.update({
          where: { id: msg.id },
          data: { bodyFetched: true },
        }),
      ]);
    } catch (error) {
      // Log and continue — don't let one message failure stop the whole batch
      console.error(
        `[sync] Failed to fetch body for message UID ${msg.uid} in folder "${folder.path}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
