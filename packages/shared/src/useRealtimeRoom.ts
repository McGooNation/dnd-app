import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  BattleMapMode,
  BattleMapState,
  ChatMessage,
  ClientToServerEvents,
  InitiativeState,
  JoinRequestSummary,
  LobbyJoinPolicy,
  LobbyVisibility,
  RollRequest,
  RollResult,
  RoomState,
  ServerToClientEvents,
} from "./types";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * "connecting" — socket not confirmed in the room yet (also covers the
 *   instant/auto-join case, since that resolves to "joined" almost immediately).
 * "pending" — a join request was sent and is awaiting the owner's decision.
 * "joined" — fully in the room; chat/dice/history are live.
 * "declined" — the owner declined the join request.
 * "removed" — the owner removed this person after they were already in.
 * "closed" — the owner closed the lobby while this person was in it.
 */
export type JoinStatus = "connecting" | "pending" | "joined" | "declined" | "removed" | "closed";

interface UseRealtimeRoomOptions {
  serverUrl: string; // e.g. "http://localhost:4000"
  roomId: string;
  name: string;
  token?: string; // if the user is logged in, enables lobby persistence/ownership on the server
  // Only used if this call ends up creating the lobby (first joiner, logged in).
  visibility?: LobbyVisibility;
  joinPolicy?: LobbyJoinPolicy;
  maxPlayers?: number;
}

/**
 * Connects to a room on the real-time server and exposes chat/dice state + actions.
 * Used identically by the Next.js web app and the Expo mobile app — only the
 * UI wrapped around this hook differs between platforms.
 */
