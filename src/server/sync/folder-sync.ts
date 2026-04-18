import { ImapFlow } from "imapflow";

import { db } from "~/server/db";
import { decrypt } from "~/lib/crypto";
import type { MailFolder } from "../../../generated/prisma";

/**
 * Creates a connected ImapFlow client from a MailAccount record.
 * The caller is responsible for calling `client.logout()` when done.
 */
export async function createSyncImapClient(account: {
  id: string;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  username: string;
  password: string;
}): Promise<ImapFlow> {
  const password = decrypt(account.password);

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapTls,
    auth: {
      user: account.username,
      pass: password,
    },
    logger: false,
  });

  await client.connect();
  return client;
}

/**
 * Synchronises the IMAP mailbox list into the MailFolder table for a given
 * account. Detects additions, updates, and deletions.
 *
 * Returns the list of synced MailFolder records (needed by downstream
 * message/body sync steps).
 */
export async function syncFolders(accountId: string): Promise<MailFolder[]> {
  const account = await db.mailAccount.findUniqueOrThrow({
    where: { id: accountId },
  });

  const client = await createSyncImapClient(account);

  try {
    const mailboxes = await client.list();

    const syncedPaths = new Set<string>();
    const upsertedFolders: MailFolder[] = [];

    for (const mailbox of mailboxes) {
      syncedPaths.add(mailbox.path);

      // Get status counts + uidValidity without opening the mailbox
      const status = await client.status(mailbox.path, {
        messages: true,
        unseen: true,
        uidValidity: true,
      });

      const folder = await db.mailFolder.upsert({
        where: {
          mailAccountId_path: {
            mailAccountId: accountId,
            path: mailbox.path,
          },
        },
        create: {
          mailAccountId: accountId,
          path: mailbox.path,
          name: mailbox.name,
          specialUse: mailbox.specialUse ?? null,
          delimiter: mailbox.delimiter ?? null,
          totalMessages: status.messages ?? 0,
          unseenMessages: status.unseen ?? 0,
          uidValidity: status.uidValidity ? Number(status.uidValidity) : null,
          lastSyncedAt: new Date(),
        },
        update: {
          name: mailbox.name,
          specialUse: mailbox.specialUse ?? null,
          delimiter: mailbox.delimiter ?? null,
          totalMessages: status.messages ?? 0,
          unseenMessages: status.unseen ?? 0,
          uidValidity: status.uidValidity ? Number(status.uidValidity) : null,
          lastSyncedAt: new Date(),
        },
      });

      upsertedFolders.push(folder);
    }

    // Delete folders that no longer exist on the IMAP server
    // (cascade deletes their cached messages)
    const existingFolders = await db.mailFolder.findMany({
      where: { mailAccountId: accountId },
      select: { id: true, path: true },
    });

    const foldersToDelete = existingFolders.filter(
      (f) => !syncedPaths.has(f.path),
    );

    if (foldersToDelete.length > 0) {
      await db.mailFolder.deleteMany({
        where: {
          id: { in: foldersToDelete.map((f) => f.id) },
        },
      });
    }

    return upsertedFolders;
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore logout errors
    }
  }
}
