// Persistent lobby storage: one JSON file per persistent lobby, containing
// its full chat history, dice roll history, and a `state` object reserved
// for future features (maps, tokens, initiative, character sheets, notes,
// inventory) so they can be added later without a schema redesign — each
// future feature just claims its own key inside `state`.
//
// Guest-created (ephemeral) lobbies never touch this file — they stay purely
// in-memory in server/index.js exactly as before.
//
// Like userStore.js, this is a lightweight local file store, not a real
// database: fine for trying this out, not safe for concurrent write load at
// scale. Swapping it for a real database later shouldn't require changing
// the functions below much, since callers only use this module's API.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data", "lobbies");
// Where a one-time snapshot of pre-migration lobby files is kept.
// Deliberately OUTSIDE server/data/ entirely (not just a sibling of
// DATA_DIR) — server/data/ is the folder that holds every piece of
// persistent TavernTable data (accounts, live lobbies, lookup indexes) and
// is exactly what an eventual backup routine would target; a one-time
// migration safety copy has no business living inside the thing being
// backed up, or it'd get swept into every future backup as a confusing,
// ever-present nested duplicate. Nothing in this file ever reads, modifies,
// or deletes this folder once it's created, and the 45-day cleanup sweep
// never looks outside DATA_DIR, so it was never at risk either way — this
// is purely about keeping "the data that needs backing up" unambiguous.
const BACKUP_DIR = path.join(__dirname, "migration-backups", "lobbies-before-id-migration");
const INVITE_INDEX_FILE = path.join(__dirname, "data", "invite-index.json");
// Maps a table's display name (exact text, case-insensitive) to the random
// internal ID that actually identifies its stored data. This is what lets
// "type a table name to join/create it" keep working exactly as before,
// while the file on disk is never named from the display name itself —
// see the file-level comment further down for why that distinction matters.
const NAME_INDEX_FILE = path.join(__dirname, "data", "lobby-name-index.json");

// Internal lobby IDs are random and completely independent of the display
// name a player types — e.g. "lobby_8f72c91a4b3d91ef". This is what makes
// two different table names (or even two identical ones — see createLobby)
// permanently unable to collide into the same stored file, which is exactly
// the problem this file's storage format previously had.
const INTERNAL_ID_PREFIX = "lobby_";
const INTERNAL_ID_BYTES = 8; // 16 hex characters after the prefix

// Alphanumeric, uppercase, with visually ambiguous characters removed
// (0/O, 1/I/L) so a code read aloud or handwritten isn't confusable.
// 32 characters ^ 10 length is astronomically hard to guess.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 10;

// Retention period is configurable, not hardcoded, so it can be changed
// later without touching code — see README for the environment variables.
const RETENTION_DAYS = parseInt(process.env.LOBBY_RETENTION_DAYS, 10) || 45;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

// Caps applied to chat/roll history so a long-lived lobby's file doesn't
// grow without bound. Oldest entries are trimmed once a lobby exceeds these.
const MAX_STORED_MESSAGES = 500;
const MAX_STORED_ROLLS = 500;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** Generates a single random invite code. Uses crypto.randomBytes (not
 * Math.random) specifically because these codes need to be genuinely hard
 * to guess, not just "look random." */
