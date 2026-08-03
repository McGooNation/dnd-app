// Rate limiting for real-time (Socket.io) actions.
//
// express-rate-limit (used for the plain REST endpoints in index.js) only
// works for regular HTTP requests — it has no concept of a live WebSocket
// connection. This is the equivalent for socket events: a small in-memory
// counter per (action, connection), built the same simple way the rest of
// this server's in-memory state already works (see the `rooms` and
// `pendingJoins` maps in index.js) — no new dependency needed for this half.

// key -> array of timestamps (ms) of recent actions under that key.
const hits = new Map();

/** Returns true if the action identified by `key` is allowed right now,
 * given at most `limit` actions per `windowMs` milliseconds — and records
 * this attempt if so. Returns false, without recording it, if the caller is
 * currently over the limit for that key. */
function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// Periodic cleanup so entries for disconnected players don't sit in memory
// forever — this server should never permanently store rate-limit history,
// only enough to enforce the current window. Runs infrequently and is cheap;
// .unref() so it never keeps the process alive by itself.
const STALE_AFTER_MS = 10 * 60 * 1000;
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of hits) {
    const recent = timestamps.filter((t) => now - t < STALE_AFTER_MS);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}, 5 * 60 * 1000);
if (sweepInterval.unref) sweepInterval.unref();

module.exports = { checkRateLimit };
