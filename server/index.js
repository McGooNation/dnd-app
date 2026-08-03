// Real-time server: room membership, chat relay, and server-authoritative dice rolls.
//
// NOTE: this file is plain JS (not TS) so it runs with zero build step via `node index.js`.
// The dice math here intentionally mirrors packages/shared/src/dice.ts — once you add a
// build step (tsx/ts-node, or compiling shared to JS) you should import directly from
// the shared package instead of duplicating this logic.

const express = require("express");
const http = require("http");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const { v4: uuid } = require("uuid");
const userStore = require("./userStore");
const auth = require("./auth");
const lobbyStore = require("./lobbyStore");
const permissions = require("./permissions");
const initiative = require("./initiative");
const battleMap = require("./battleMap");
const cleanup = require("./cleanup");
const { checkRateLimit } = require("./rateLimiter");

const PORT = process.env.PORT || 4000;

// --- CORS (which websites are allowed to talk to this server) ---
// Set APP_ORIGIN before deploying anywhere real — e.g.
// APP_ORIGIN=https://your-production-domain.com. Supports a comma-separated
// list in case more than one address ever needs access (e.g. a www and
// non-www variant). Without it (the default for local development), only
// the known local dev server addresses are allowed — never a wildcard.
// Note: this only affects browser (web app) requests — CORS is a browser
// protection and doesn't apply to the mobile app at all.
const PRODUCTION_ORIGINS = (process.env.APP_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const LOCAL_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const ALLOWED_ORIGINS = PRODUCTION_ORIGINS.length > 0 ? PRODUCTION_ORIGINS : LOCAL_DEV_ORIGINS;
const corsOptions = { origin: ALLOWED_ORIGINS };

// --- Rate limiting ---
// All limits are read from environment variables, with generous defaults
// chosen for a small application — easy to tighten or loosen later without
// touching code. These protect against automated abuse (repeated login
// guessing, mass account creation, spam) without getting in the way of
// normal play — see README.md for the exact numbers and reasoning.
const RATE_LIMITS = {
  login: { max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX, 10) || 10, windowMs: (parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MIN, 10) || 5) * 60 * 1000 },
  register: { max: parseInt(process.env.RATE_LIMIT_REGISTER_MAX, 10) || 5, windowMs: (parseInt(process.env.RATE_LIMIT_REGISTER_WINDOW_MIN, 10) || 60) * 60 * 1000 },
  invite: { max: parseInt(process.env.RATE_LIMIT_INVITE_MAX, 10) || 30, windowMs: (parseInt(process.env.RATE_LIMIT_INVITE_WINDOW_MIN, 10) || 1) * 60 * 1000 },
  roomJoin: { max: parseInt(process.env.RATE_LIMIT_ROOM_JOIN_MAX, 10) || 20, windowMs: (parseInt(process.env.RATE_LIMIT_ROOM_JOIN_WINDOW_SEC, 10) || 60) * 1000 },
  chat: { max: parseInt(process.env.RATE_LIMIT_CHAT_MAX, 10) || 15, windowMs: (parseInt(process.env.RATE_LIMIT_CHAT_WINDOW_SEC, 10) || 10) * 1000 },
  diceRoll: { max: parseInt(process.env.RATE_LIMIT_DICE_MAX, 10) || 20, windowMs: (parseInt(process.env.RATE_LIMIT_DICE_WINDOW_SEC, 10) || 10) * 1000 },
};

/** A friendly, non-technical message with no internal details — reused by
 * every REST rate limiter below so the response shape matches every other
 * error response in this API ({ message: "..." }), which the frontend
 * already knows how to display without any changes on its side. */
function rateLimitedResponse(actionDescription) {
  return {
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: `You're ${actionDescription} too quickly. Please wait a few minutes and try again.` },
  };
}

const loginLimiter = rateLimit({ windowMs: RATE_LIMITS.login.windowMs, max: RATE_LIMITS.login.max, ...rateLimitedResponse("attempting to log in") });
const registerLimiter = rateLimit({ windowMs: RATE_LIMITS.register.windowMs, max: RATE_LIMITS.register.max, ...rateLimitedResponse("creating accounts") });
const inviteLimiter = rateLimit({ windowMs: RATE_LIMITS.invite.windowMs, max: RATE_LIMITS.invite.max, ...rateLimitedResponse("checking invite links") });