function generateInviteCode() {
  const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

/** Generates a random internal lobby ID. Uses crypto.randomBytes (not
 * Math.random or a transformation of the display name) specifically so it
 * can never collide with — or be derived from — anything a user typed. */
function generateInternalId() {
  return INTERNAL_ID_PREFIX + crypto.randomBytes(INTERNAL_ID_BYTES).toString("hex");
}

/** Generates an internal ID and confirms no file already claims it — collisions
 * are practically impossible at this length, but the check costs nothing,
 * matching the same defensive pattern used for invite codes below. */
function generateUniqueInternalId() {
  ensureDir();
  let id;
  do {
    id = generateInternalId();
  } while (fs.existsSync(path.join(DATA_DIR, `${id}.json`)));
  return id;
}

function loadNameIndex() {
  ensureDir();
  if (!fs.existsSync(NAME_INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(NAME_INDEX_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveNameIndex(index) {
  ensureDir();
  fs.writeFileSync(NAME_INDEX_FILE, JSON.stringify(index, null, 2));
}

/** Case-insensitive, trimmed — matches the case-insensitivity the old
 * filename-sanitizing approach had (it lowercased before sanitizing), so
 * "Friday Night" and "FRIDAY NIGHT" still resolve to the same table, exactly
 * as before. The lobby's own displayed name keeps whatever casing was typed
 * — this key is only ever used internally, for the lookup itself. */
function nameIndexKey(name) {
  return String(name).trim().toLowerCase();
}

function registerName(name, internalId) {
  const index = loadNameIndex();
  index[nameIndexKey(name)] = internalId;
  saveNameIndex(index);
}

function unregisterName(name) {
  if (!name) return;
  const index = loadNameIndex();
  delete index[nameIndexKey(name)];
  saveNameIndex(index);
}

function resolveNameToInternalId(name) {
  const index = loadNameIndex();
  return index[nameIndexKey(name)] || null;
}

function loadInviteIndex() {
  ensureDir();
  if (!fs.existsSync(INVITE_INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(INVITE_INDEX_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveInviteIndex(index) {
  ensureDir();
  fs.writeFileSync(INVITE_INDEX_FILE, JSON.stringify(index, null, 2));
}

/** Generates a code and confirms (cheaply, defensively) it isn't already in
 * use — collisions are practically impossible at this code length, but the
 * check costs nothing. */
function generateUniqueInviteCode() {
  const index = loadInviteIndex();
  let code;
  do {
    code = generateInviteCode();
  } while (index[code]);
  return code;
}

function registerInviteCode(code, roomId) {
  const index = loadInviteIndex();
  index[code] = roomId;
  saveInviteIndex(index);
}

function unregisterInviteCode(code) {
  if (!code) return;
  const index = loadInviteIndex();
  delete index[code];
  saveInviteIndex(index);
}

/** Resolves an invite code to its lobby, or null if the code is unknown, the
 * lobby no longer exists, or the lobby has been closed by its owner —
 * all three cases an invite link should treat as "not available." Goes
 * straight to the lobby's internal ID — never through its display name —
 * so the invite keeps working correctly even in the (normally impossible,
 * but worth being robust against) case of two lobbies ever sharing a name. */
function getLobbyByInviteCode(code) {
  if (!code) return null;
  const index = loadInviteIndex();
  const internalId = index[code];
  if (!internalId) return null;
  const lobby = loadLobbyByInternalId(internalId);
  if (!lobby || lobby.inviteCode !== code) return null;
  return lobby;
}

/** A lobby's file is always named directly from its internal ID — never
 * from anything a user typed. That's what makes two different (or even
 * identical) display names permanently unable to collide into the same
 * file, which was the actual bug: sanitizing a display name into a filename
 * loses information, so different names could sanitize to the same result. */
function fileNameFor(internalId) {
  return path.join(DATA_DIR, `${internalId}.json`);
}

/** Fills in defaults for fields that didn't exist before this feature, so
 * lobbies created by earlier versions of the app keep working unchanged
 * (they behave as public + auto-join, matching their old "anyone can join" behavior). */
function normalizeLobby(lobby) {
  const lastActivityAt = lobby.lastActivityAt || lobby.updatedAt || lobby.createdAt || Date.now();
  return {
    ...lobby,
    visibility: lobby.visibility || "public",
    joinPolicy: lobby.joinPolicy || "auto",
    maxPlayers: lobby.maxPlayers ?? null,
    creatorDisplayName: lobby.creatorDisplayName || lobby.ownerName,
    closed: lobby.closed || false,
    members: lobby.members || [
      { accountId: lobby.ownerId, name: lobby.ownerName, role: "owner", joinedAt: lobby.createdAt },
    ],
    joinRequests: lobby.joinRequests || [],
    state: lobby.state || {},
    lastActivityAt,
    expiresAt: lobby.expiresAt || lastActivityAt + RETENTION_MS,
    status: lobby.status || "active",
  };
}

/** Loads a lobby directly by its internal ID — used wherever the caller
 * already has the ID (invite resolution, cleanup) and doesn't need to go
 * through the display-name lookup at all. */
function loadLobbyByInternalId(internalId) {
  ensureDir();
  if (!internalId) return null;
  const file = fileNameFor(internalId);
  if (!fs.existsSync(file)) return null;
  try {
    const lobby = normalizeLobby(JSON.parse(fs.readFileSync(file, "utf-8")));
    // Defensive check for future soft-delete/archiving modes — deletion in
    // this version physically removes the file, so this rarely triggers today.
    if (lobby.status !== "active") return null;
    return lobby;
  } catch {
    return null;
  }
}

/** Returns the lobby record for a given display name (what every caller in
 * server/index.js has always called "roomId"), or null. Resolves the name
 * to its internal storage ID first via the name index — this indirection is
 * what lets "type a table name to join/create it" keep working exactly as
 * it always has, while the actual file is never named from that text. */
function loadLobby(roomId) {
  const internalId = resolveNameToInternalId(roomId);
  if (!internalId) return null;
  return loadLobbyByInternalId(internalId);
}

/** Every save represents a real, meaningful mutation (chat, roll, initiative,
 * battle map, join, etc. — see server/index.js) since nothing calls this for
 * purely local/UI-only changes. So refreshing activity here, in one place,
 * is what makes every one of those events "count" without touching each
 * call site individually. */
function saveLobby(lobby) {
  ensureDir();
  const now = Date.now();
  lobby.updatedAt = now;
  lobby.lastActivityAt = now;
  lobby.expiresAt = now + RETENTION_MS;
  fs.writeFileSync(fileNameFor(lobby.internalId), JSON.stringify(lobby, null, 2));
}

/** Explicitly refreshes activity for an existing lobby without any other
 * change — used when someone joins an already-existing persistent lobby,
 * which otherwise never writes to that lobby's file. Also backfills an
 * invite code for any lobby that predates this feature, using this same
 * write rather than a separate one. */
function touchActivity(roomId) {
  const lobby = loadLobby(roomId);
  if (!lobby) return;
  if (!lobby.inviteCode) {
    lobby.inviteCode = generateUniqueInviteCode();
    registerInviteCode(lobby.inviteCode, lobby.internalId);
  }
  saveLobby(lobby);
}

/** Creates a new persistent lobby record. Call this only once, when the first
 * (authenticated) joiner creates the room. `options` lets the creator set
 * visibility/join policy/max players at creation time; all are optional and
 * default to the most open settings (public, auto-join, no cap). */
function createLobby(roomId, owner, options = {}) {
  const now = Date.now();
  const internalId = generateUniqueInternalId();
  const inviteCode = generateUniqueInviteCode();
  const lobby = {
    internalId, // the true, permanent storage identity — never derived from the name below
    id: roomId, // the display name as typed — used for showing/finding the lobby by name, never for storage
    ownerId: owner.id,
    ownerName: owner.name, // permanent account name — never exposed publicly
    creatorDisplayName: options.creatorDisplayName || owner.name, // the lobby-specific name shown to others
    visibility: options.visibility === "private" ? "private" : "public",
    joinPolicy: options.joinPolicy === "approval" ? "approval" : "auto",
    maxPlayers: typeof options.maxPlayers === "number" && options.maxPlayers > 0 ? options.maxPlayers : null,
    closed: false,
    status: "active",
    inviteCode,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    expiresAt: now + RETENTION_MS,
    messages: [],
    rolls: [],
    state: {}, // reserved for future features — see file header comment
    // members/roles: the extensibility point for future roles like co-DM or
    // moderator — see server/permissions.js. Only "owner" exists today.
    members: [{ accountId: owner.id, name: owner.name, role: "owner", joinedAt: now }],
    joinRequests: [],
  };
  saveLobby(lobby);
  registerName(roomId, internalId);
  registerInviteCode(inviteCode, internalId);
  return lobby;
}

function appendMessage(roomId, message) {
  const lobby = loadLobby(roomId);
  if (!lobby) return; // not a persistent lobby, nothing to do
  lobby.messages.push(message);
  if (lobby.messages.length > MAX_STORED_MESSAGES) {
    lobby.messages = lobby.messages.slice(-MAX_STORED_MESSAGES);
  }
  saveLobby(lobby);
}

function appendRoll(roomId, roll) {
  const lobby = loadLobby(roomId);
  if (!lobby) return;
  lobby.rolls.push(roll);
  if (lobby.rolls.length > MAX_STORED_ROLLS) {
    lobby.rolls = lobby.rolls.slice(-MAX_STORED_ROLLS);
  }
  saveLobby(lobby);
}

function isMember(lobby, accountId) {
  return !!accountId && lobby.members.some((m) => m.accountId === accountId);
}

/** Adds a pending join request and returns it. */
function addJoinRequest(roomId, { id, accountId, name }) {
  const lobby = loadLobby(roomId);
  if (!lobby) return null;
  const request = { id, accountId: accountId || null, name, status: "pending", requestedAt: Date.now() };
  lobby.joinRequests.push(request);
  saveLobby(lobby);
  return request;
}

function getPendingJoinRequests(roomId) {
  const lobby = loadLobby(roomId);
  if (!lobby) return [];
  return lobby.joinRequests.filter((r) => r.status === "pending");
}

/** Marks a join request approved or declined. On approval, also adds the
 * requester as a lobby member (role "player") so future joins skip the
 * approval step — matching "approved once, welcome back anytime". */
function resolveJoinRequest(roomId, requestId, approve) {
  const lobby = loadLobby(roomId);
  if (!lobby) return null;
  const request = lobby.joinRequests.find((r) => r.id === requestId);
  if (!request) return null;
  request.status = approve ? "approved" : "declined";
  if (approve && request.accountId && !isMember(lobby, request.accountId)) {
    lobby.members.push({ accountId: request.accountId, name: request.name, role: "player", joinedAt: Date.now() });
  }
  saveLobby(lobby);
  return request;
}

function closeLobby(roomId) {
  const lobby = loadLobby(roomId);
  if (!lobby) return null;
  lobby.closed = true;
  saveLobby(lobby);
  return lobby;
}

/** Persists initiative tracker state into the lobby's reserved `state` field.
 * No-ops for ephemeral (non-persistent) lobbies, since loadLobby returns null
 * for those — callers only call this when room.lobbyId is set. */
function saveInitiativeState(roomId, initiativeState) {
  const lobby = loadLobby(roomId);
  if (!lobby) return;
  lobby.state.initiative = initiativeState;
  saveLobby(lobby);
}

/** Persists battle map state (mode, uploaded image, tokens) into the
 * lobby's reserved `state` field, same pattern as initiative. */
function saveBattleMapState(roomId, battleMapState) {
  const lobby = loadLobby(roomId);
  if (!lobby) return;
  lobby.state.battleMap = battleMapState;
  saveLobby(lobby);
}

/** Public-safe summary for the browse list — deliberately omits ownerId,
 * ownerName, messages, rolls, members, and joinRequests. */
function toPublicSummary(lobby, currentPlayers) {
  return {
    id: lobby.id,
    currentPlayers,
    maxPlayers: lobby.maxPlayers,
    creatorDisplayName: lobby.creatorDisplayName,
    joinPolicy: lobby.joinPolicy,
  };
}

/** Lists all public, non-closed lobbies. `getCurrentPlayers` lets the caller
 * supply live in-memory player counts (this store has no concept of who's
 * currently connected — that lives in server/index.js). */
function listPublicLobbies(getCurrentPlayers) {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const results = [];
  for (const file of files) {
    try {
      const lobby = normalizeLobby(JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")));
      if (lobby.visibility === "public" && !lobby.closed) {
        results.push(toPublicSummary(lobby, getCurrentPlayers(lobby.id)));
      }
    } catch {
      // skip unreadable files rather than failing the whole listing
    }
  }
  return results;
}

/** Returns the internal IDs of every lobby whose lastActivityAt is older
 * than the given retention window. Used by the cleanup sweep — see
 * server/cleanup.js. Returns internal IDs, not display names, so cleanup
 * always targets the exact right lobby even if another lobby happens to
 * share its name. */
function listExpiredLobbyIds(retentionMs) {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const now = Date.now();
  const expired = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));
      const lastActivity = raw.lastActivityAt || raw.updatedAt || raw.createdAt || 0;
      if (now - lastActivity > retentionMs) expired.push(raw.internalId);
    } catch {
      // skip unreadable files — not this sweep's job to fix corrupt data
    }
  }
  return expired;
}

/** Permanently deletes a lobby and everything in it (chat, rolls, initiative,
 * battle map, tokens) — it's all one file, so this is one unlink. Also
 * unregisters its invite code and its display-name lookup entry, which is
 * what makes the invite link — and the name — stop pointing anywhere the
 * moment the lobby is gone. Takes the internal ID, not the display name.
 * Returns the deleted lobby record (so callers can still log something
 * friendlier than a raw ID), or null if it was already gone. */
function deleteLobby(internalId) {
  const lobby = loadLobbyByInternalId(internalId);
  if (lobby?.inviteCode) unregisterInviteCode(lobby.inviteCode);
  if (lobby?.id) unregisterName(lobby.id);
  const file = fileNameFor(internalId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return lobby;
}

module.exports = {
  loadLobby,
  createLobby,
  appendMessage,
  appendRoll,
  isMember,
  addJoinRequest,
  getPendingJoinRequests,
  resolveJoinRequest,
  closeLobby,
  listPublicLobbies,
  saveInitiativeState,
  saveBattleMapState,
  touchActivity,
  listExpiredLobbyIds,
  deleteLobby,
  getLobbyByInviteCode,
  RETENTION_DAYS,
  RETENTION_MS,
};

// --- One-time migration to internal-ID-based storage ---
//
// Lobbies created before this fix are stored in files named directly from
// their (sanitized) display name — the exact problem described at the top
// of this file. This converts every such file to the new format: give it a
// random internal ID, save its entire, unmodified content under a filename
// based on that ID, and remove the old file. Nothing about the lobby's
// actual data — chat, rolls, initiative, map, tokens, privacy settings,
// members — is read, changed, or reinterpreted; it's carried over exactly
// as-is inside the same JSON object, just relocated.
//
// Safety properties, since this runs automatically on every server start:
//  - Cheap no-op once everything is migrated: the very first check (does
//    this file already have an internalId?) short-circuits with no writes.
//  - A backup of every pre-migration file is made once, into a sibling
//    folder cleanup never looks at, before any file is touched — and is
//    never written to or deleted again afterward by anything in this app.
//  - Crash-safe / safe to interrupt and re-run: if the process dies after a
//    new internalId file is written but before the old file is removed,
//    re-running won't create a second internalId file for the same lobby —
//    it recognizes the leftover old file (by matching display name) as
//    already migrated and just removes it.

function backupLegacyDataIfNeeded() {
  if (fs.existsSync(BACKUP_DIR)) return; // a backup from a previous run already exists — never touch it again
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      fs.copyFileSync(path.join(DATA_DIR, file), path.join(BACKUP_DIR, file));
    }
    if (fs.existsSync(INVITE_INDEX_FILE)) {
      fs.copyFileSync(INVITE_INDEX_FILE, path.join(BACKUP_DIR, "invite-index.json"));
    }
    console.log(`[lobbyStore] Backed up ${files.length} existing lobby file(s) to ${BACKUP_DIR} before migrating storage format.`);
  } catch (err) {
    // "If the current environment allows it" — if backup fails (e.g. a
    // permissions issue), migration still proceeds, since it never deletes
    // a file's content without having already safely written it elsewhere
    // first. This is just an extra safety margin, not a hard requirement.
    console.warn(`[lobbyStore] Could not create a pre-migration backup (continuing anyway): ${err.message}`);
  }
}

function migrateLegacyLobbies() {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));

  const legacyFiles = [];
  const migratedNameToId = new Map(); // display-name key -> internalId, for files that already have one
  for (const file of files) {
    const fullPath = path.join(DATA_DIR, file);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    } catch {
      continue; // don't let one corrupt file block startup or the rest of migration
    }
    if (raw.internalId) {
      if (raw.id) migratedNameToId.set(nameIndexKey(raw.id), raw.internalId);
    } else {
      legacyFiles.push({ fullPath, raw });
    }
  }

  if (legacyFiles.length === 0) return; // already fully migrated — the common case after the first run

  backupLegacyDataIfNeeded();

  const nameIndex = loadNameIndex();
  const inviteIndex = loadInviteIndex();
  let migratedCount = 0;

  for (const { fullPath, raw } of legacyFiles) {
    const nameKey = raw.id ? nameIndexKey(raw.id) : null;
    const existingInternalId = nameKey ? migratedNameToId.get(nameKey) : null;

    if (existingInternalId) {
      // A previous, interrupted migration attempt already produced a proper
      // internalId file for this exact lobby, and only failed to clean up
      // this old leftover afterward. Re-point the indexes at the surviving
      // file (in case that step was interrupted too) rather than assuming
      // it already happened, then remove the leftover. Never create a
      // second internalId file for the same lobby.
      nameIndex[nameKey] = existingInternalId;
      if (raw.inviteCode) inviteIndex[raw.inviteCode] = existingInternalId;
      fs.unlinkSync(fullPath);
      continue;
    }

    const internalId = generateUniqueInternalId();
    raw.internalId = internalId;
    fs.writeFileSync(fileNameFor(internalId), JSON.stringify(raw, null, 2));
    fs.unlinkSync(fullPath);

    if (nameKey) {
      nameIndex[nameKey] = internalId;
      migratedNameToId.set(nameKey, internalId);
    }
    if (raw.inviteCode) inviteIndex[raw.inviteCode] = internalId;
    migratedCount++;
  }

  saveNameIndex(nameIndex);
  saveInviteIndex(inviteIndex);
  console.log(`[lobbyStore] Migrated ${migratedCount} existing lobby file(s) to the new collision-proof storage format.`);
}

migrateLegacyLobbies();
