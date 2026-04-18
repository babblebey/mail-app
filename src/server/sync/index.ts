/**
 * Standalone entry point for the background sync worker.
 *
 * Run with: pnpm sync
 * (which executes: tsx --env-file .env src/server/sync/index.ts)
 */

import { startSyncWorker, registerShutdownHandlers } from "./worker";

registerShutdownHandlers();

console.log("[sync] Starting background sync worker…");

startSyncWorker().catch((error) => {
  console.error("[sync] Fatal error:", error);
  process.exit(1);
});
