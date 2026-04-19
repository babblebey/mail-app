import type { ImapFlow, MessageStructureObject } from "imapflow";
import iconv from "iconv-lite";
import { convert } from "html-to-text";

import { db } from "~/server/db";
import type { MailFolder } from "../../../generated/prisma";

// ---------------------------------------------------------------------------
// Helpers (mirrored from mail router — candidates for shared module later)
// ---------------------------------------------------------------------------

/** Check whether a BODYSTRUCTURE tree contains attachments. */
function hasAttachments(structure?: MessageStructureObject): boolean {
  if (!structure) return false;
  if (structure.disposition === "attachment") return true;
  if (
    structure.dispositionParameters?.filename ||
    structure.parameters?.name
  ) {
    if (structure.disposition === "inline" && structure.id) return false;
    return true;
  }
  if (structure.childNodes) {
    return structure.childNodes.some(hasAttachments);
  }
  return false;
}

function findPartByType(
  structure: MessageStructureObject,
  mimeType: string,
): {
  part: string;
  type: string;
  charset: string | null;
  encoding: string | null;
} | null {
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

function findSnippetPart(
  structure?: MessageStructureObject,
): {
  part: string;
  type: string;
  charset: string | null;
  encoding: string | null;
} | null {
  if (!structure) return null;
  return (
    findPartByType(structure, "text/plain") ??
    findPartByType(structure, "text/html")
  );
}

/** Format an envelope address into a JSON-safe { name, address } object. */
function fmtAddr(a?: { name?: string; address?: string }) {
  return {
    name: a?.name ?? a?.address ?? "Unknown",
    address: a?.address ?? "",
  };
}

function fmtAddrList(list?: Array<{ name?: string; address?: string }>) {
  return (list ?? []).map(fmtAddr);
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Incrementally syncs message metadata (envelope, flags) into the
 * MailMessage table for a single folder.
 *
 * The caller must have already opened an IMAP connection (but NOT opened
 * a mailbox). This function opens the mailbox read-only internally.
 */
export async function syncMessages(
  client: ImapFlow,
  folder: MailFolder,
): Promise<void> {
  const mailbox = await client.mailboxOpen(folder.path, { readOnly: true });

  // -----------------------------------------------------------------------
  // UIDVALIDITY check
  // -----------------------------------------------------------------------
  const imapUidValidity = mailbox.uidValidity
    ? Number(mailbox.uidValidity)
    : null;

  if (
    folder.uidValidity !== null &&
    imapUidValidity !== null &&
    folder.uidValidity !== imapUidValidity
  ) {
    // UIDs are no longer valid — purge entire folder cache and rebuild
    console.log(
      `[sync] UIDVALIDITY changed for folder "${folder.path}" ` +
        `(${folder.uidValidity} → ${imapUidValidity}). Purging cache.`,
    );
    await db.mailMessage.deleteMany({ where: { folderId: folder.id } });
    await db.mailFolder.update({
      where: { id: folder.id },
      data: { highestUid: 0, uidValidity: imapUidValidity },
    });
    folder = {
      ...folder,
      highestUid: 0,
      uidValidity: imapUidValidity,
    };
  } else if (folder.uidValidity === null && imapUidValidity !== null) {
    // First sync for this folder — just store the uidValidity
    await db.mailFolder.update({
      where: { id: folder.id },
      data: { uidValidity: imapUidValidity },
    });
    folder = { ...folder, uidValidity: imapUidValidity };
  }

  // -----------------------------------------------------------------------
  // New messages (UID > highestUid)
  // -----------------------------------------------------------------------
  if (mailbox.exists > 0) {
    const uidRange = `${folder.highestUid + 1}:*`;
    let maxUid = folder.highestUid;

    // Pass 1: fetch metadata
    const fetched: Array<{
      uid: number;
      flags: string[];
      envelope?: {
        subject?: string;
        from?: Array<{ name?: string; address?: string }>;
        to?: Array<{ name?: string; address?: string }>;
        cc?: Array<{ name?: string; address?: string }>;
        bcc?: Array<{ name?: string; address?: string }>;
        date?: Date;
        messageId?: string;
        inReplyTo?: string;
      };
      bodyStructure?: MessageStructureObject;
    }> = [];

    for await (const msg of client.fetch(uidRange, {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
    }, { uid: true })) {
      // ImapFlow returns the message at highestUid when the range starts
      // beyond existing UIDs. Skip messages we already have.
      if (msg.uid <= folder.highestUid) continue;

      fetched.push({
        uid: msg.uid,
        flags: msg.flags ? Array.from(msg.flags) : [],
        envelope: msg.envelope,
        bodyStructure: msg.bodyStructure,
      });

      if (msg.uid > maxUid) maxUid = msg.uid;
    }

    // Sort newest-first so the most recent messages are persisted first
    fetched.sort((a, b) => b.uid - a.uid);

    // Filter out UIDs already persisted (e.g. from an interrupted prior sync)
    const existingMessages = await db.mailMessage.findMany({
      where: {
        folderId: folder.id,
        uid: { in: fetched.map((m) => m.uid) },
      },
      select: { uid: true },
    });
    const existingUids = new Set(existingMessages.map((m) => m.uid));
    const newMessages = fetched.filter((m) => !existingUids.has(m.uid));

    // Pass 2: fetch snippets and create DB records
    for (const msg of newMessages) {
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
              Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
            );
          }
          const rawBuf = Buffer.concat(chunks);
          const charset = meta.charset ?? snippetPart.charset ?? "utf-8";
          const text = iconv.encodingExists(charset)
            ? iconv.decode(rawBuf, charset)
            : rawBuf.toString("utf-8");
          const plain =
            snippetPart.type === "text/html"
              ? convert(text, {
                  wordwrap: false,
                  selectors: [
                    { selector: "img", format: "skip" },
                    { selector: "a", options: { ignoreHref: true } },
                  ],
                })
              : text;
          snippet = plain.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
        } catch {
          // snippet unavailable — leave empty
        }
      }

      const flags = msg.flags;
      const envelope = msg.envelope;
      const fromAddr = fmtAddr(envelope?.from?.[0]);

      await db.mailMessage.create({
        data: {
          mailAccountId: folder.mailAccountId,
          folderId: folder.id,
          uid: msg.uid,
          messageId: envelope?.messageId ?? null,
          subject: envelope?.subject ?? null,
          fromAddress: fromAddr,
          toAddress: fmtAddrList(envelope?.to),
          ccAddress: fmtAddrList(envelope?.cc),
          bccAddress: fmtAddrList(envelope?.bcc),
          date: envelope?.date ?? null,
          flags,
          read: flags.includes("\\Seen"),
          starred: flags.includes("\\Flagged"),
          snippet,
          hasAttachments: hasAttachments(msg.bodyStructure),
          inReplyTo: envelope?.inReplyTo ?? null,
          references: [],  // ImapFlow envelope doesn't expose references; empty for now
        },
      });
    }

    // Update highestUid
    if (maxUid > folder.highestUid) {
      await db.mailFolder.update({
        where: { id: folder.id },
        data: { highestUid: maxUid },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Flag refresh + deletion detection on the recent 200 messages
  // -----------------------------------------------------------------------
  const recentCached = await db.mailMessage.findMany({
    where: { folderId: folder.id },
    orderBy: { uid: "desc" },
    take: 200,
    select: { id: true, uid: true, flags: true, read: true, starred: true },
  });

  if (recentCached.length > 0 && mailbox.exists > 0) {
    const minUid = Math.min(...recentCached.map((m) => m.uid));
    const maxUid = Math.max(...recentCached.map((m) => m.uid));
    const uidRange = `${minUid}:${maxUid}`;

    // Fetch current flags from IMAP for this range
    const imapFlags = new Map<number, string[]>();
    for await (const msg of client.fetch(uidRange, {
      uid: true,
      flags: true,
    }, { uid: true })) {
      imapFlags.set(msg.uid, msg.flags ? Array.from(msg.flags) : []);
    }

    // Update changed flags
    for (const cached of recentCached) {
      const serverFlags = imapFlags.get(cached.uid);
      if (!serverFlags) continue; // will be caught by deletion detection below

      const newRead = serverFlags.includes("\\Seen");
      const newStarred = serverFlags.includes("\\Flagged");

      const flagsChanged =
        cached.read !== newRead ||
        cached.starred !== newStarred ||
        JSON.stringify(cached.flags) !== JSON.stringify(serverFlags);

      if (flagsChanged) {
        await db.mailMessage.update({
          where: { id: cached.id },
          data: {
            flags: serverFlags,
            read: newRead,
            starred: newStarred,
          },
        });
      }
    }

    // Deletion detection: remove cached messages whose UIDs no longer exist
    const deletedMessages = recentCached.filter(
      (m) => !imapFlags.has(m.uid),
    );

    if (deletedMessages.length > 0) {
      await db.mailMessage.deleteMany({
        where: { id: { in: deletedMessages.map((m) => m.id) } },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Update folder sync timestamp
  // -----------------------------------------------------------------------
  await db.mailFolder.update({
    where: { id: folder.id },
    data: { lastSyncedAt: new Date() },
  });
}
