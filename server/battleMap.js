// Battle map state — pure functions only, mirrors server/initiative.js.
//
// State shape:
// {
//   mode: "grid" | "image",
//   imageDataUrl: string | null,   // set once an image is uploaded; retained
//                                    // even in "grid" mode so switching back
//                                    // to "image" doesn't require re-upload
//   tokens: [ Token, ... ]
// }
//
// Token shape — see server/index.js battlemap handlers and the plan
// explanation for why each reserved-but-unused field exists.

const { v4: uuid } = require("uuid");

// 5MB raw, as base64 (which adds ~33% overhead) — the client resizes/compresses
// images before upload (see apps/web/lib/resizeImage.ts and the mobile upload
// handler in App.tsx), so this is a backstop, not the primary size control.
const MAX_IMAGE_DATA_URL_LENGTH = 7_000_000;

// Real image validation goes by binary file signature ("magic bytes") — the
// first few bytes every file of a given format always starts with — rather
// than the MIME type or filename extension the client claims, both of which
// are just labels that could say anything regardless of the file's actual
// content. This uses only Node's built-in Buffer, deliberately avoiding an
// image-processing library (which tend to need native build tools — exactly
// the kind of thing that's caused install trouble on Windows before).
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/** Inspects the real bytes of a decoded file and returns its genuine MIME
 * type if it's one of the supported formats, or null otherwise. */
function detectImageFormat(buffer) {
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  if (buffer.length >= JPEG_SIGNATURE.length && buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  // WEBP files are a RIFF container: bytes 0-3 spell "RIFF", bytes 8-11 spell "WEBP".
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Validates an uploaded data URL by decoding it and checking its actual
 * binary content — never the client-supplied MIME type or a file extension.
 * Returns a freshly-rebuilt data URL using the REAL detected format (so
 * whatever gets stored and later displayed always accurately reflects its
 * own content, regardless of what the uploading client originally claimed),
 * or null if the size limit is exceeded or the content isn't a genuine,
 * supported image at all. */
function detectRealImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return null;

  // Only the "this is base64 data" shape matters here — the claimed type
  // between "data:" and ";base64," is intentionally not trusted or checked.
  const match = /^data:[^;,]*;base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;

  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length === 0) return null;

  const realFormat = detectImageFormat(buffer);
  if (!realFormat) return null;

  return `data:${realFormat};base64,${match[1]}`;
}

function isValidImageDataUrl(dataUrl) {
  return detectRealImageDataUrl(dataUrl) !== null;
}

// Mirrors packages/shared/src/tokenAppearance.ts — see that file's header
// comment for why these are duplicated rather than imported.
const PRESET_TOKEN_COLOR_HEXES = [
  "#e53935", "#7f1d1d", "#f97316", "#c9a227", "#eab308", "#84cc16", "#16a34a", "#14b8a6",
  "#06b6d4", "#38bdf8", "#3b82f6", "#8b5cf6", "#ec4899", "#92400e", "#f5f5f4", "#18181b",
];
const VALID_TOKEN_SIZES = ["small", "medium", "large"];

function defaultBattleMapState() {
  return { mode: "grid", imageDataUrl: null, tokens: [] };
}

function setMode(state, mode) {
  if (mode !== "grid" && mode !== "image") return;
  state.mode = mode;
}

/** Validates and stores an uploaded map image, auto-switching to image mode.
 * The validation happens (and the file is only ever stored) after
 * confirming the actual bytes are a genuine, supported image — see
 * detectRealImageDataUrl above. */
function setImage(state, imageDataUrl) {
  const verified = detectRealImageDataUrl(imageDataUrl);
  if (!verified) return false;
  state.imageDataUrl = verified;
  state.mode = "image";
  return true;
}

function blankTokenFields() {
  return { hp: null, maxHp: null, tempHp: null, conditions: [], imageUrl: null, size: "medium", notes: "" };
}

/** Adds a token for a connected player, or no-ops if they already have one —
 * "a player may only have one token" is enforced here via refId lookup. */
function addPlayerToken(state, { refId, name, color, ownerId }) {
  const existing = state.tokens.find((t) => t.type === "player" && t.refId === refId);
  if (existing) return existing;
  const token = {
    id: uuid(),
    name,
    type: "player",
    x: 50,
    y: 50,
    color,
    label: name,
    ownerId: ownerId || null,
    refId,
    ...blankTokenFields(),
  };
  state.tokens.push(token);
  return token;
}

/** Adds a monster or NPC token — no dedup, "Goblin 1" and "Goblin 2" are both fine. */
function addCustomToken(state, { name, type, color }) {
  const safeType = type === "npc" ? "npc" : "monster";
  const safeName = String(name).slice(0, 40);
  const token = {
    id: uuid(),
    name: safeName,
    type: safeType,
    x: 50,
    y: 50,
    color: color || (safeType === "npc" ? "#4a5d8f" : "#8b2635"),
    label: safeName,
    ownerId: null,
    refId: null,
    ...blankTokenFields(),
  };
  state.tokens.push(token);
  return token;
}

function removeToken(state, tokenId) {
  state.tokens = state.tokens.filter((t) => t.id !== tokenId);
}

/** Moves a token. Coordinates are a percentage (0-100) of the play area in
 * both axes — see file header for why, and the plan's note on grid snapping. */
function moveToken(state, tokenId, x, y) {
  const token = state.tokens.find((t) => t.id === tokenId);
  if (!token) return;
  if (typeof x === "number" && !Number.isNaN(x)) token.x = Math.max(0, Math.min(100, x));
  if (typeof y === "number" && !Number.isNaN(y)) token.y = Math.max(0, Math.min(100, y));
}

/** Updates a token's color and/or size. Both are validated against the
 * known preset lists — never trust the client, same principle as dice rolls.
 * Structured to accept other future fields (see Token's reserved fields)
 * the same way without needing a new function per field. */
function updateToken(state, tokenId, changes) {
  const token = state.tokens.find((t) => t.id === tokenId);
  if (!token) return false;
  let changed = false;
  if (typeof changes.color === "string" && PRESET_TOKEN_COLOR_HEXES.includes(changes.color)) {
    token.color = changes.color;
    changed = true;
  }
  if (typeof changes.size === "string" && VALID_TOKEN_SIZES.includes(changes.size)) {
    token.size = changes.size;
    changed = true;
  }
  return changed;
}

module.exports = {
  defaultBattleMapState,
  isValidImageDataUrl,
  setMode,
  setImage,
  addPlayerToken,
  addCustomToken,
  removeToken,
  moveToken,
  updateToken,
};