const DIE_SIDES = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };
const PALETTE = ["#c9a227", "#8b2635", "#3f7a5c", "#4a5d8f", "#a45a3c", "#6b5b95"];
const CUSTOM_DICE_MIN_SIDES = 2;
const CUSTOM_DICE_MAX_SIDES = 1000;
const CUSTOM_DIE_PATTERN = /^d(\d+)$/i;

// Checks the preset table first, then falls back to parsing "dN" for custom
// dice (e.g. "d37"). Returns null if invalid or out of the allowed range.
// This is the server-authoritative check — the client can send anything,
// so nothing here is trusted without this validation.
function sidesFor(diceType) {
  if (DIE_SIDES[diceType] !== undefined) return DIE_SIDES[diceType];
  const match = CUSTOM_DIE_PATTERN.exec(String(diceType).trim());
  if (!match) return null;
  const sides = parseInt(match[1], 10);
  if (sides < CUSTOM_DICE_MIN_SIDES || sides > CUSTOM_DICE_MAX_SIDES) return null;
  return sides;
}

function rollOne(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/** Builds the roll request used by "Roll Initiative". Always 1d20 today;
 * takes a modifier so a future Dexterity bonus from a character sheet can be
 * passed in here later without changing anything that calls this function. */
function rollInitiativeRequest(modifier = 0) {
  return { diceType: "d20", count: 1, modifier };
}

function executeRoll(request) {
  const sides = sidesFor(request.diceType);
  if (sides === null) {
    throw new Error(
      `Invalid dice type "${request.diceType}". Use a preset or a custom die like "d37" between d${CUSTOM_DICE_MIN_SIDES} and d${CUSTOM_DICE_MAX_SIDES}.`
    );
  }
  const count = Math.max(1, Math.min(request.count || 1, 100));
  const modifier = request.modifier || 0;

  if (request.mode === "advantage" || request.mode === "disadvantage") {
    const a = rollOne(sides);
    const b = rollOne(sides);
    const chosen = request.mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
    return { rolls: [a, b], total: chosen + modifier };
  }

  const rolls = Array.from({ length: count }, () => rollOne(sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  return { rolls, total };
}

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Account endpoints ---
// These are entirely separate from the Socket.io room/chat/dice logic below —
// guests never touch these routes and can keep joining rooms exactly as before.

app.post("/auth/register", registerLimiter, async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ message: "email, password, and name are required." });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }
  try {
    const user = await userStore.createUser({ email: String(email).trim(), password, name: String(name).trim().slice(0, 40) });
    const token = auth.signToken(user);
    res.status(201).json({ token, user: userStore.toPublic(user) });
  } catch (err) {
    res.status(409).json({ message: err.message });
  }
});

app.post("/auth/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? userStore.findByEmail(email) : null;
  const valid = user && (await userStore.verifyPassword(user, password || ""));
  if (!valid) {
    return res.status(401).json({ message: "Invalid email or password." });
  }
  const token = auth.signToken(user);
  res.json({ token, user: userStore.toPublic(user) });
});

app.get("/auth/me", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token && auth.verifyToken(token);
  const user = payload && userStore.findById(payload.sub);
  if (!user) return res.status(401).json({ message: "Invalid or expired session." });
  res.json({ user: userStore.toPublic(user) });
});

// --- Public lobby browsing ---
// Only logged-in users can browse, per spec. Player counts come from the
// live in-memory room store below, not from the saved lobby file.
app.get("/lobbies/public", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token && auth.verifyToken(token);
  if (!payload) return res.status(401).json({ message: "Log in to browse public lobbies." });

  const lobbies = lobbyStore.listPublicLobbies((roomId) => rooms.get(roomId)?.users.size || 0);
  res.json({ lobbies });
});

