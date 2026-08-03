// A reasonable timeout for talking to the TavernTable server. Long enough
// that normal network conditions (including a slow mobile connection) never
// trip it by accident, short enough that nobody is left waiting forever if
// the server genuinely can't be reached.
const DEFAULT_TIMEOUT_MS = 10_000;

/** Shown whenever a request can't complete because the server can't be
 * reached at all — as opposed to the server responding with an actual error
 * (wrong password, lobby not found, etc.), which keeps its own specific
 * message. Deliberately generic and non-technical. */
export const CONNECTION_ERROR_MESSAGE =
  "Unable to connect to TavernTable. Please check your connection and try again.";

/**
 * Wraps the browser/runtime's fetch with a timeout, and turns any failure to
 * even get a response — server unreachable, request timed out, DNS failure,
 * dropped connection, etc. — into one consistent, friendly error rather than
 * whatever raw message the platform happens to throw (e.g. "Failed to
 * fetch", "Network request failed"). Once a response is actually received,
 * even an error one (401, 404, 500...), this behaves exactly like a normal
 * fetch — callers handle that the same way they always have.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    // Covers both "couldn't connect at all" and "timed out" (an abort also
    // surfaces here) — from the user's point of view these are the same
    // situation and deserve the same friendly message.
    throw new Error(CONNECTION_ERROR_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}
