import { db } from "~/server/db";
import { createSyncImapClient, syncFolders } from "./folder-sync";
import { syncMessages } from "./message-sync";
import { syncBodies } from "./body-sync";

const SYNC_INTERVAL_MS = 30_000;

let shutdownRequested = false;

/**
 * Starts the background sync worker that continuously polls IMAP for all
 * mail accounts. Processes accounts sequentially with a 30-second interval
 * between full cycles.
 */
export async function startSyncWorker(): Promise<void> {
  console.log("[sync] Worker starting…");

  // Ensure every account has a SyncState record
  const accounts = await db.mailAccount.findMany({ select: { id: true } });
  for (const account of accounts) {
    await db.syncState.upsert({
      where: { mailAccountId: account.id },
      create: { mailAccountId: account.id, status: "idle" },
      update: {},
    });
  }

  // Main loop
  while (!shutdownRequested) {
    const allAccounts = await db.mailAccount.findMany({
      include: { syncState: true },
    });

    // Process "pending" accounts first (manual trigger), then the rest
    const sorted = allAccounts.sort((a, b) => {
      const aP = a.syncState?.status === "pending" ? 0 : 1;
      const bP = b.syncState?.status === "pending" ? 0 : 1;
      return aP - bP;
    });

    for (const account of sorted) {
      if (shutdownRequested) break;

      // Ensure SyncState exists (handles accounts added after startup)
      const syncState = account.syncState
        ?? await db.syncState.upsert({
            where: { mailAccountId: account.id },
            create: { mailAccountId: account.id, status: "idle" },
            update: {},
          });

      try {
        // Mark as syncing
        await db.syncState.update({
          where: { id: syncState.id },
          data: { status: "syncing", lastSyncStartedAt: new Date() },
        });

        console.log(`[sync] Syncing account ${account.id} (${account.username})…`);

        // 1. Sync folders (manages its own IMAP connection)
        const folders = await syncFolders(account.id);

        // 2. Open one IMAP connection for message + body sync
        const client = await createSyncImapClient(account);
        try {
          for (const folder of folders) {
            if (shutdownRequested) break;

            try {
              await syncMessages(client, folder);
              await syncBodies(client, folder);
            } catch (folderError) {
              console.error(
                `[sync] Error syncing folder "${folder.path}" for account ${account.id}:`,
                folderError instanceof Error ? folderError.message : folderError,
              );
              // Continue to next folder
            }
          }
        } finally {
          try {
            await client.logout();
          } catch {
            // Ignore logout errors
          }
        }

        // Mark as idle
        await db.syncState.update({
          where: { id: syncState.id },
          data: {
            status: "idle",
            error: null,
            lastSyncCompletedAt: new Date(),
          },
        });

        console.log(`[sync] Account ${account.id} sync completed.`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[sync] Error syncing account ${account.id}:`,
          message,
        );

        await db.syncState.update({
          where: { id: syncState.id },
          data: { status: "error", error: message },
        }).catch(() => {
          // If we can't even update sync state, just log it
        });

        // Continue to next account
      }
    }

    // Wait 30 seconds before the next cycle (exit early on shutdown or pending trigger)
    if (!shutdownRequested) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SYNC_INTERVAL_MS);
        const check = setInterval(async () => {
          if (shutdownRequested) {
            clearTimeout(timer);
            clearInterval(check);
            resolve();
            return;
          }
          // Break out early when a manual trigger sets status to "pending"
          const pending = await db.syncState.findFirst({
            where: { status: "pending" },
            select: { id: true },
          });
          if (pending) {
            clearTimeout(timer);
            clearInterval(check);
            resolve();
          }
        }, 1_000);
      });
    }
  }

  console.log("[sync] Worker stopped.");
}

/**
 * Register graceful shutdown handlers. Finish the current account, then exit.
 */
export function registerShutdownHandlers(): void {
  const handler = () => {
    if (shutdownRequested) {
      console.log("[sync] Forced shutdown.");
      process.exit(1);
    }
    console.log("[sync] Shutdown requested — finishing current account…");
    shutdownRequested = true;
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