// --- Invite links ---
// No auth required here — resolving an invite is exactly how a logged-out
// visitor is meant to reach a lobby (they authenticate afterward, on the
// join page). The actual admission still goes through the normal room:join
// socket flow, with all of its approval/visibility/ownership rules intact —
// this endpoint only ever answers "which lobby does this code mean?".
app.get("/invites/:code", inviteLimiter, (req, res) => {
  const lobby = lobbyStore.getLobbyByInviteCode(req.params.code);
  if (!lobby) {
    return res.status(404).json({ valid: false, reason: "not_found" });
  }
  if (lobby.closed) {
    return res.status(410).json({ valid: false, reason: "closed" });
  }
  res.json({
    valid: true,
    roomId: lobby.id,
    lobbyName: lobby.id,
    visibility: lobby.visibility,
    joinPolicy: lobby.joinPolicy,
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  // Socket.io's own default per-message size limit (1MB) is smaller than
  // the battle map upload limit this app already enforces (5MB raw, checked
  // in server/battleMap.js) — without raising this, an oversized upload
  // would silently disconnect the whole connection before the application's
  // own size/validity check ever got a chance to run and give a friendly
  // rejection message instead. This is generous enough for a real upload
  // plus its small JSON wrapper, while still being a real, bounded limit.
  maxHttpBufferSize: 8_000_000,
  // `cors` above controls response headers, which matters for the polling
  // transport — but a direct WebSocket upgrade needs the connection attempt
  // itself rejected to actually be blocked. This explicitly checks the
  // Origin header on every incoming connection, same allowed-origins list.
  // No Origin header at all (a non-browser client, e.g. the mobile app,
  // which doesn't send one) is let through — Origin/CORS is a browser-only
  // concept, so there's nothing meaningful to check for those.
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    if (!origin) return callback(null, true);
    callback(null, ALLOWED_ORIGINS.includes(origin));
  },
});

// In-memory room store. Swap for a real database before shipping —
// this resets whenever the server restarts and won't scale past one process.
// Shape: roomId -> { users: Map<socketId, User>, lobbyId: string|null }
const rooms = new Map();

// Sockets waiting on a pending join request, keyed by requestId.
// Purely in-memory/transient — if a requester disconnects while waiting,
// an owner approving later just adds them as a member for next time (see
// lobbyStore.resolveJoinRequest) rather than trying to admit a dead socket.
const pendingJoins = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { users: new Map(), lobbyId: null, initiative: null, battleMap: null });
  return rooms.get(roomId);
}

function roomStatePayload(roomId) {
  const room = rooms.get(roomId);
  const lobby = room?.lobbyId ? lobbyStore.loadLobby(room.lobbyId) : null;
  return {
    roomId,
    users: room ? Array.from(room.users.values()) : [],
    persistent: !!room?.lobbyId,
    ownerId: lobby?.ownerId ?? null,
    visibility: lobby?.visibility ?? null,
    joinPolicy: lobby?.joinPolicy ?? null,
    maxPlayers: lobby?.maxPlayers ?? null,
    inviteCode: lobby?.inviteCode ?? null,
  };
}

/** Actually adds someone to a room's live state and sends them history if
 * it's a persistent lobby. Used both for instant joins and for joins that
 * just got approved — the end result is identical either way. `lobby` is
 * the already-loaded lobby record, or null for an ephemeral guest room. */
function admitToRoom(socket, roomId, name, lobby, accountId) {
  const room = getOrCreateRoom(roomId);
  room.lobbyId = lobby ? roomId : null;
  if (lobby) {
    // "A player joins the lobby" counts as activity. This is the one join
    // path that wouldn't otherwise touch the lobby's file — every other
    // meaningful action already writes to disk via its own save call, which
    // is where activity gets refreshed (see saveLobby in lobbyStore.js).
    lobbyStore.touchActivity(roomId);
  }
  if (room.initiative === null) {
    room.initiative = (lobby && lobby.state && lobby.state.initiative) || initiative.defaultInitiativeState();
  }
  if (room.battleMap === null) {
    room.battleMap = (lobby && lobby.state && lobby.state.battleMap) || battleMap.defaultBattleMapState();
  }

  const user = {
    id: socket.id,
    name: String(name).slice(0, 40),
    color: PALETTE[room.users.size % PALETTE.length],
  };
  room.users.set(socket.id, user);
  socket.data.roomId = roomId;
  // Lets other handlers (e.g. targeting a join-request notification to just
  // the lobby owner, not everyone in the room) identify which connected
  // socket belongs to which account, without re-verifying a token each time.
  socket.data.accountId = accountId || null;
  socket.join(roomId);

  if (lobby) {
    socket.emit("room:history", { messages: lobby.messages, rolls: lobby.rolls });
  }
  socket.emit("initiative:state", room.initiative);
  socket.emit("battlemap:state", room.battleMap);

  io.to(roomId).emit("room:state", roomStatePayload(roomId));
}

