// Shared types used by the server, web app, and mobile app.
// Keeping these in one place means the client and server can never
// silently drift apart on what a "dice roll" or "message" looks like.

// DiceType is any string of the form "d" + number of sides (e.g. "d20", "d37", "d999").
// It's kept as a plain string (not a strict union) so custom dice work without
// widening this type every time — validation of the actual number happens in dice.ts
// and, authoritatively, on the server.
export type DiceType = string;

// The preset buttons shown in the UI. Custom dice are entered separately and are
// NOT restricted to this list.
export const DICE_TYPES: DiceType[] = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

export const CUSTOM_DICE_MIN_SIDES = 2;
export const CUSTOM_DICE_MAX_SIDES = 1000;

export interface User {
  id: string;
  name: string;
  color: string; // used for chat bubble / dice result accent, assigned on join
}

export interface RollRequest {
  diceType: DiceType; // the first/primary dice group's type — unchanged meaning
  count: number; // e.g. 2 for "2d6" — the primary group's count, unchanged meaning
  modifier: number; // flat +/- added to the combined total
  mode?: "normal" | "advantage" | "disadvantage"; // only meaningful for a single d20 group (no extraDice)
  label?: string; // optional user note, e.g. "Fireball damage"
  // Additional dice groups beyond the primary diceType/count above, for a
  // roll that combines multiple different die types at once (e.g. "1d10 +
  // 1d12"). Absent/empty for a normal single-type roll — every existing
  // roll request continues to work exactly as it did before this existed.
  extraDice?: { diceType: DiceType; count: number }[];
}

export interface RollResult {
  id: string;
  roomId: string;
  user: User;
  request: RollRequest;
  rolls: number[]; // every individual die result, flattened, in roll order (unchanged meaning/shape)
  total: number; // sum(rolls) + modifier (for advantage/disadvantage, the chosen roll + modifier)
  // Present only for a genuine multi-dice-type roll (i.e. extraDice was
  // non-empty), grouping the individual results by die type for a clear
  // "d6 = 4, d6 = 2, d8 = 7" style display. Absent for every existing/simple
  // roll — old saved history and single-type rolls render exactly as before.
  breakdown?: { diceType: DiceType; values: number[] }[];
  // Present only for an advantage/disadvantage roll made after this field
  // was added — the two COMPLETE attempts that were rolled and compared
  // (modifier already applied to each), so everyone can see both, not just
  // the winner. Exactly one entry has `selected: true`. Absent for a Normal
  // roll, and absent for advantage/disadvantage rolls made before this
  // existed — those still render correctly using the older rolls/total
  // fields alone (see DiceTray.tsx's fallback rendering).
  advantageRolls?: { breakdown: { diceType: DiceType; values: number[] }[]; total: number; selected: boolean }[];
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  user: User;
  text: string;
  timestamp: number;
}

export interface RoomState {
  roomId: string;
  users: User[];
  persistent: boolean; // true if this lobby is saved to an account and has history
  ownerId: string | null; // account id of the lobby owner, only set for persistent lobbies
  visibility: LobbyVisibility | null;
  joinPolicy: LobbyJoinPolicy | null;
  maxPlayers: number | null;
  inviteCode: string | null; // only set for persistent lobbies
}

export type LobbyVisibility = "public" | "private";
export type LobbyJoinPolicy = "auto" | "approval";

/** Basic info shown in the public lobby browse list — deliberately excludes
 * anything about the owner's account (only their lobby display name). */
export interface PublicLobbySummary {
  id: string;
  currentPlayers: number;
  maxPlayers: number | null;
  creatorDisplayName: string;
  joinPolicy: LobbyJoinPolicy;
}

export interface JoinRequestSummary {
  requestId: string;
  name: string;
  requestedAt: number;
}

export type InitiativeEntryType = "player" | "npc";

/** modifier/hp/maxHp/tempHp/conditions/notes are reserved for future combat
 * features (Dexterity bonuses, HP tracking, temp HP, conditions, combat
 * notes) — present on every entry today but unused. */
export interface InitiativeEntry {
  id: string;
  type: InitiativeEntryType;
  refId: string | null; // room user id, for player entries only
  name: string;
  color?: string;
  initiative: number;
  modifier: number;
  hp: number | null;
  maxHp: number | null;
  tempHp: number | null;
  conditions: string[];
  notes: string;
}

export interface InitiativeState {
  active: boolean;
  round: number;
  currentTurnEntryId: string | null;
  entries: InitiativeEntry[];
}

export type TokenType = "player" | "monster" | "npc";

