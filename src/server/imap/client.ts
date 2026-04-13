import { ImapFlow } from "imapflow";
import { TRPCError } from "@trpc/server";

import { db } from "~/server/db";
import { decrypt } from "~/lib/crypto";

/**
 * Creates a connected ImapFlow instance from decrypted mail account credentials.
 */
function createImapClient(options: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}): ImapFlow {
  return new ImapFlow({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: {
      user: options.user,
      pass: options.pass,
    },
    logger: false,
  });
}

/**
 * Opens a short-lived IMAP connection for a user's mail account and passes it
 * to the provided callback. The connection is always closed in a `finally` block.
 *
 * - Fetches the MailAccount from the database, verifying ownership.
 * - Decrypts the stored password.
 * - Connects, runs the callback, and ensures logout.
 */
export async function withImapClient<T>(
  accountId: string,
  userId: string,
  callback: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const account = await db.mailAccount.findFirst({
    where: { id: accountId, userId },
  });

  if (!account) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Mail account not found",
    });
  }

  const password = decrypt(account.password);

  const client = createImapClient({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapTls,
    user: account.username,
    pass: password,
  });

  try {
    await client.connect();
    return await callback(client);
  } catch (error) {
    // Re-throw TRPCErrors as-is
    if (error instanceof TRPCError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown IMAP error";
    console.error(`[IMAP] Error for account ${accountId}: ${message}`);

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `IMAP error: ${message}`,
    });
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore logout errors — connection may already be closed
    }
  }
}

/**
 * Resolves the account ID to use. If an explicit `accountId` is provided, returns it.
 * Otherwise, returns the user's default mail account ID.
 */
export async function resolveAccountId(
  accountId: string | undefined,
  userId: string,
): Promise<string> {
  if (accountId) return accountId;

  const defaultAccount = await db.mailAccount.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  });

  if (!defaultAccount) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No default mail account found. Please add a mail account first.",
    });
  }

  return defaultAccount.id;
}