/** Broadcasts the current initiative state to everyone in the room and, for
 * persistent lobbies, saves it — mirrors how chat/rolls are persisted. */
function syncInitiative(room, roomId) {
  io.to(roomId).emit("initiative:state", room.initiative);
  if (room.lobbyId) lobbyStore.saveInitiativeState(room.lobbyId, room.initiative);
}

/** Same idea as syncInitiative, for the battle map. `persist` defaults to
 * true — every existing caller keeps writing to disk exactly as before.
 * Live token-drag updates are the one case that passes persist=false, so
 * intermediate drag frames broadcast instantly but never touch the disk
 * (see battlemap:moveToken below) — only the final position, and every
 * other mutation, gets saved. */
function syncBattleMap(room, roomId, persist = true) {
  io.to(roomId).emit("battlemap:state", room.battleMap);
  if (persist && room.lobbyId) lobbyStore.saveBattleMapState(room.lobbyId, room.battleMap);
}

/** Resolves the caller's role for initiative purposes only. Falls back to
 * "member" for guests and for logged-in users without an elevated lobby
 * role — that's what currently makes initiative editable by everyone.
 * Deliberately separate from permissions.roleFor's normal (null-on-unknown)
 * behavior, which is still used unchanged for the owner-only actions below. */
function initiativeRole(lobby, token) {
  if (!lobby) return "member";
  const payload = token && auth.verifyToken(token);
  const account = payload && userStore.findById(payload.sub);
  const explicitRole = account && permissions.roleFor(lobby, account.id);
  return explicitRole || "member";
}

/** Identical resolution logic to initiativeRole, kept as its own function
 * (rather than reused) so battle-map permission changes can never
 * accidentally affect initiative permission behavior, or vice versa. */