/** hp/maxHp/tempHp/conditions/imageUrl/size/notes are reserved for future
 * combat/token features — present on every token today but unused. */
export interface Token {
  id: string;
  name: string;
  type: TokenType;
  x: number; // percentage (0-100) of the play area, both axes
  y: number;
  color: string;
  label: string;
  ownerId: string | null; // reserved for future permission rules
  refId: string | null; // room user id, for player tokens only
  hp: number | null;
  maxHp: number | null;
  tempHp: number | null;
  conditions: string[];
  imageUrl: string | null;
  size: string;
  notes: string;
}

export type BattleMapMode = "grid" | "image";

export interface BattleMapState {
  mode: BattleMapMode;
  imageDataUrl: string | null;
  tokens: Token[];
}

// --- Socket.io event contracts ---
// Client -> Server
export interface ClientToServerEvents {
  "room:join": (payload: {
    roomId: string;
    name: string;
    token?: string;
    // Only used if this call ends up creating the lobby (first joiner, logged in).
    visibility?: LobbyVisibility;
    joinPolicy?: LobbyJoinPolicy;
    maxPlayers?: number;
  }) => void;
  "room:leave": (payload: { roomId: string }) => void;
  "chat:send": (payload: { roomId: string; text: string }) => void;
  "dice:roll": (payload: { roomId: string; request: RollRequest }) => void;
  "lobby:respondJoinRequest": (payload: { roomId: string; requestId: string; approve: boolean; token: string }) => void;
  "lobby:removePlayer": (payload: { roomId: string; targetUserId: string; token: string }) => void;
  "lobby:close": (payload: { roomId: string; token: string }) => void;
  "initiative:addPlayer": (payload: { roomId: string; targetUserId: string; token?: string }) => void;
  "initiative:addCustom": (payload: { roomId: string; name: string; initiativeValue: number; token?: string }) => void;
  "initiative:removeEntry": (payload: { roomId: string; entryId: string; token?: string }) => void;
  "initiative:updateEntry": (payload: { roomId: string; entryId: string; changes: { name?: string; initiative?: number }; token?: string }) => void;
  "initiative:rollForSelf": (payload: { roomId: string; modifier?: number }) => void;
  "initiative:startCombat": (payload: { roomId: string; token?: string }) => void;
  "initiative:nextTurn": (payload: { roomId: string; token?: string }) => void;
  "initiative:prevTurn": (payload: { roomId: string; token?: string }) => void;
  "initiative:endCombat": (payload: { roomId: string; token?: string }) => void;
  "battlemap:setMode": (payload: { roomId: string; mode: BattleMapMode; token?: string }) => void;
  "battlemap:setImage": (payload: { roomId: string; imageDataUrl: string; token?: string }) => void;
  "battlemap:addPlayerToken": (payload: { roomId: string; targetUserId: string; token?: string }) => void;
  "battlemap:addCustomToken": (payload: { roomId: string; name: string; type: "monster" | "npc"; token?: string }) => void;
  "battlemap:removeToken": (payload: { roomId: string; tokenId: string; token?: string }) => void;
  "battlemap:moveToken": (payload: { roomId: string; tokenId: string; x: number; y: number; token?: string; final?: boolean }) => void;
  "battlemap:updateToken": (payload: { roomId: string; tokenId: string; changes: { color?: string; size?: string }; token?: string }) => void;
}

// Server -> Client
export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "room:history": (payload: { messages: ChatMessage[]; rolls: RollResult[] }) => void;
  "room:joinPending": (payload: { requestId: string }) => void;
  "room:joinDeclined": (payload: { message: string }) => void;
  "chat:new": (message: ChatMessage) => void;
  "dice:result": (result: RollResult) => void;
  "error:message": (payload: { message: string }) => void;
  "lobby:joinRequest": (payload: JoinRequestSummary) => void;
  "lobby:removed": (payload: { message: string }) => void;
  "lobby:closed": (payload: { message: string }) => void;
  "initiative:state": (state: InitiativeState) => void;
  "battlemap:state": (state: BattleMapState) => void;
  // Token-only updates — deliberately never include the map image or any
  // other token, which is what keeps these small regardless of the
  // uploaded map's size. See useRealtimeRoom.ts for how these patch local
  // state incrementally rather than replacing the whole battle map.
  "battlemap:tokenAdded": (payload: { token: Token }) => void;
  "battlemap:tokenRemoved": (payload: { tokenId: string }) => void;
  "battlemap:tokenMoved": (payload: { tokenId: string; x: number; y: number }) => void;
  "battlemap:tokenUpdated": (payload: { tokenId: string; changes: Partial<Pick<Token, "color" | "size">> }) => void;
}
