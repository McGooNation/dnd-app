import React, { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  PanResponder,
  Image,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Clipboard from "expo-clipboard";
import {
  useRealtimeRoom,
  DICE_TYPES,
  DiceType,
  RollRequest,
  CUSTOM_DICE_MIN_SIDES,
  CUSTOM_DICE_MAX_SIDES,
  AccountUser,
  loginAccount,
  registerAccount,
  fetchCurrentUser,
  LobbyVisibility,
  LobbyJoinPolicy,
  PublicLobbySummary,
  fetchPublicLobbies,
  JoinRequestSummary,
  User,
  InitiativeState,
  InitiativeEntry,
  Token,
  BattleMapState,
  PRESET_TOKEN_COLORS,
  TOKEN_SIZES,
  SIZE_SCALE,
  getContrastTextColor,
  CONNECTION_ERROR_MESSAGE,
} from "shared";

// Point this at your machine's LAN IP when testing on a physical device —
// "localhost" only works in the iOS simulator, not on real hardware or Android emulators.
const SERVER_URL = "http://localhost:4000";
const TOKEN_STORAGE_KEY = "tabletop_token";
// Wherever the web app is hosted — invite links always open there, since
// receiving an https:// invite link doesn't need any special mobile app
// deep-link configuration (see README).
const WEB_APP_URL = "http://localhost:3000";

const COLORS = {
  ink: "#161320",
  panel: "#221d2e",
  panelRaised: "#2b2438",
  parchment: "#ece4d3",
  parchmentDim: "#b9b0a0",
  gold: "#c9a227",
  crimson: "#8b2635",
  forest: "#3f7a5c",
  rule: "rgba(236, 228, 211, 0.15)",
};

export default function App() {
  const [step, setStep] = useState<"loading" | "auth" | "join" | "browse" | "room" | "connectionError">("loading");
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [visibility, setVisibility] = useState<LobbyVisibility>("public");
  const [joinPolicy, setJoinPolicy] = useState<LobbyJoinPolicy>("auto");
  const [maxPlayers, setMaxPlayers] = useState("");

  // Restore a saved login session on launch, same idea as the web app.
  // Guests are unaffected — if there's no saved token we just go to the auth
  // choice screen. Pulled into its own function so the Retry button on a
  // connection failure can call the exact same logic again.
  async function restoreSession() {
    const savedToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    if (!savedToken) {
      setStep("auth");
      return;
    }
    try {
      const user = await fetchCurrentUser(SERVER_URL, savedToken);
      if (user) {
        setAccount(user);
        setToken(savedToken);
        setName(user.name);
        setStep("join");
      } else {
        await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
        setStep("auth");
      }
    } catch {
      // The server couldn't be reached at all (as opposed to the saved
      // token just being invalid, handled above) — show a clear retry
      // screen instead of silently sitting on a blank loading screen.
      setStep("connectionError");
    }
  }

  useEffect(() => {
    setStep("loading");
    restoreSession();
  }, []);

  async function handleAuthenticated(user: AccountUser, newToken: string) {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setAccount(user);
    setToken(newToken);
    setName(user.name);
    setStep("join");
  }

  function handleGuest() {
    setAccount(null);
    setToken(null);
    setStep("join");
  }

  async function handleLogOut() {
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    setAccount(null);
    setToken(null);
    setName("");
    setStep("auth");
  }

  if (step === "loading") {
    return <SafeAreaView style={styles.screen} />;
  }

  if (step === "connectionError") {
    return (
      <StatusScreen
        eyebrow="CONNECTION PROBLEM"
        title="Having trouble connecting"
        message={CONNECTION_ERROR_MESSAGE}
        onLeave={() => { setStep("loading"); restoreSession(); }}
        retryLabel="Retry"
        onRetry={() => { setStep("loading"); restoreSession(); }}
      />
    );
  }

  if (step === "auth") {
    return <AuthScreen onGuest={handleGuest} onAuthenticated={handleAuthenticated} />;
  }

  if (step === "browse" && token) {
    return (
      <LobbyBrowserScreen
        token={token}
        onBack={() => setStep("join")}
        onSelect={(selectedRoomId) => {
          setRoomId(selectedRoomId);
          setStep("join");
        }}
      />
    );
  }

  if (!joined) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.joinCard}>
          <Text style={styles.eyebrow}>GATHER AT THE TABLE</Text>
          <Text style={styles.title}>TavernTable</Text>
          <Text style={styles.sub}>Enter a table name to join or create it.</Text>

          {account && (
            <View style={styles.accountBadge}>
              <Text style={styles.accountBadgeText}>
                Logged in as <Text style={styles.accountBadgeName}>{account.name}</Text>
              </Text>
              <TouchableOpacity onPress={handleLogOut}>
                <Text style={styles.switchAccount}>Log out</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.label}>LOBBY DISPLAY NAME</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Elandra" placeholderTextColor={COLORS.parchmentDim} />
          <Text style={styles.fieldHint}>
            {account
              ? "Shown to other players in this lobby only — won't change your account name."
              : "Shown to other players in this lobby."}
          </Text>

          <Text style={styles.label}>TABLE NAME</Text>
          <TextInput style={styles.input} value={roomId} onChangeText={setRoomId} placeholder="curse-of-strahd" placeholderTextColor={COLORS.parchmentDim} />

          {account && (
            <View style={styles.creationSettings}>
              <Text style={styles.creationHint}>Only applies if you're creating this table (it doesn't exist yet).</Text>

              <Text style={styles.label}>VISIBILITY</Text>
              <View style={styles.segmented}>
                <TouchableOpacity style={[styles.segmentBtn, visibility === "public" && styles.segmentBtnActive]} onPress={() => setVisibility("public")}>
                  <Text style={[styles.segmentText, visibility === "public" && styles.segmentTextActive]}>Public</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segmentBtn, visibility === "private" && styles.segmentBtnActive]} onPress={() => setVisibility("private")}>
                  <Text style={[styles.segmentText, visibility === "private" && styles.segmentTextActive]}>Private</Text>
                </TouchableOpacity>
              </View>

              {visibility === "public" && (
                <>
                  <Text style={styles.label}>JOINING</Text>
                  <View style={styles.segmented}>
                    <TouchableOpacity style={[styles.segmentBtn, joinPolicy === "auto" && styles.segmentBtnActive]} onPress={() => setJoinPolicy("auto")}>
                      <Text style={[styles.segmentText, joinPolicy === "auto" && styles.segmentTextActive]}>Auto-join</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.segmentBtn, joinPolicy === "approval" && styles.segmentBtnActive]} onPress={() => setJoinPolicy("approval")}>
                      <Text style={[styles.segmentText, joinPolicy === "approval" && styles.segmentTextActive]}>Requires approval</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <Text style={styles.label}>MAX PLAYERS (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={maxPlayers}
                onChangeText={setMaxPlayers}
                placeholder="No limit"
                placeholderTextColor={COLORS.parchmentDim}
                keyboardType="number-pad"
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, !(name.trim() && roomId.trim()) && styles.buttonDisabled]}
            disabled={!(name.trim() && roomId.trim())}
            onPress={() => setJoined(true)}
          >
            <Text style={styles.buttonText}>Sit down</Text>
          </TouchableOpacity>

          {account && (
            <TouchableOpacity onPress={() => setStep("browse")}>
              <Text style={styles.browseLink}>Browse public lobbies</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <RoomScreen
      name={name}
      roomId={roomId}
      token={token ?? undefined}
      accountId={account?.id}
      visibility={visibility}
      joinPolicy={joinPolicy}
      maxPlayers={maxPlayers ? parseInt(maxPlayers, 10) : undefined}
      onLeave={() => setJoined(false)}
    />
  );
}