function battleMapRole(lobby, token) {
  if (!lobby) return "member";
  const payload = token && auth.verifyToken(token);
  const account = payload && userStore.findById(payload.sub);
  const explicitRole = account && permissions.roleFor(lobby, account.id);
  return explicitRole || "member";
}

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId, name, token, visibility, joinPolicy, maxPlayers }) => {
    if (!checkRateLimit(`roomJoin:${socket.id}`, RATE_LIMITS.roomJoin.max, RATE_LIMITS.roomJoin.windowMs)) {
      socket.emit("error:message", { message: "You're joining/creating tables too quickly. Please wait a moment and try again." });
      return;
    }
    if (!roomId || !name) {
      socket.emit("error:message", { message: "roomId and name are required to join." });
      return;
    }
    const isFirstJoinerThisSession = !rooms.has(roomId);
    const payload = token && auth.verifyToken(token);
    const account = payload && userStore.findById(payload.sub);

    // --- Lobby persistence & creation ---
    // Whether a lobby is persistent is determined by whether a saved file
    // already exists for it (so "reopening it later" works even after the
    // server restarted), not by anything about the current session.
    let lobby = lobbyStore.loadLobby(roomId);
    if (!lobby && isFirstJoinerThisSession && account) {
      // Nobody has ever made this table persistent yet, and its creator is
      // logged in — this is the moment it becomes persistent. Visibility/
      // joinPolicy/maxPlayers are only used here, at creation time.
      lobby = lobbyStore.createLobby(
        roomId,
        { id: account.id, name: account.name },
        { visibility, joinPolicy, maxPlayers, creatorDisplayName: name }
      );
    }

    if (lobby?.closed) {
      socket.emit("error:message", { message: "This lobby has been closed by its owner." });
      return;
    }

    if (lobby) {
      const isOwner = account && account.id === lobby.ownerId;
      const isExistingMember = account && lobbyStore.isMember(lobby, account.id);
      const requiresApproval = !isOwner && !isExistingMember && (lobby.visibility === "private" || lobby.joinPolicy === "approval");

      if (!isOwner && lobby.maxPlayers) {
        const currentCount = rooms.get(roomId)?.users.size || 0;
        if (currentCount >= lobby.maxPlayers) {
          socket.emit("error:message", { message: "This lobby is full." });
          return;
        }
      }

      if (requiresApproval) {
        const requestId = uuid();
        lobbyStore.addJoinRequest(roomId, { id: requestId, accountId: account?.id, name: String(name).slice(0, 40) });
        pendingJoins.set(requestId, { socket, roomId });
        socket.emit("room:joinPending", { requestId });

        // Notify the owner live, if they're currently connected to this room
        // — and only the owner. Previously this was sent to everyone in the
        // room (relying on the client to hide it from non-owners); it's now
        // targeted server-side at whichever connected socket(s) actually
        // belong to the owner's account, so no other player's client ever
        // receives this requester's name or the fact that a request exists.
        const room = rooms.get(roomId);
        if (room && lobby.ownerId) {
          for (const [socketId] of room.users) {
            const memberSocket = io.sockets.sockets.get(socketId);
            if (memberSocket && memberSocket.data.accountId === lobby.ownerId) {
              memberSocket.emit("lobby:joinRequest", { requestId, name: String(name).slice(0, 40), requestedAt: Date.now() });
            }
          }
        }
        return;
      }
    }

    admitToRoom(socket, roomId, name, lobby, account?.id);
  });

  socket.on("room:leave", ({ roomId }) => {
    leaveRoom(socket, roomId);
  });

  socket.on("chat:send", ({ roomId, text }) => {
    const room = rooms.get(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user || !text) return;
    if (!checkRateLimit(`chat:${socket.id}`, RATE_LIMITS.chat.max, RATE_LIMITS.chat.windowMs)) {
      socket.emit("error:message", { message: "You're sending messages too quickly. Please slow down a little." });
      return;
    }

    const message = {
      id: uuid(),
      roomId,
      user,
      text: String(text).slice(0, 2000),
      timestamp: Date.now(),
    };
    if (room.lobbyId) lobbyStore.appendMessage(room.lobbyId, message);
    io.to(roomId).emit("chat:new", message);
  });

  socket.on("dice:roll", ({ roomId, request }) => {
    const room = rooms.get(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user || !request) return;
    if (!checkRateLimit(`dice:${socket.id}`, RATE_LIMITS.diceRoll.max, RATE_LIMITS.diceRoll.windowMs)) {
      socket.emit("error:message", { message: "You're rolling too quickly. Please wait a few seconds and try again." });
      return;
    }

    try {
      const { rolls, total } = executeRoll(request);
      const result = {
        id: uuid(),
        roomId,
        user,
        request,
        rolls,
        total,
        timestamp: Date.now(),
      };
      if (room.lobbyId) lobbyStore.appendRoll(room.lobbyId, result);
      // Broadcast to everyone in the room, including the roller — this is the
      // "everyone can see what you roll" requirement.
      io.to(roomId).emit("dice:result", result);
    } catch (err) {
      socket.emit("error:message", { message: err.message });
    }
  });

  // --- Owner-only lobby management ---
  // Every handler here re-derives the caller's role from their token on every
  // call rather than trusting anything cached client-side — the same
  // "never trust the client" principle used for dice rolls.

  socket.on("lobby:respondJoinRequest", ({ roomId, requestId, approve, token }) => {
    const room = rooms.get(roomId);
    const lobby = room?.lobbyId && lobbyStore.loadLobby(room.lobbyId);
    if (!lobby) return;
    const payload = token && auth.verifyToken(token);
    const account = payload && userStore.findById(payload.sub);
    const role = permissions.roleFor(lobby, account?.id);
    const action = approve ? "approveJoin" : "declineJoin";
    if (!account || !permissions.can(role, action)) {
      socket.emit("error:message", { message: "You don't have permission to do that." });
      return;
    }

    const request = lobbyStore.resolveJoinRequest(roomId, requestId, approve);
    if (!request) return;

    const pending = pendingJoins.get(requestId);
    pendingJoins.delete(requestId);
    if (!pending) return; // requester already disconnected; membership was still recorded above

    if (approve) {
      const freshLobby = lobbyStore.loadLobby(roomId);
      admitToRoom(pending.socket, roomId, request.name, freshLobby, request.accountId);
    } else {
      pending.socket.emit("room:joinDeclined", { message: "Your request to join was declined by the lobby owner." });
    }
  });

  socket.on("lobby:removePlayer", ({ roomId, targetUserId, token }) => {
    const room = rooms.get(roomId);
    const lobby = room?.lobbyId && lobbyStore.loadLobby(room.lobbyId);
    if (!lobby) return;
    const payload = token && auth.verifyToken(token);
    const account = payload && userStore.findById(payload.sub);
    const role = permissions.roleFor(lobby, account?.id);
    if (!account || !permissions.can(role, "removePlayer")) {
      socket.emit("error:message", { message: "You don't have permission to do that." });
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetUserId);
    if (targetSocket) {
      targetSocket.emit("lobby:removed", { message: "You were removed from this lobby by its owner." });
      leaveRoom(targetSocket, roomId);
    }
  });

  socket.on("lobby:close", ({ roomId, token }) => {
    const room = rooms.get(roomId);
    const lobby = room?.lobbyId && lobbyStore.loadLobby(room.lobbyId);
    if (!lobby) return;
    const payload = token && auth.verifyToken(token);
    const account = payload && userStore.findById(payload.sub);
    const role = permissions.roleFor(lobby, account?.id);
    if (!account || !permissions.can(role, "closeLobby")) {
      socket.emit("error:message", { message: "You don't have permission to do that." });
      return;
    }

    lobbyStore.closeLobby(roomId);
    for (const [socketId] of room.users) {
      const memberSocket = io.sockets.sockets.get(socketId);
      memberSocket?.emit("lobby:closed", { message: "This lobby was closed by its owner." });
      memberSocket?.leave(roomId);
    }
    rooms.delete(roomId);
  });

  // --- Initiative tracker ---
  // Every mutating handler checks permission via initiativeRole()/permissions.can()
  // even though "member" currently grants everyone access — this is the seam
  // for restricting initiative editing to specific roles later without
  // touching any of the handlers themselves.

  function requireInitiativePermission(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return { room: null };
    const lobby = room.lobbyId ? lobbyStore.loadLobby(room.lobbyId) : null;
    return { room, lobby };
  }

  function checkInitiativePermission(lobby, token) {
    const role = initiativeRole(lobby, token);
    return permissions.can(role, "manageInitiative");
  }

  socket.on("initiative:setPanelOpen", ({ roomId, open }) => {
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    room.initiative.panelOpen = !!open;
    syncInitiative(room, roomId);
  });

  socket.on("initiative:addPlayer", ({ roomId, targetUserId, token }) => {
    const { room, lobby } = requireInitiativePermission(roomId);
    if (!room || !checkInitiativePermission(lobby, token)) return;
    const target = room.users.get(targetUserId);
    if (!target) return;
    initiative.addOrUpdatePlayerEntry(room.initiative, {
      refId: target.id,
      name: target.name,
      color: target.color,
      initiative: 0,
    });
    syncInitiative(room, roomId);
  });

  socket.on("initiative:addCustom", ({ roomId, name, initiativeValue, token }) => {
    const { room, lobby } = requireInitiativePermission(roomId);
    if (!room || !checkInitiativePermission(lobby, token) || !name) return;
    initiative.addCustomEntry(room.initiative, { name, initiative: initiativeValue });
    syncInitiative(room, roomId);
  });

  socket.on("initiative:removeEntry", ({ roomId, entryId, token }) => {
    const { room, lobby } = requireInitiativePermission(roomId);
    if (!room || !checkInitiativePermission(lobby, token)) return;
    initiative.removeEntry(room.initiative, entryId);
    syncInitiative(room, roomId);
  });

  socket.on("initiative:updateEntry", ({ roomId, entryId, changes, token }) => {
    const { room, lobby } = requireInitiativePermission(roomId);
    if (!room || !checkInitiativePermission(lobby, token)) return;
    initiative.updateEntry(room.initiative, entryId, changes || {});
    syncInitiative(room, roomId);
  });

  socket.on("initiative:rollForSelf", ({ roomId, modifier }) => {
    const room = rooms.get(roomId);
    const user = room?.users.get(socket.id);
    if (!room || !user) return;
    // Shares the same bucket as dice:roll — it's still a dice roll either
    // way, and using one shared bucket stops someone doubling their
    // effective rate by splitting requests between the two.
    if (!checkRateLimit(`dice:${socket.id}`, RATE_LIMITS.diceRoll.max, RATE_LIMITS.diceRoll.windowMs)) {
      socket.emit("error:message", { message: "You're rolling too quickly. Please wait a few seconds and try again." });
      return;
    }

    // Modifier is typed in by the player each session (see InitiativePanel) —
    // not stored anywhere. `rollInitiativeRequest` already takes a modifier
    // argument for exactly this; a future character-sheet Dexterity bonus
    // will pass its value in here the same way instead of a user-typed one.
    const safeModifier = Number.isFinite(modifier) ? Math.max(-100, Math.min(100, Math.round(modifier))) : 0;
    const request = rollInitiativeRequest(safeModifier);
    const { rolls, total } = executeRoll(request);
    const result = { id: uuid(), roomId, user, request, rolls, total, timestamp: Date.now() };
    if (room.lobbyId) lobbyStore.appendRoll(room.lobbyId, result);
    // Same broadcast as every other roll — the dice history behaves exactly as before.
    io.to(roomId).emit("dice:result", result);

    // Additionally post a readable breakdown to chat, since initiative rolls
    // are the kind of thing a table wants to see go by in the log.
    const breakdown =
      safeModifier === 0
        ? `${rolls[0]} = ${total}`
        : `${rolls[0]} ${safeModifier > 0 ? "+" : "-"} ${Math.abs(safeModifier)} = ${total}`;
    const chatMessage = {
      id: uuid(),
      roomId,
      user,
      text: `${user.name} rolled Initiative\n\n${breakdown}`,
      timestamp: Date.now(),
    };
    if (room.lobbyId) lobbyStore.appendMessage(room.lobbyId, chatMessage);
    io.to(roomId).emit("chat:new", chatMessage);

    initiative.addOrUpdatePlayerEntry(room.initiative, {
      refId: user.id,
      name: user.name,
      color: user.color,
      initiative: total,
    });
    syncInitiative(room, roomId);
  });

  socket.on("initiative:startCombat", ({ roomId, token }) => {
    const { room, lobby } = requireInitiativePermission(roomId);
    if (!room || !checkInitiativePermission(lobby, token)) return;
    initiative.startCombat(room.initiative);
    syncInitiative(room, roomId);
  });

  socket.on("initiative:nextTurn", ({ roomId, token }) => {
    const { room, lobby } = requireInitiativePermission(roomId);
    if (!room || !checkInitiativePermission(lobby, token)) return;
    initiative.advanceTurn(room.initiative, "next");
    syncInitiative(room, roomId);
  });

  socket.on("initiative:prevTurn", ({ roomId, token }) => {
    const { room, lobby } = requireInitiativePermission(roomId);
    if (!room || !checkInitiativePermission(lobby, token)) return;
    initiative.advanceTurn(room.initiative, "prev");
    syncInitiative(room, roomId);
  });

  socket.on("initiative:endCombat", ({ roomId, token }) => {
    const { room, lobby } = requireInitiativePermission(roomId);
    if (!room || !checkInitiativePermission(lobby, token)) return;
    initiative.endCombat(room.initiative);
    syncInitiative(room, roomId);
  });

  // --- Battle map ---
  // Same shape as the initiative handlers above: every mutation checks
  // permission via battleMapRole()/permissions.can(), even though "member"
  // currently grants everyone access — the seam for restricting this to
  // Owner/Co-DM later without touching these handlers.

  function requireBattleMapPermission(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return { room: null };
    const lobby = room.lobbyId ? lobbyStore.loadLobby(room.lobbyId) : null;
    return { room, lobby };
  }

  function checkBattleMapPermission(lobby, token) {
    const role = battleMapRole(lobby, token);
    return permissions.can(role, "manageBattleMap");
  }

  socket.on("battlemap:setMode", ({ roomId, mode, token }) => {
    const { room, lobby } = requireBattleMapPermission(roomId);
    if (!room || !checkBattleMapPermission(lobby, token)) return;
    battleMap.setMode(room.battleMap, mode);
    syncBattleMap(room, roomId);
  });

  socket.on("battlemap:setImage", ({ roomId, imageDataUrl, token }) => {
    const { room, lobby } = requireBattleMapPermission(roomId);
    if (!room || !checkBattleMapPermission(lobby, token)) return;
    const ok = battleMap.setImage(room.battleMap, imageDataUrl);
    if (!ok) {
      socket.emit("error:message", { message: "That file couldn't be used — please upload a valid PNG, JPG, or WEBP image under 5MB." });
      return;
    }
    syncBattleMap(room, roomId);
  });

  socket.on("battlemap:addPlayerToken", ({ roomId, targetUserId, token }) => {
    const { room, lobby } = requireBattleMapPermission(roomId);
    if (!room || !checkBattleMapPermission(lobby, token)) return;
    const target = room.users.get(targetUserId);
    if (!target) return;
    battleMap.addPlayerToken(room.battleMap, { refId: target.id, name: target.name, color: target.color });
    syncBattleMap(room, roomId);
  });

  socket.on("battlemap:addCustomToken", ({ roomId, name, type, token }) => {
    const { room, lobby } = requireBattleMapPermission(roomId);
    if (!room || !checkBattleMapPermission(lobby, token) || !name) return;
    battleMap.addCustomToken(room.battleMap, { name, type });
    syncBattleMap(room, roomId);
  });

  socket.on("battlemap:removeToken", ({ roomId, tokenId, token }) => {
    const { room, lobby } = requireBattleMapPermission(roomId);
    if (!room || !checkBattleMapPermission(lobby, token)) return;
    battleMap.removeToken(room.battleMap, tokenId);
    syncBattleMap(room, roomId);
  });

  socket.on("battlemap:moveToken", ({ roomId, tokenId, x, y, token, final }) => {
    const { room, lobby } = requireBattleMapPermission(roomId);
    if (!room || !checkBattleMapPermission(lobby, token)) return;
    battleMap.moveToken(room.battleMap, tokenId, x, y);
    // Every intermediate frame during a drag broadcasts instantly for smooth
    // real-time movement but is NOT written to disk — only the final
    // position (sent once, when the drag ends) is persisted and counted as
    // activity. This is what keeps dragging a token from hammering storage.
    syncBattleMap(room, roomId, !!final);
  });

  socket.on("battlemap:updateToken", ({ roomId, tokenId, changes, token }) => {
    const { room, lobby } = requireBattleMapPermission(roomId);
    if (!room || !checkBattleMapPermission(lobby, token)) return;
    battleMap.updateToken(room.battleMap, tokenId, changes || {});
    syncBattleMap(room, roomId);
  });

  socket.on("disconnect", () => {
    leaveRoom(socket, socket.data.roomId);
    for (const [requestId, pending] of pendingJoins) {
      if (pending.socket === socket) pendingJoins.delete(requestId);
    }
  });
});

function leaveRoom(socket, roomId) {
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  room.users.delete(socket.id);
  socket.leave(roomId);
  if (room.users.size === 0) {
    rooms.delete(roomId);
  } else {
    io.to(roomId).emit("room:state", roomStatePayload(roomId));
  }
}

server.listen(PORT, () => {
  console.log(`Real-time server listening on http://localhost:${PORT}`);
  cleanup.startCleanupScheduler();
});
