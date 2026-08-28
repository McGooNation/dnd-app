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
const MAX_MAP_IMAGE_DATA_URL_LENGTH = 7_000_000;

// Token images are a much smaller visual element than the map background, so
// they get their own, much smaller limits — not the map's — per the plan.
// ~500KB raw, as base64.
const MAX_TOKEN_IMAGE_DATA_URL_LENGTH = 700_000;
const MAX_TOKEN_IMAGE_DIMENSION = 512; // px, either axis

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

/** Reads an image's actual pixel dimensions directly from its file header —
 * every format stores this near the start of the file, so this doesn't
 * require decoding/rendering the image (which would need a real image
 * library). Used so the server can independently verify processed token
 * images are genuinely within the size limit, never just trusting a
 * client's own resize step. Returns null if the dimensions can't be
 * determined (treated as invalid — better to reject than guess). */
function getImageDimensions(buffer, format) {
  try {
    if (format === "image/png") {
      // PNG: an 8-byte signature, then the IHDR chunk — width/height are the
      // first two 4-byte big-endian integers inside it, at a fixed offset.
      if (buffer.length < 24) return null;
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }

    if (format === "image/jpeg") {
      // JPEG: a sequence of markers. Dimensions live in the "start of frame"
      // marker (0xFFC0-0xFFCF, excluding the DHT/JPG-extension markers
      // 0xC4/0xC8/0xCC) — scan forward through markers until we find one.
      let offset = 2; // skip the initial 0xFFD8
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) return null; // malformed — not a marker where one was expected
        const marker = buffer[offset + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
      return null;
    }

    if (format === "image/webp") {
      // WEBP has three possible internal sub-formats, each with dimensions
      // stored differently — check the fourcc at byte 12 to know which.
      const subFormat = buffer.subarray(12, 16).toString("ascii");
      if (subFormat === "VP8 " && buffer.length >= 30) {
        // Lossy: 14-bit width/height, little-endian, at a fixed offset.
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      }
      if (subFormat === "VP8L" && buffer.length >= 25) {
        // Lossless: width/height are packed together into 4 bytes.
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (subFormat === "VP8X" && buffer.length >= 30) {
        // Extended: 24-bit width/height minus one, little-endian.
        const width = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
        const height = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
        return { width, height };
      }
      return null;
    }
  } catch {
    return null; // a truncated/malformed file — treat as unreadable, not a crash
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
function detectRealImageDataUrl(dataUrl, maxDataUrlLength) {
  if (typeof dataUrl !== "string" || dataUrl.length > maxDataUrlLength) return null;

  // Only the "this is base64 data" shape matters here — the claimed type
  // between "data:" and ";base64," is intentionally not trusted or checked.
  const match = /^data:[^;,]*;base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;

  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length === 0) return null;

  const realFormat = detectImageFormat(buffer);
  if (!realFormat) return null;

  return { dataUrl: `data:${realFormat};base64,${match[1]}`, format: realFormat, buffer };
}

function isValidImageDataUrl(dataUrl) {
  return detectRealImageDataUrl(dataUrl, MAX_MAP_IMAGE_DATA_URL_LENGTH) !== null;
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
  const verified = detectRealImageDataUrl(imageDataUrl, MAX_MAP_IMAGE_DATA_URL_LENGTH);
  if (!verified) return false;
  state.imageDataUrl = verified.dataUrl;
  state.mode = "image";
  return true;
}

/** Validates and stores an image for one specific token — a character
 * portrait, monster art, etc. — completely independent of the map's own
 * background image. Uses its own, much smaller limits (see the constants
 * above): the map is a full-screen background, a token image is a small
 * portrait, and treating them the same would let a single lobby's tokens
 * collectively balloon storage/bandwidth far beyond what a portrait
 * actually needs.
 *
 * Returns `{ ok: true, token }` on success, or `{ ok: false, reason }` with
 * a specific, user-facing reason on failure — deliberately more detailed
 * than the map image's plain true/false, since there are now several
 * distinct ways an upload can be rejected (bad format, too large, or too
 * high-resolution) and a specific reason is more helpful to show. */
function setTokenImage(state, tokenId, imageDataUrl) {
  const tok = state.tokens.find((t) => t.id === tokenId);
  if (!tok) return { ok: false, reason: "not_found" };

  const verified = detectRealImageDataUrl(imageDataUrl, MAX_TOKEN_IMAGE_DATA_URL_LENGTH);
  if (!verified) return { ok: false, reason: "invalid_or_too_large" };

  // Independently verify the PROCESSED image's actual pixel dimensions —
  // never just trust that the client really resized it before uploading.
  // This reads the real header bytes rather than decoding/rendering the
  // image, so it doesn't need an image-processing library.
  const dimensions = getImageDimensions(verified.buffer, verified.format);
  if (!dimensions || dimensions.width > MAX_TOKEN_IMAGE_DIMENSION || dimensions.height > MAX_TOKEN_IMAGE_DIMENSION) {
    return { ok: false, reason: "too_large_dimensions" };
  }

  // Replacing an existing image: the old data URL string is simply
  // overwritten here — there's only ever one copy of a token's image, never
  // an "original plus optimized" pair, and nothing keeps a reference to the
  // old value once this line runs.
  tok.imageUrl = verified.dataUrl;
  return { ok: true, token: tok };
}

/** Removes a token's image, reverting it to the existing initials/color
 * appearance — the token itself, and every other one of its properties,
 * is completely untouched. Returns the token, or null if it doesn't exist. */
function removeTokenImage(state, tokenId) {
  const tok = state.tokens.find((t) => t.id === tokenId);
  if (!tok) return null;
  tok.imageUrl = null;
  return tok;
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
 * both axes — see file header for why, and the plan's note on grid snapping.
 * Returns the token (with its final, clamped position) so callers can
 * broadcast exactly what was actually stored, or null if the token doesn't
 * exist. */
function moveToken(state, tokenId, x, y) {
  const token = state.tokens.find((t) => t.id === tokenId);
  if (!token) return null;
  if (typeof x === "number" && !Number.isNaN(x)) token.x = Math.max(0, Math.min(100, x));
  if (typeof y === "number" && !Number.isNaN(y)) token.y = Math.max(0, Math.min(100, y));
  return token;
}

/** Updates a token's color and/or size. Both are validated against the
 * known preset lists — never trust the client, same principle as dice rolls.
 * Structured to accept other future fields (see Token's reserved fields)
 * the same way without needing a new function per field. Returns the token
 * if something was actually changed (so callers can broadcast the real,
 * validated values — never whatever the client merely requested), or null
 * if the token doesn't exist or nothing valid was in `changes`. */
function updateToken(state, tokenId, changes) {
  const token = state.tokens.find((t) => t.id === tokenId);
  if (!token) return null;
  let changed = false;
  if (typeof changes.color === "string" && PRESET_TOKEN_COLOR_HEXES.includes(changes.color)) {
    token.color = changes.color;
    changed = true;
  }
  if (typeof changes.size === "string" && VALID_TOKEN_SIZES.includes(changes.size)) {
    token.size = changes.size;
    changed = true;
  }
  return changed ? token : null;
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
  setTokenImage,
  removeTokenImage,
};