function AuthScreen({
  onGuest,
  onAuthenticated,
}: {
  onGuest: () => void;
  onAuthenticated: (user: AccountUser, token: string) => void;
}) {
  const [view, setView] = useState<"choice" | "login" | "register">("choice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await loginAccount(SERVER_URL, email, password);
      onAuthenticated(user, token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await registerAccount(SERVER_URL, email, password, name);
      onAuthenticated(user, token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.joinCard}>
        <Text style={styles.eyebrow}>WELCOME</Text>
        <Text style={styles.title}>TavernTable</Text>

        {view === "choice" && (
          <View style={{ gap: 12, marginTop: 8 }}>
            <TouchableOpacity style={styles.button} onPress={() => setView("login")}>
              <Text style={styles.buttonText}>Log in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setView("register")}>
              <Text style={styles.secondaryButtonText}>Create account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.guestButton} onPress={onGuest}>
              <Text style={styles.guestButtonText}>Continue as guest</Text>
            </TouchableOpacity>
          </View>
        )}

        {view === "login" && (
          <View>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={COLORS.parchmentDim} />
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={COLORS.parchmentDim} />
            {error && <Text style={styles.customError}>{error}</Text>}
            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? "Logging in…" : "Log in"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setView("choice"); setError(null); }}>
              <Text style={styles.switchAccount}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {view === "register" && (
          <View>
            <Text style={styles.label}>ACCOUNT NAME</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={COLORS.parchmentDim} />
            <Text style={styles.label}>EMAIL</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={COLORS.parchmentDim} />
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={COLORS.parchmentDim} />
            {error && <Text style={styles.customError}>{error}</Text>}
            <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? "Creating account…" : "Create account"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setView("choice"); setError(null); }}>
              <Text style={styles.switchAccount}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function LobbyBrowserScreen({
  token,
  onBack,
  onSelect,
}: {
  token: string;
  onBack: () => void;
  onSelect: (roomId: string) => void;
}) {
  const [lobbies, setLobbies] = useState<PublicLobbySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicLobbies(SERVER_URL, token)
      .then(setLobbies)
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.roomTitle}>Public Lobbies</Text>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.leaveText}>Back</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.customError}>{error}</Text>}
      {!error && lobbies === null && <Text style={styles.emptyText}>Loading…</Text>}
      {!error && lobbies?.length === 0 && <Text style={styles.emptyText}>No public lobbies right now.</Text>}

      <FlatList
        style={{ marginTop: 16 }}
        data={lobbies ?? []}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.lobbyRow} onPress={() => onSelect(item.id)}>
            <View>
              <Text style={styles.lobbyName}>{item.id}</Text>
              <Text style={styles.lobbyMeta}>
                Hosted by {item.creatorDisplayName} · {item.joinPolicy === "approval" ? "Requires approval" : "Join instantly"}
              </Text>
            </View>
            <Text style={styles.lobbyCount}>
              {item.currentPlayers}{item.maxPlayers ? ` / ${item.maxPlayers}` : ""}
            </Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function StatusScreen({
  eyebrow,
  title,
  message,
  onLeave,
  retryLabel,
  onRetry,
}: {
  eyebrow: string;
  title: string;
  message: string;
  onLeave: () => void;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.joinCard}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{message}</Text>
        {onRetry && (
          <TouchableOpacity style={styles.button} onPress={onRetry}>
            <Text style={styles.buttonText}>{retryLabel || "Retry"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={onRetry ? styles.secondaryButton : styles.button} onPress={onLeave}>
          <Text style={onRetry ? styles.secondaryButtonText : styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function RoomScreen({
  name,
  roomId,
  token,
  accountId,
  visibility,
  joinPolicy,
  maxPlayers,
  onLeave,
}: {
  name: string;
  roomId: string;
  token?: string;
  accountId?: string;
  visibility?: LobbyVisibility;
  joinPolicy?: LobbyJoinPolicy;
  maxPlayers?: number;
  onLeave: () => void;
}) {
  const {
    connected,
    connectFailed,
    reconnect,
    joinStatus,
    statusMessage,
    room,
    messages,
    rolls,
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
    error,
    errorKey,
  } = useRealtimeRoom({
    serverUrl: SERVER_URL,
    roomId,
    name,
    token,
    visibility,
    joinPolicy,
    maxPlayers,
  });
  const [diceType, setDiceType] = useState<DiceType>("d20");
  const [text, setText] = useState("");
  const [tab, setTab] = useState<"dice" | "chat" | "manage" | "map">("dice");
  const [customSides, setCustomSides] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const isOwner = !!accountId && !!room?.ownerId && accountId === room.ownerId;
  // Whether THIS user's Initiative panel is open — deliberately local, never
  // sent to the server. Each person opens/closes their own view of the
  // (fully shared) initiative data independently.
  const [initiativePanelOpen, setInitiativePanelOpen] = useState(false);
  // A small, self-clearing toast for server-sent notices (e.g. rate limit
  // messages) — kept local to this component, mirroring the web app.
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    setToastMessage(error);
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [errorKey]);

  const handleRoll = (mode: RollRequest["mode"] = "normal") => {
    rollDice({ diceType, count: 1, modifier: 0, mode });
  };

  const applyCustomSides = () => {
    const n = parseInt(customSides, 10);
    if (!customSides || isNaN(n) || n < CUSTOM_DICE_MIN_SIDES || n > CUSTOM_DICE_MAX_SIDES) {
      setCustomError(`Enter a number between ${CUSTOM_DICE_MIN_SIDES} and ${CUSTOM_DICE_MAX_SIDES}.`);
      return;
    }
    setCustomError(null);
    setDiceType(`d${n}`);
  };

  // Safety net alongside connectFailed: if the *initial* connection just
  // never resolves either way within a reasonable time, still show the
  // "trouble connecting" screen instead of leaving the room shell sitting
  // there indefinitely. Only applies before the first successful join — a
  // brief reconnect blip after that doesn't interrupt anything.
  const [initialConnectTimedOut, setInitialConnectTimedOut] = useState(false);
  useEffect(() => {
    if (joinStatus !== "connecting") return;
    const timer = setTimeout(() => setInitialConnectTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [joinStatus]);

  if (joinStatus === "connecting" && (connectFailed || initialConnectTimedOut)) {
    return (
      <StatusScreen
        eyebrow="CONNECTION PROBLEM"
        title="Having trouble connecting"
        message={CONNECTION_ERROR_MESSAGE}
        onLeave={onLeave}
        retryLabel="Retry"
        onRetry={() => {
          setInitialConnectTimedOut(false);
          reconnect();
        }}
      />
    );
  }

  if (joinStatus === "pending") {
    return (
      <StatusScreen
        eyebrow="WAITING"
        title="Request sent"
        message="The lobby owner needs to approve your request before you can join. Hang tight."
        onLeave={onLeave}
      />
    );
  }
  if (joinStatus === "declined") {
    return (
      <StatusScreen
        eyebrow="ACCESS DENIED"
        title="Request declined"
        message={statusMessage || "The lobby owner declined your request to join."}
        onLeave={onLeave}
      />
    );
  }
  if (joinStatus === "removed") {
    return (
      <StatusScreen
        eyebrow="REMOVED"
        title="You were removed"
        message={statusMessage || "The lobby owner removed you from this lobby."}
        onLeave={onLeave}
      />
    );
  }
  if (joinStatus === "closed") {
    return (
      <StatusScreen
        eyebrow="LOBBY CLOSED"
        title="This lobby was closed"
        message={statusMessage || "The lobby owner closed this lobby."}
        onLeave={onLeave}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      {toastMessage && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TABLE</Text>
          <Text style={styles.roomTitle}>{roomId}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <TouchableOpacity onPress={() => setShowInvite(true)}>
            <Text style={styles.inviteBtnText}>Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setInitiativePanelOpen((prev) => !prev)}>
            <Text style={[styles.initiativeBtnText, initiativePanelOpen && styles.initiativeBtnTextActive]}>
              Initiative{initiative?.active ? ` · R${initiative.round}` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLeave}>
            <Text style={styles.leaveText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showInvite} animationType="fade" transparent onRequestClose={() => setShowInvite(false)}>
        <InviteModalContent
          roomId={roomId}
          inviteCode={room?.inviteCode ?? null}
          persistent={!!room?.persistent}
          onClose={() => setShowInvite(false)}
        />
      </Modal>

      <Modal visible={initiativePanelOpen} animationType="slide" transparent onRequestClose={() => setInitiativePanelOpen(false)}>
        <InitiativeModalContent
          initiative={initiative}
          users={room?.users ?? []}
          onClose={() => setInitiativePanelOpen(false)}
          onAddPlayer={addPlayerToInitiative}
          onAddCustom={addCustomInitiativeEntry}
          onRemove={removeInitiativeEntry}
          onUpdate={updateInitiativeEntry}
          onRoll={rollInitiativeForSelf}
          onStart={startCombat}
          onNext={nextTurn}
          onPrev={prevTurn}
          onEnd={endCombat}
        />
      </Modal>

      <Text style={styles.statusText}>
        {connected ? "● Connected" : "○ Connecting…"} · {(room?.users ?? []).map((u) => u.name).join(", ")}
      </Text>
      {room && (
        <Text style={[styles.persistBadge, room.persistent ? styles.persistBadgeSaved : styles.persistBadgeTemp]}>
          {room.persistent ? "Saved lobby" : "Temporary lobby"}
          {room.visibility ? ` · ${room.visibility === "private" ? "Private" : "Public"}` : ""}
        </Text>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === "dice" && styles.tabBtnActive]} onPress={() => setTab("dice")}>
          <Text style={[styles.tabText, tab === "dice" && styles.tabTextActive]}>Dice</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === "chat" && styles.tabBtnActive]} onPress={() => setTab("chat")}>
          <Text style={[styles.tabText, tab === "chat" && styles.tabTextActive]}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === "map" && styles.tabBtnActive]} onPress={() => setTab("map")}>
          <Text style={[styles.tabText, tab === "map" && styles.tabTextActive]}>Map</Text>
        </TouchableOpacity>
        {isOwner && (
          <TouchableOpacity style={[styles.tabBtn, tab === "manage" && styles.tabBtnActive]} onPress={() => setTab("manage")}>
            <Text style={[styles.tabText, tab === "manage" && styles.tabTextActive]}>
              Manage{joinRequests.length > 0 ? ` (${joinRequests.length})` : ""}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {tab === "manage" ? (
        <ScrollView style={{ flex: 1 }}>
          {joinRequests.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Join requests</Text>
              {joinRequests.map((r: JoinRequestSummary) => (
                <View key={r.requestId} style={styles.requestRow}>
                  <Text style={styles.requestName}>{r.name}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => respondToJoinRequest(r.requestId, true)}>
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => respondToJoinRequest(r.requestId, false)}>
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          <Text style={styles.sectionLabel}>Players</Text>
          {(room?.users ?? []).map((u: User) => (
            <View key={u.id} style={styles.requestRow}>
              <Text style={[styles.requestName, { color: u.color }]}>{u.name}</Text>
              <TouchableOpacity style={styles.declineBtn} onPress={() => removePlayer(u.id)}>
                <Text style={styles.declineBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.closeLobbyBtn} onPress={closeLobby}>
            <Text style={styles.declineBtnText}>Close this lobby</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : tab === "map" ? (
        <BattleMapView
          battleMap={battleMap}
          users={room?.users ?? []}
          onSetMode={setBattleMapMode}
          onSetImage={setBattleMapImage}
          onAddPlayerToken={addPlayerTokenToMap}
          onAddCustomToken={addCustomTokenToMap}
          onRemoveToken={removeTokenFromMap}
          onMoveToken={moveTokenOnMap}
          onUpdateToken={updateTokenOnMap}
        />
      ) : tab === "dice" ? (
        <View style={{ flex: 1 }}>
          <View style={styles.diceRow}>
            {DICE_TYPES.map((d) => (
              <TouchableOpacity key={d} style={[styles.dieChip, diceType === d && styles.dieChipActive]} onPress={() => setDiceType(d)}>
                <Text style={[styles.dieChipText, diceType === d && styles.dieChipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.customRow}>
            <Text style={styles.dPrefix}>d</Text>
            <TextInput
              style={styles.customInput}
              value={customSides}
              onChangeText={setCustomSides}
              placeholder="e.g. 37"
              placeholderTextColor={COLORS.parchmentDim}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.useCustomBtn} onPress={applyCustomSides}>
              <Text style={styles.useCustomText}>Use</Text>
            </TouchableOpacity>
          </View>
          {customError && <Text style={styles.customError}>{customError}</Text>}
          {!DICE_TYPES.includes(diceType) && !customError && (
            <Text style={styles.customActive}>Using custom die: {diceType}</Text>
          )}

          <TouchableOpacity style={styles.button} onPress={() => handleRoll("normal")}>
            <Text style={styles.buttonText}>Roll {diceType}</Text>
          </TouchableOpacity>

          <FlatList
            style={styles.feed}
            data={[...rolls].reverse()}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <View style={[styles.rollCard, { borderLeftColor: item.user.color }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rollWho, { color: item.user.color }]}>{item.user.name}</Text>
                  <Text style={styles.rollWhat}>
                    {item.breakdown
                      ? item.breakdown.map((g) => `${g.values.length > 1 ? g.values.length : ""}${g.diceType}`).join(" + ")
                      : `${item.request.count > 1 ? item.request.count : ""}${item.request.diceType}`}
                    {item.request.mode !== "normal" ? ` (${item.request.mode})` : ""}
                  </Text>
                  {item.breakdown && !item.advantageRolls && (
                    <Text style={styles.rollWhat}>
                      {item.breakdown.map((g) => `${g.diceType}: [${g.values.join(", ")}]`).join("  ")}
                    </Text>
                  )}
                  {item.advantageRolls && (
                    // Both complete attempts are always shown, never just the
                    // winner — TavernTable is built around everyone at the
                    // table being able to see what was actually rolled.
                    <View style={{ marginTop: 4 }}>
                      {item.advantageRolls.map((attempt, i) => (
                        <View key={i} style={attempt.selected ? styles.advAttemptSelected : styles.advAttempt}>
                          <Text style={attempt.selected ? styles.advLabelSelected : styles.advLabel}>
                            Roll {i + 1}
                            {attempt.selected ? ` — ${item.request.mode === "advantage" ? "ADVANTAGE" : "DISADVANTAGE"}` : ""}
                            {": "}
                            {attempt.breakdown.map((g) => `${g.diceType}: [${g.values.join(", ")}]`).join("  ")}
                            {` = ${attempt.total}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                {!item.advantageRolls && <Text style={styles.rollTotal}>{item.total}</Text>}
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No rolls yet.</Text>}
          />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <FlatList
            style={styles.feed}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={styles.msgRow}>
                <Text style={[styles.msgWho, { color: item.user.color }]}>{item.user.name}: </Text>
                <Text style={styles.msgText}>{item.text}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No messages yet.</Text>}
          />
          <View style={styles.composeRow}>
            <TextInput
              style={styles.composeInput}
              value={text}
              onChangeText={setText}
              placeholder="Message the table…"
              placeholderTextColor={COLORS.parchmentDim}
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                sendMessage(text);
                setText("");
              }}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function InviteModalContent({
  roomId,
  inviteCode,
  persistent,
  onClose,
}: {
  roomId: string;
  inviteCode: string | null;
  persistent: boolean;
  onClose: () => void;
}) {
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const inviteUrl = inviteCode ? `${WEB_APP_URL}/join/${inviteCode}` : null;

  async function copy(text: string, message: string) {
    await Clipboard.setStringAsync(text);
    setCopiedMessage(message);
    setTimeout(() => setCopiedMessage(null), 2000);
  }

  return (
    <View style={styles.inviteOverlay}>
      <View style={styles.inviteCard}>
        <View style={styles.initModalHeader}>
          <Text style={styles.eyebrow}>INVITE PLAYERS</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.switchAccount}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>LOBBY NAME</Text>
        <View style={styles.inviteReadonly}>
          <Text style={styles.inviteReadonlyText}>{roomId}</Text>
        </View>

        {!persistent || !inviteCode || !inviteUrl ? (
          <Text style={styles.fieldHint}>
            Temporary lobbies don't have a shareable invite link — just give people this table name.
          </Text>
        ) : (
          <>
            <Text style={styles.label}>INVITE LINK</Text>
            <View style={styles.inviteReadonly}>
              <Text style={styles.inviteReadonlyText} numberOfLines={1}>{inviteUrl}</Text>
            </View>
            <TouchableOpacity style={styles.mapCtrlBtn} onPress={() => copy(inviteUrl, "Invite link copied!")}>
              <Text style={styles.mapCtrlBtnText}>Copy Invite Link</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { marginTop: 16 }]}>JOIN CODE</Text>
            <View style={styles.inviteReadonly}>
              <Text style={styles.inviteCodeText}>{inviteCode}</Text>
            </View>
            <TouchableOpacity style={styles.mapCtrlBtn} onPress={() => copy(inviteCode, "Join code copied!")}>
              <Text style={styles.mapCtrlBtnText}>Copy Join Code</Text>
            </TouchableOpacity>
          </>
        )}

        {copiedMessage && <Text style={styles.copiedToast}>{copiedMessage}</Text>}

        <TouchableOpacity style={[styles.closeLobbyBtn, { borderColor: COLORS.rule, marginTop: 20 }]} onPress={onClose}>
          <Text style={styles.fieldHint}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


function InitiativeModalContent({
  initiative,
  users,
  onClose,
  onAddPlayer,
  onAddCustom,
  onRemove,
  onUpdate,
  onRoll,
  onStart,
  onNext,
  onPrev,
  onEnd,
}: {
  initiative: InitiativeState | null;
  users: User[];
  onClose: () => void;
  onAddPlayer: (targetUserId: string) => void;
  onAddCustom: (name: string, initiativeValue: number) => void;
  onRemove: (entryId: string) => void;
  onUpdate: (entryId: string, changes: { name?: string; initiative?: number }) => void;
  onRoll: (modifier: number) => void;
  onStart: () => void;
  onNext: () => void;
  onPrev: () => void;
  onEnd: () => void;
}) {
  const [customName, setCustomName] = useState("");
  const [customInitiative, setCustomInitiative] = useState("");
  // Session-only, per player — see InitiativePanel.tsx (web) for the same design.
  const [rollModifier, setRollModifier] = useState("0");

  const entries = initiative?.entries ?? [];
  const playerRefIds = new Set(entries.filter((e) => e.type === "player").map((e) => e.refId));
  const addablePlayers = users.filter((u) => !playerRefIds.has(u.id));

  return (
    <View style={styles.initModalWrap}>
      <View style={styles.initModalSheet}>
        <View style={styles.initModalHeader}>
          <View>
            <Text style={styles.eyebrow}>INITIATIVE</Text>
            {initiative?.active && <Text style={styles.roundText}>Round {initiative.round}</Text>}
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.switchAccount}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
            <TouchableOpacity style={[styles.button, { flex: 1, marginTop: 0 }]} onPress={() => onRoll(Number(rollModifier) || 0)}>
              <Text style={styles.buttonText}>Roll Initiative (1d20)</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.modifierLabel}>MOD</Text>
              <TextInput
                style={styles.modifierInput}
                value={rollModifier}
                onChangeText={setRollModifier}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Add player</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {addablePlayers.length === 0 && <Text style={styles.emptyText}>Everyone's already in the order.</Text>}
            {addablePlayers.map((u) => (
              <TouchableOpacity key={u.id} style={styles.addPlayerChip} onPress={() => onAddPlayer(u.id)}>
                <Text style={styles.addPlayerChipText}>+ {u.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Add monster / NPC</Text>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Name"
              placeholderTextColor={COLORS.parchmentDim}
              value={customName}
              onChangeText={setCustomName}
              maxLength={60}
            />
            <TextInput
              style={[styles.input, { width: 60 }]}
              placeholder="Init"
              placeholderTextColor={COLORS.parchmentDim}
              value={customInitiative}
              onChangeText={setCustomInitiative}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={styles.useCustomBtn}
              onPress={() => {
                if (!customName.trim()) return;
                onAddCustom(customName.trim(), Number(customInitiative) || 0);
                setCustomName("");
                setCustomInitiative("");
              }}
            >
              <Text style={styles.useCustomText}>Add</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Order</Text>
          {entries.length === 0 && <Text style={styles.emptyText}>No one's in the initiative order yet.</Text>}
          {entries.map((entry: InitiativeEntry) => (
            <View
              key={entry.id}
              style={[styles.initEntryRow, initiative?.currentTurnEntryId === entry.id && styles.initEntryRowActive]}
            >
              <TextInput
                style={[styles.initEntryName, entry.color ? { color: entry.color } : null]}
                value={entry.name}
                onChangeText={(v) => onUpdate(entry.id, { name: v })}
              />
              <TextInput
                style={styles.initEntryValue}
                value={String(entry.initiative)}
                keyboardType="number-pad"
                onChangeText={(v) => onUpdate(entry.id, { initiative: Number(v) || 0 })}
              />
              <TouchableOpacity onPress={() => onRemove(entry.id)}>
                <Text style={styles.declineBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          <View style={{ marginTop: 20, marginBottom: 30 }}>
            {!initiative?.active ? (
              <TouchableOpacity
                style={[styles.button, entries.length === 0 && styles.buttonDisabled]}
                disabled={entries.length === 0}
                onPress={onStart}
              >
                <Text style={styles.buttonText}>Start Combat</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                  <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={onPrev}>
                    <Text style={styles.secondaryButtonText}>◀ Prev</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={onNext}>
                    <Text style={styles.secondaryButtonText}>Next ▶</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.closeLobbyBtn} onPress={onEnd}>
                  <Text style={styles.declineBtnText}>End Combat</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const MAX_UPLOAD_BASE64_LENGTH = 7_000_000; // ~5MB of image data, base64-encoded
const MAX_UPLOAD_DIMENSION = 2000; // px, on the longer side — matches the web resize utility
// If the original file is already at or under this size AND already within
// MAX_UPLOAD_DIMENSION, it's used as-is rather than needlessly reprocessed —
// matches the same idea in apps/web/lib/resizeImage.ts.
const SKIP_PROCESSING_MAX_BYTES = 800 * 1024;

function BattleMapView({
  battleMap,
  users,
  onSetMode,
  onSetImage,
  onAddPlayerToken,
  onAddCustomToken,
  onRemoveToken,
  onMoveToken,
  onUpdateToken,
}: {
  battleMap: BattleMapState | null;
  users: User[];
  onSetMode: (mode: "grid" | "image") => void;
  onSetImage: (imageDataUrl: string) => void;
  onAddPlayerToken: (targetUserId: string) => void;
  onAddCustomToken: (name: string, type: "monster" | "npc") => void;
  onRemoveToken: (tokenId: string) => void;
  onMoveToken: (tokenId: string, x: number, y: number, final?: boolean) => void;
  onUpdateToken: (tokenId: string, changes: { color?: string; size?: string }) => void;
}) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // Selection is local-only React state — never sent over the socket, so
  // each user can inspect a different token without affecting anyone else.
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  // A display-only preference, kept local like token selection above (never
  // sent over the socket) — each person can declutter their own screen
  // independently. Defaults to on, matching prior always-on behavior.
  const [showTokenNames, setShowTokenNames] = useState(true);
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<"monster" | "npc">("monster");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mode = battleMap?.mode ?? "grid";
  const tokens = battleMap?.tokens ?? [];
  const playerRefIds = new Set(tokens.filter((t) => t.type === "player").map((t) => t.refId));
  const addablePlayers = users.filter((u) => !playerRefIds.has(u.id));
  const selectedToken = tokens.find((t) => t.id === selectedTokenId) ?? null;

  // If the selected token was removed (by this user or anyone else), clear
  // the local selection — no server involvement needed for this to work.
  useEffect(() => {
    if (selectedTokenId && !tokens.some((t) => t.id === selectedTokenId)) {
      setSelectedTokenId(null);
    }
  }, [tokens, selectedTokenId]);

  function confirmRemove(tokenId: string) {
    Alert.alert("Remove this token from the battle map?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          onRemoveToken(tokenId);
          setSelectedTokenId(null);
        },
      },
    ]);
  }

  async function handleUpload() {
    setUploadError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadError("Photo library access is needed to upload a map.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1, // manipulateAsync below handles the actual compression
      base64: true, // only used for the "already small enough" fast path below
    });
    if (result.canceled || !result.assets?.[0]) return;

    const picked = result.assets[0];
    const longerSide = Math.max(picked.width || 0, picked.height || 0);

    // Already small and already appropriately sized — nothing meaningful to
    // gain from resizing/recompressing it, and doing so anyway would just be
    // unnecessary processing (plus a pointless generation loss if it's
    // already a compressed format).
    if (
      typeof picked.fileSize === "number" &&
      picked.fileSize <= SKIP_PROCESSING_MAX_BYTES &&
      longerSide <= MAX_UPLOAD_DIMENSION &&
      picked.base64
    ) {
      const mime = picked.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(picked.mimeType) ? picked.mimeType : "image/jpeg";
      const dataUrl = `data:${mime};base64,${picked.base64}`;
      if (dataUrl.length > MAX_UPLOAD_BASE64_LENGTH) {
        setUploadError("That image is too large — please use something under 5MB.");
        return;
      }
      onSetImage(dataUrl);
      return;
    }

    // Resize (only if larger than the cap) and compress client-side —
    // same idea as the web canvas resize, done here via Expo's own image
    // module so no server-side native image library is needed. WebP is
    // preferred (smaller than JPEG at equivalent quality, and — unlike the
    // web canvas approach — expo-image-manipulator's WebP encoding is a
    // native, first-class supported option, not something that needs a
    // browser-compatibility fallback check).
    const resizeAction =
      longerSide > MAX_UPLOAD_DIMENSION
        ? [{ resize: picked.width >= picked.height ? { width: MAX_UPLOAD_DIMENSION } : { height: MAX_UPLOAD_DIMENSION } }]
        : [];

    let manipulated;
    try {
      manipulated = await ImageManipulator.manipulateAsync(picked.uri, resizeAction, {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.WEBP,
        base64: true,
      });
    } catch {
      setUploadError("Couldn't process that image — please try again.");
      return;
    }
    if (!manipulated.base64) {
      setUploadError("Couldn't process that image — please try again.");
      return;
    }

    const dataUrl = `data:image/webp;base64,${manipulated.base64}`;
    if (dataUrl.length > MAX_UPLOAD_BASE64_LENGTH) {
      setUploadError("That image is too large — please use something under 5MB.");
      return;
    }
    onSetImage(dataUrl);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mapControlsRow}>
        <TouchableOpacity style={styles.mapCtrlBtn} onPress={handleUpload}>
          <Text style={styles.mapCtrlBtnText}>Upload Map</Text>
        </TouchableOpacity>
        {mode === "image" && (
          <TouchableOpacity style={styles.mapCtrlBtn} onPress={() => onSetMode("grid")}>
            <Text style={styles.mapCtrlBtnText}>Use Default Grid</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.mapCtrlBtn} onPress={() => setShowTokenNames(!showTokenNames)}>
          <Text style={styles.mapCtrlBtnText}>{showTokenNames ? "Hide Token Names" : "Show Token Names"}</Text>
        </TouchableOpacity>
      </ScrollView>
      {uploadError && <Text style={styles.customError}>{uploadError}</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mapControlsRow}>
        {addablePlayers.length === 0 && tokens.length === 0 && (
          <Text style={styles.emptyText}>No players to add yet.</Text>
        )}
        {addablePlayers.map((u) => (
          <TouchableOpacity key={u.id} style={styles.addPlayerChip} onPress={() => onAddPlayerToken(u.id)}>
            <Text style={styles.addPlayerChipText}>+ {u.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.mapAddCustomRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Monster/NPC name"
          placeholderTextColor={COLORS.parchmentDim}
          value={customName}
          onChangeText={setCustomName}
          maxLength={40}
        />
        <TouchableOpacity
          style={styles.mapTypeToggle}
          onPress={() => setCustomType(customType === "monster" ? "npc" : "monster")}
        >
          <Text style={styles.mapCtrlBtnText}>{customType === "monster" ? "Monster" : "NPC"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.useCustomBtn}
          disabled={!customName.trim()}
          onPress={() => {
            onAddCustomToken(customName.trim(), customType);
            setCustomName("");
          }}
        >
          <Text style={styles.useCustomText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.mapArea}
        onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        onTouchStart={() => setSelectedTokenId(null)}
      >
        {mode === "image" && battleMap?.imageDataUrl ? (
          <Image source={{ uri: battleMap.imageDataUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <GridLines />
        )}

        {tokens.map((t: Token) => (
          <DraggableToken
            key={t.id}
            token={t}
            containerSize={containerSize}
            selected={selectedTokenId === t.id}
            onSelect={setSelectedTokenId}
            onMove={onMoveToken}
            showLabel={showTokenNames}
          />
        ))}

        {selectedToken && (
          <MobileContextToolbar
            token={selectedToken}
            onRemove={() => confirmRemove(selectedToken.id)}
            onColorChange={(hex) => onUpdateToken(selectedToken.id, { color: hex })}
            onSizeChange={(size) => onUpdateToken(selectedToken.id, { size })}
          />
        )}
      </View>
    </View>
  );
}

function GridLines() {
  const lines = Array.from({ length: 51 }, (_, i) => (i / 50) * 100);
  return (
    <View style={StyleSheet.absoluteFill}>
      {lines.map((pct) => (
        <View key={`v${pct}`} style={[styles.gridLineV, { left: `${pct}%` }]} />
      ))}
      {lines.map((pct) => (
        <View key={`h${pct}`} style={[styles.gridLineH, { top: `${pct}%` }]} />
      ))}
    </View>
  );
}

function DraggableToken({
  token,
  containerSize,
  selected,
  onSelect,
  onMove,
  showLabel,
}: {
  token: Token;
  containerSize: { width: number; height: number };
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number, final?: boolean) => void;
  showLabel: boolean;
}) {
  // Refs, not closures, so the PanResponder (created once) always reads the
  // latest token position and container size instead of stale values.
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const containerSizeRef = useRef(containerSize);
  containerSizeRef.current = containerSize;
  const startPos = useRef({ x: token.x, y: token.y });
  const lastPos = useRef({ x: token.x, y: token.y });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        onSelect(tokenRef.current.id);
        startPos.current = { x: tokenRef.current.x, y: tokenRef.current.y };
      },
      onPanResponderMove: (_evt, gesture) => {
        const size = containerSizeRef.current;
        if (!size.width || !size.height) return;
        const dxPct = (gesture.dx / size.width) * 100;
        const dyPct = (gesture.dy / size.height) * 100;
        const newX = Math.max(0, Math.min(100, startPos.current.x + dxPct));
        const newY = Math.max(0, Math.min(100, startPos.current.y + dyPct));
        lastPos.current = { x: newX, y: newY };
        // Live update: broadcasts instantly for smooth movement, but is
        // never written to disk — only the position when the drag ends is
        // persisted. See server/index.js battlemap:moveToken.
        onMove(tokenRef.current.id, newX, newY, false);
      },
      onPanResponderRelease: () => {
        // One final, persisted update with wherever the token was actually
        // released — the only write in a drag that hits disk.
        onMove(tokenRef.current.id, lastPos.current.x, lastPos.current.y, true);
      },
      onPanResponderTerminate: () => {
        onMove(tokenRef.current.id, lastPos.current.x, lastPos.current.y, true);
      },
    })
  ).current;

  const scale = SIZE_SCALE[token.size] ?? 1;
  const size = BASE_TOKEN_SIZE * scale;

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.mapToken,
        token.type !== "player" && styles.mapTokenSquare,
        {
          left: `${token.x}%`,
          top: `${token.y}%`,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          backgroundColor: token.color,
        },
        selected && styles.mapTokenSelected,
      ]}
    >
      <Text style={[styles.mapTokenInner, { color: getContrastTextColor(token.color) }]}>
        {token.label.slice(0, 2).toUpperCase()}
      </Text>
      {showLabel && <Text style={styles.mapTokenLabel} numberOfLines={1}>{token.label}</Text>}
    </View>
  );
}

const BASE_TOKEN_SIZE = 32;

function MobileContextToolbar({
  token,
  onRemove,
  onColorChange,
  onSizeChange,
}: {
  token: Token;
  onRemove: () => void;
  onColorChange: (hex: string) => void;
  onSizeChange: (size: string) => void;
}) {
  const [submenu, setSubmenu] = useState<null | "color" | "size">(null);

  // Config-array driven so future buttons (Rename, Duplicate, HP,
  // Conditions, Token Image, Notes, Lock Position, ...) are just new
  // entries here — nothing about how the toolbar renders needs to change.
  const actions: { key: "remove" | "color" | "size"; icon: string; label: string }[] = [
    { key: "remove", icon: "🗑", label: "Remove" },
    { key: "color", icon: "🎨", label: "Color" },
    { key: "size", icon: "📏", label: "Size" },
  ];

  return (
    <View
      style={[styles.ctxToolbar, { left: `${token.x}%`, top: `${token.y}%` }]}
      onStartShouldSetResponder={() => true}
    >
      <View style={styles.ctxButtonsRow}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.key}
            style={[styles.ctxActionBtn, submenu === a.key && styles.ctxActionBtnActive]}
            onPress={() => (a.key === "remove" ? onRemove() : setSubmenu(submenu === a.key ? null : a.key))}
          >
            <Text style={styles.ctxActionIcon}>{a.icon}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {submenu === "color" && (
        <View style={styles.ctxSwatches}>
          {PRESET_TOKEN_COLORS.map((c) => (
            <TouchableOpacity
              key={c.hex}
              style={[styles.ctxSwatch, { backgroundColor: c.hex }, token.color === c.hex && styles.ctxSwatchSelected]}
              onPress={() => {
                onColorChange(c.hex);
                setSubmenu(null);
              }}
            />
          ))}
        </View>
      )}

      {submenu === "size" && (
        <View style={styles.ctxSizeOptions}>
          {TOKEN_SIZES.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.ctxSizeBtn, token.size === s && styles.ctxSizeBtnSelected]}
              onPress={() => {
                onSizeChange(s);
                setSubmenu(null);
              }}
            >
              <Text style={[styles.ctxSizeBtnText, token.size === s && styles.ctxSizeBtnTextSelected]}>
                {s[0].toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: 8,
    left: 16,
    right: 16,
    zIndex: 200,
    alignItems: "center",
  },
  toastText: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.crimson,
    color: COLORS.parchment,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 4,
    fontSize: 13,
    textAlign: "center",
    overflow: "hidden",
  },
  screen: { flex: 1, backgroundColor: COLORS.ink, padding: 20 },
  joinCard: { flexGrow: 1, justifyContent: "center", paddingVertical: 24 },
  eyebrow: { color: COLORS.gold, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  title: { color: COLORS.parchment, fontSize: 32, fontWeight: "700", marginTop: 6, marginBottom: 8 },
  sub: { color: COLORS.parchmentDim, marginBottom: 24, lineHeight: 20 },
  label: { color: COLORS.parchmentDim, fontSize: 11, letterSpacing: 1, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    padding: 12,
    color: COLORS.parchment,
    fontSize: 16,
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 4,
    padding: 14,
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: COLORS.ink, fontWeight: "700", fontSize: 15 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 4,
    padding: 14,
    alignItems: "center",
  },
  secondaryButtonText: { color: COLORS.gold, fontWeight: "700", fontSize: 15 },
  guestButton: {
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    padding: 14,
    alignItems: "center",
  },
  guestButtonText: { color: COLORS.parchmentDim, fontSize: 13 },
  switchAccount: {
    color: COLORS.parchmentDim,
    fontSize: 12,
    textDecorationLine: "underline",
    marginTop: 16,
    textAlign: "center",
  },
  accountBadge: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.panelRaised,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    padding: 12,
    marginBottom: 20,
  },
  accountBadgeText: { color: COLORS.parchmentDim, fontSize: 13 },
  accountBadgeName: { color: COLORS.gold, fontWeight: "700" },
  fieldHint: { color: COLORS.parchmentDim, fontSize: 11, marginTop: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  roomTitle: { color: COLORS.parchment, fontSize: 22, fontWeight: "700", marginTop: 2 },
  leaveText: { color: COLORS.crimson, fontSize: 13, fontWeight: "600" },
  statusText: { color: COLORS.parchmentDim, fontSize: 12, marginTop: 10, marginBottom: 14 },
  persistBadge: { fontSize: 11, marginTop: -8, marginBottom: 14, fontWeight: "600" },
  persistBadgeSaved: { color: COLORS.gold },
  persistBadgeTemp: { color: COLORS.parchmentDim },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tabBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.rule, borderRadius: 4, padding: 10, alignItems: "center" },
  tabBtnActive: { borderColor: COLORS.gold },
  tabText: { color: COLORS.parchmentDim, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: COLORS.gold },
  diceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  dieChip: { borderWidth: 1, borderColor: COLORS.rule, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 14 },
  dieChipActive: { borderColor: COLORS.gold },
  dieChipText: { color: COLORS.parchmentDim, fontSize: 13 },
  dieChipTextActive: { color: COLORS.gold },
  customRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    overflow: "hidden",
  },
  dPrefix: {
    backgroundColor: COLORS.panelRaised,
    color: COLORS.parchmentDim,
    paddingHorizontal: 12,
    textAlignVertical: "center",
  },
  customInput: {
    flex: 1,
    backgroundColor: COLORS.ink,
    color: COLORS.parchment,
    paddingHorizontal: 10,
  },
  useCustomBtn: {
    backgroundColor: COLORS.panelRaised,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.rule,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  useCustomText: { color: COLORS.gold, fontWeight: "700", fontSize: 13 },
  customError: { color: COLORS.crimson, fontSize: 12, marginTop: 6 },
  customActive: { color: COLORS.forest, fontSize: 12, marginTop: 6 },
  feed: { flex: 1, marginTop: 16 },
  emptyText: { color: COLORS.parchmentDim, fontSize: 14 },
  rollCard: {
    backgroundColor: COLORS.panelRaised,
    borderLeftWidth: 3,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rollWho: { fontSize: 13, fontWeight: "700" },
  rollWhat: { color: COLORS.parchmentDim, fontSize: 12, marginTop: 2 },
  rollTotal: { color: COLORS.parchment, fontSize: 24, fontWeight: "700" },
  advAttempt: { paddingVertical: 3 },
  advAttemptSelected: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: "rgba(201, 162, 39, 0.08)",
  },
  advLabel: { color: COLORS.parchmentDim, fontSize: 11 },
  advLabelSelected: { color: COLORS.gold, fontSize: 11, fontWeight: "700" },
  msgRow: { flexDirection: "row", marginBottom: 10 },
  msgWho: { fontWeight: "700", fontSize: 14 },
  msgText: { color: COLORS.parchment, fontSize: 14, flexShrink: 1 },
  composeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  composeInput: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    padding: 12,
    color: COLORS.parchment,
  },
  sendBtn: { backgroundColor: COLORS.panelRaised, borderWidth: 1, borderColor: COLORS.gold, borderRadius: 4, paddingHorizontal: 18, justifyContent: "center" },
  sendBtnText: { color: COLORS.gold, fontWeight: "700" },
  creationSettings: {
    backgroundColor: COLORS.panelRaised,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    padding: 14,
    marginTop: 16,
  },
  creationHint: { color: COLORS.parchmentDim, fontSize: 11, marginBottom: 8 },
  segmented: { flexDirection: "row", borderWidth: 1, borderColor: COLORS.rule, borderRadius: 4, overflow: "hidden" },
  segmentBtn: { flex: 1, backgroundColor: COLORS.ink, paddingVertical: 10, alignItems: "center" },
  segmentBtnActive: { backgroundColor: COLORS.gold },
  segmentText: { color: COLORS.parchmentDim, fontSize: 12 },
  segmentTextActive: { color: COLORS.ink, fontWeight: "700" },
  browseLink: { color: COLORS.parchmentDim, fontSize: 13, textAlign: "center", marginTop: 16, textDecorationLine: "underline" },
  lobbyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
  },
  lobbyName: { color: COLORS.parchment, fontSize: 16, fontWeight: "700" },
  lobbyMeta: { color: COLORS.parchmentDim, fontSize: 12, marginTop: 2 },
  lobbyCount: { color: COLORS.gold, fontSize: 13, fontWeight: "700" },
  sectionLabel: { color: COLORS.parchmentDim, fontSize: 11, letterSpacing: 1, marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
  requestRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.panelRaised,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  requestName: { color: COLORS.parchment, fontSize: 14 },
  approveBtn: { borderWidth: 1, borderColor: COLORS.forest, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 12 },
  approveBtnText: { color: COLORS.forest, fontSize: 12, fontWeight: "700" },
  declineBtn: { borderWidth: 1, borderColor: COLORS.crimson, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 12 },
  declineBtnText: { color: COLORS.crimson, fontSize: 12, fontWeight: "700" },
  closeLobbyBtn: {
    marginTop: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: COLORS.crimson,
    borderRadius: 4,
    padding: 12,
    alignItems: "center",
  },
  initiativeBtnText: { color: COLORS.parchmentDim, fontSize: 13, fontWeight: "600" },
  inviteBtnText: { color: COLORS.gold, fontSize: 13, fontWeight: "600" },
  inviteOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", padding: 20 },
  inviteCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 8,
    padding: 20,
  },
  inviteReadonly: {
    backgroundColor: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },
  inviteReadonlyText: { color: COLORS.parchment, fontSize: 13 },
  inviteCodeText: { color: COLORS.parchment, fontSize: 15, letterSpacing: 2, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  copiedToast: { color: COLORS.forest, fontSize: 12, marginTop: 8, textAlign: "center" },
  initiativeBtnTextActive: { color: COLORS.gold },
  initModalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  initModalSheet: {
    backgroundColor: COLORS.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    height: "85%",
  },
  initModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
  },
  roundText: { color: COLORS.parchment, fontSize: 20, fontWeight: "700", marginTop: 4 },
  addPlayerChip: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addPlayerChipText: { color: COLORS.gold, fontSize: 12, fontWeight: "600" },
  initEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.panelRaised,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "transparent",
    padding: 8,
    marginBottom: 6,
  },
  initEntryRowActive: { borderColor: COLORS.gold, backgroundColor: "rgba(201,162,39,0.12)" },
  initEntryName: { flex: 1, color: COLORS.parchment, fontSize: 14, paddingVertical: 2 },
  initEntryValue: { width: 44, color: COLORS.parchment, fontSize: 14, textAlign: "center", paddingVertical: 2 },
  mapControlsRow: { flexGrow: 0, marginBottom: 8 },
  mapCtrlBtn: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  mapCtrlBtnText: { color: COLORS.gold, fontSize: 12, fontWeight: "600" },
  mapAddCustomRow: { flexDirection: "row", gap: 6, marginBottom: 10, alignItems: "center" },
  mapTypeToggle: {
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  mapArea: {
    flex: 1,
    minHeight: 260,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 6,
    backgroundColor: COLORS.ink,
    overflow: "hidden",
  },
  gridLineV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(236,228,211,0.08)" },
  gridLineH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(236,228,211,0.08)" },
  mapToken: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: -16,
    marginTop: -16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.ink,
  },
  mapTokenSquare: { borderRadius: 6 },
  mapTokenSelected: { borderColor: COLORS.gold, borderWidth: 2 },
  mapTokenInner: { fontSize: 11, fontWeight: "700" },
  mapTokenLabel: {
    position: "absolute",
    top: 34,
    fontSize: 9,
    color: COLORS.parchment,
    backgroundColor: "rgba(22,19,32,0.85)",
    paddingHorizontal: 4,
    borderRadius: 3,
    maxWidth: 70,
  },
  ctxToolbar: {
    position: "absolute",
    marginLeft: 20,
    marginTop: -10,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    padding: 6,
    minWidth: 120,
    zIndex: 20,
    elevation: 8,
  },
  ctxButtonsRow: { flexDirection: "row", gap: 4 },
  ctxActionBtn: {
    backgroundColor: COLORS.panelRaised,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  ctxActionBtnActive: { borderColor: COLORS.gold, backgroundColor: "rgba(201,162,39,0.12)" },
  ctxActionIcon: { fontSize: 14 },
  ctxSwatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 108,
    gap: 6,
    marginTop: 8,
  },
  ctxSwatch: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: "transparent" },
  ctxSwatchSelected: { borderColor: COLORS.parchment },
  ctxSizeOptions: { marginTop: 8, gap: 4 },
  ctxSizeBtn: {
    backgroundColor: COLORS.panelRaised,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  ctxSizeBtnSelected: { borderColor: COLORS.gold },
  ctxSizeBtnText: { color: COLORS.parchmentDim, fontSize: 11 },
  ctxSizeBtnTextSelected: { color: COLORS.gold },
  modifierLabel: { color: COLORS.parchmentDim, fontSize: 10, letterSpacing: 1, marginBottom: 4, textAlign: "center" },
  modifierInput: {
    width: 56,
    backgroundColor: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: 4,
    padding: 10,
    color: COLORS.parchment,
    textAlign: "center",
  },
});