export function useRealtimeRoom({
  serverUrl,
  roomId,
  name,
  token,
  visibility,
  joinPolicy,
  maxPlayers,
}: UseRealtimeRoomOptions) {
  const socketRef = useRef<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);
  // True while the socket is actively failing to connect (server unreachable,
  // etc.) — distinct from `connected`, which is just "not connected right
  // now" and doesn't distinguish "still trying" from "actually failing".
  // UI can use this to show a clear "having trouble connecting" message with
  // a retry option instead of silently waiting forever.
  const [connectFailed, setConnectFailed] = useState(false);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("connecting");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rolls, setRolls] = useState<RollResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Increments on every error:message event, even if the text is identical
  // to the last one — this is what lets UI code reliably show a fresh toast
  // each time (e.g. hitting the same rate limit twice in a row), since React
  // won't re-render just because a string state was set to the same value.
  const [errorKey, setErrorKey] = useState(0);
  // Only meaningful for the lobby owner — pending requests from others to join.
  const [joinRequests, setJoinRequests] = useState<JoinRequestSummary[]>([]);
  const [initiative, setInitiative] = useState<InitiativeState | null>(null);
  const [battleMap, setBattleMap] = useState<BattleMapState | null>(null);

  useEffect(() => {
    if (!roomId || !name) return;

    // A tighter, more predictable timeout than the library default (20s) —
    // matches the timeout used for regular server requests, so "the server
    // is unreachable" is detected within a consistent, reasonable window
    // everywhere in the app, not just for plain HTTP requests.
    const socket: AppSocket = io(serverUrl, { transports: ["websocket"], timeout: 10_000 });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setConnectFailed(false);
      socket.emit("room:join", { roomId, name, token, visibility, joinPolicy, maxPlayers });
    });
    socket.on("disconnect", () => setConnected(false));
    // Socket.io keeps retrying to reconnect on its own by default, which is
    // good — but silently, with no signal to the UI that anything's wrong.
    // This is what lets a "having trouble connecting" message actually show
    // up instead of the app just sitting there indefinitely.
    socket.on("connect_error", () => setConnectFailed(true));
    // Only room members receive room:state, so its arrival is itself proof
    // of admission — this is what flips a pending join to fully joined.
    socket.on("room:state", (state) => {
      setRoom(state);
      setJoinStatus("joined");
    });
    // One-time catch-up when joining a persistent lobby that already has history.
    socket.on("room:history", (history) => {
      setMessages(history.messages);
      setRolls(history.rolls);
    });
    socket.on("room:joinPending", () => setJoinStatus("pending"));
    socket.on("room:joinDeclined", (payload) => {
      setJoinStatus("declined");
      setStatusMessage(payload.message);
    });
    socket.on("chat:new", (message) => setMessages((prev) => [...prev, message]));
    socket.on("dice:result", (result) => setRolls((prev) => [...prev, result]));
    socket.on("error:message", (payload) => {
      setError(payload.message);
      setErrorKey((k) => k + 1);
    });
    // Only ever meaningful to the owner; other clients simply won't act on it.
    socket.on("lobby:joinRequest", (request) => setJoinRequests((prev) => [...prev, request]));
    socket.on("lobby:removed", (payload) => {
      setJoinStatus("removed");
      setStatusMessage(payload.message);
    });
    socket.on("lobby:closed", (payload) => {
      setJoinStatus("closed");
      setStatusMessage(payload.message);
    });
    socket.on("initiative:state", (state) => setInitiative(state));
    socket.on("battlemap:state", (state) => setBattleMap(state));
    // Token-only updates patch just the one affected token in local state —
    // the map image and every other token are left completely untouched,
    // both on the wire (server never sends them for these events) and here
    // (we never touch them either). This is the client-side half of what
    // keeps token movement/add/remove/recolor/resize cheap regardless of
    // how large the uploaded map is.
    socket.on("battlemap:tokenAdded", ({ token }) => {
      setBattleMap((prev) => {
        if (!prev) return prev;
        if (prev.tokens.some((t) => t.id === token.id)) return prev; // defensive: never duplicate
        return { ...prev, tokens: [...prev.tokens, token] };
      });
    });
    socket.on("battlemap:tokenRemoved", ({ tokenId }) => {
      setBattleMap((prev) => (prev ? { ...prev, tokens: prev.tokens.filter((t) => t.id !== tokenId) } : prev));
    });
    socket.on("battlemap:tokenMoved", ({ tokenId, x, y }) => {
      setBattleMap((prev) =>
        prev ? { ...prev, tokens: prev.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)) } : prev
      );
    });
    socket.on("battlemap:tokenUpdated", ({ tokenId, changes }) => {
      setBattleMap((prev) =>
        prev ? { ...prev, tokens: prev.tokens.map((t) => (t.id === tokenId ? { ...t, ...changes } : t)) } : prev
      );
    });
    socket.on("battlemap:tokenImageUpdated", ({ tokenId, imageUrl }) => {
      setBattleMap((prev) =>
        prev ? { ...prev, tokens: prev.tokens.map((t) => (t.id === tokenId ? { ...t, imageUrl } : t)) } : prev
      );
    });

    return () => {
      socket.emit("room:leave", { roomId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl, roomId, name, token, visibility, joinPolicy, maxPlayers]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    socketRef.current?.emit("chat:send", { roomId, text: text.trim() });
  }, [roomId]);

  const rollDice = useCallback((request: RollRequest) => {
    socketRef.current?.emit("dice:roll", { roomId, request });
  }, [roomId]);

  const respondToJoinRequest = useCallback(
    (requestId: string, approve: boolean) => {
      if (!token) return;
      socketRef.current?.emit("lobby:respondJoinRequest", { roomId, requestId, approve, token });
      setJoinRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    },
    [roomId, token]
  );

  const removePlayer = useCallback(
    (targetUserId: string) => {
      if (!token) return;
      socketRef.current?.emit("lobby:removePlayer", { roomId, targetUserId, token });
    },
    [roomId, token]
  );

  const closeLobby = useCallback(() => {
    if (!token) return;
    socketRef.current?.emit("lobby:close", { roomId, token });
  }, [roomId, token]);

  /** Forces an immediate reconnect attempt rather than waiting for the
   * socket's own automatic retry delay — this is what a "Retry" button
   * should call. Optimistically clears connectFailed; it'll be set again by
   * the connect_error listener above if this attempt also fails. */
  const reconnect = useCallback(() => {
    setConnectFailed(false);
    socketRef.current?.connect();
  }, []);

  const addPlayerToInitiative = useCallback(
    (targetUserId: string) => socketRef.current?.emit("initiative:addPlayer", { roomId, targetUserId, token }),
    [roomId, token]
  );

  const addCustomInitiativeEntry = useCallback(
    (name: string, initiativeValue: number) =>
      socketRef.current?.emit("initiative:addCustom", { roomId, name, initiativeValue, token }),
    [roomId, token]
  );

  const removeInitiativeEntry = useCallback(
    (entryId: string) => socketRef.current?.emit("initiative:removeEntry", { roomId, entryId, token }),
    [roomId, token]
  );

  const updateInitiativeEntry = useCallback(
    (entryId: string, changes: { name?: string; initiative?: number }) =>
      socketRef.current?.emit("initiative:updateEntry", { roomId, entryId, changes, token }),
    [roomId, token]
  );

  const rollInitiativeForSelf = useCallback(
    (modifier = 0) => socketRef.current?.emit("initiative:rollForSelf", { roomId, modifier }),
    [roomId]
  );

  const startCombat = useCallback(() => socketRef.current?.emit("initiative:startCombat", { roomId, token }), [roomId, token]);
  const nextTurn = useCallback(() => socketRef.current?.emit("initiative:nextTurn", { roomId, token }), [roomId, token]);
  const prevTurn = useCallback(() => socketRef.current?.emit("initiative:prevTurn", { roomId, token }), [roomId, token]);
  const endCombat = useCallback(() => socketRef.current?.emit("initiative:endCombat", { roomId, token }), [roomId, token]);

  const setBattleMapMode = useCallback(
    (mode: BattleMapMode) => socketRef.current?.emit("battlemap:setMode", { roomId, mode, token }),
    [roomId, token]
  );
  const setBattleMapImage = useCallback(
    (imageDataUrl: string) => socketRef.current?.emit("battlemap:setImage", { roomId, imageDataUrl, token }),
    [roomId, token]
  );
  const addPlayerTokenToMap = useCallback(
    (targetUserId: string) => socketRef.current?.emit("battlemap:addPlayerToken", { roomId, targetUserId, token }),
    [roomId, token]
  );
  const addCustomTokenToMap = useCallback(
    (name: string, type: "monster" | "npc") => socketRef.current?.emit("battlemap:addCustomToken", { roomId, name, type, token }),
    [roomId, token]
  );
  const removeTokenFromMap = useCallback(
    (tokenId: string) => socketRef.current?.emit("battlemap:removeToken", { roomId, tokenId, token }),
    [roomId, token]
  );
  const moveTokenOnMap = useCallback(
    (tokenId: string, x: number, y: number, final = false) =>
      socketRef.current?.emit("battlemap:moveToken", { roomId, tokenId, x, y, token, final }),
    [roomId, token]
  );
  const updateTokenOnMap = useCallback(
    (tokenId: string, changes: { color?: string; size?: string }) =>
      socketRef.current?.emit("battlemap:updateToken", { roomId, tokenId, changes, token }),
    [roomId, token]
  );
  const setTokenImage = useCallback(
    (tokenId: string, imageDataUrl: string) =>
      socketRef.current?.emit("battlemap:setTokenImage", { roomId, tokenId, imageDataUrl, token }),
    [roomId, token]
  );
  const removeTokenImage = useCallback(
    (tokenId: string) => socketRef.current?.emit("battlemap:removeTokenImage", { roomId, tokenId, token }),
    [roomId, token]
  );

  return {
    connected,
    connectFailed,
    reconnect,
    joinStatus,
    statusMessage,
    room,
    messages,
    rolls,
    error,
    errorKey,
    joinRequests,
    sendMessage,
    rollDice,
    respondToJoinRequest,
    removePlayer,
    closeLobby,
    initiative,
    addPlayerToInitiative,
    addCustomInitiativeEntry,
    removeInitiativeEntry,
    updateInitiativeEntry,
    rollInitiativeForSelf,
    startCombat,
    nextTurn,
    prevTurn,
    endCombat,
    battleMap,
    setBattleMapMode,
    setBattleMapImage,
    addPlayerTokenToMap,
    addCustomTokenToMap,
    removeTokenFromMap,
    moveTokenOnMap,
    updateTokenOnMap,
    setTokenImage,
    removeTokenImage,
  };
}
