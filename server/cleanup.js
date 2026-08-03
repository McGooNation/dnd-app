// Automatic data retention cleanup.
//
// Runs inside the same long-running Node process as the rest of the server —
// no external cron or job queue needed for a single-server setup like this.
// Deleting a lobby's file removes everything in it (chat, rolls, initiative,
// battle map, tokens) in one step, since it's all one JSON file. Accounts,
// friends, and any other account-level data are never touched — this only
// ever looks at files under server/data/lobbies/.

const lobbyStore = require("./lobbyStore");

// How often the sweep runs — also configurable, not hardcoded. Defaults to
// every 6 hours, which is frequent enough that nothing sits around much
// past its retention window, and infrequent enough not to matter for
// performance (see the scaling note below).
const CLEANUP_INTERVAL_MS = parseInt(process.env.LOBBY_CLEANUP_INTERVAL_MS, 10) || 6 * 60 * 60 * 1000;

/** Finds and deletes every lobby that's had no activity for longer than the
 * retention period. Safe to call as often as you like — it's a no-op if
 * nothing has expired. */
function runCleanupSweep() {
  // These are internal storage IDs, not display names — see lobbyStore.js —
  // which is what guarantees cleanup only ever removes the exact lobby that
  // actually expired, even if another lobby happens to share its name.
  const expiredInternalIds = lobbyStore.listExpiredLobbyIds(lobbyStore.RETENTION_MS);
  for (const internalId of expiredInternalIds) {
    const deleted = lobbyStore.deleteLobby(internalId);
    console.log(`[cleanup] Deleted lobby "${deleted?.id || internalId}" — no activity for ${lobbyStore.RETENTION_DAYS}+ days.`);
  }
  if (expiredInternalIds.length > 0) {
    console.log(`[cleanup] Sweep complete — removed ${expiredInternalIds.length} lobby(ies).`);
  }
}

/** Starts the automatic cleanup schedule. Call this once at server startup. */
function startCleanupScheduler() {
  runCleanupSweep(); // catch anything that expired while the server was offline
  setInterval(runCleanupSweep, CLEANUP_INTERVAL_MS);
  console.log(
    `[cleanup] Scheduler started — retention ${lobbyStore.RETENTION_DAYS} day(s), sweeping every ${Math.round(
      CLEANUP_INTERVAL_MS / (60 * 60 * 1000)
    )}h.`
  );
}

module.exports = { startCleanupScheduler, runCleanupSweep };
