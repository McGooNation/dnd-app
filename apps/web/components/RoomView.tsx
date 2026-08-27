"use client";

import { useEffect, useState } from "react";
import { useRealtimeRoom, LobbyVisibility, LobbyJoinPolicy } from "shared";
import DiceTray from "./DiceTray";
import ChatPanel from "./ChatPanel";
import LobbyManagePanel from "./LobbyManagePanel";
import InitiativePanel from "./InitiativePanel";
import BattleMap from "./BattleMap";
import InviteDialog from "./InviteDialog";

interface Props {
  serverUrl: string;
  roomId: string;
  name: string;
  token?: string;
  accountId?: string;
  visibility?: LobbyVisibility;
  joinPolicy?: LobbyJoinPolicy;
  maxPlayers?: number;
  onLeave: () => void;
}

export default function RoomView({
  serverUrl,
  roomId,
  name,
  token,
  accountId,
  visibility,
  joinPolicy,
  maxPlayers,
  onLeave,
}: Props) {
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
  } = useRealtimeRoom({ serverUrl, roomId, name, token, visibility, joinPolicy, maxPlayers });

  const isOwner = !!accountId && !!room?.ownerId && accountId === room.ownerId;
  const [showInvite, setShowInvite] = useState(false);
  // Whether THIS user's Initiative panel is open — deliberately local, never
  // sent to the server. Each person opens/closes their own view of the
  // (fully shared) initiative data independently; see server/initiative.js
  // for where the actual shared data lives.
  const [initiativePanelOpen, setInitiativePanelOpen] = useState(false);
  // A small, self-clearing toast for server-sent notices (e.g. rate limit
  // messages) — kept local to this component so it doesn't change how the
  // shared hook behaves for anything else.
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    setToastMessage(error);
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [errorKey]);

  // Safety net alongside connectFailed: if the *initial* connection just
  // never resolves either way within a reasonable time (rather than
  // actively failing), still show the same "trouble connecting" screen
  // instead of leaving the room shell sitting there indefinitely. Only
  // applies before the first successful join — a brief reconnect blip after
  // that just shows the existing small "Connecting…" badge, unchanged.
  const [initialConnectTimedOut, setInitialConnectTimedOut] = useState(false);
  useEffect(() => {
    if (joinStatus !== "connecting") return;
    const timer = setTimeout(() => setInitialConnectTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [joinStatus]);

  if (joinStatus === "connecting" && (connectFailed || initialConnectTimedOut)) {
    return (
      <StatusScreen
        eyebrow="Connection problem"
        title="Having trouble connecting"
        message="Unable to reach TavernTable's server. Please check your connection and try again."
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
        eyebrow="Waiting"
        title="Request sent"
        message="The lobby owner needs to approve your request before you can join. Hang tight."
        onLeave={onLeave}
      />
    );
  }

  if (joinStatus === "declined") {
    return (
      <StatusScreen
        eyebrow="Access denied"
        title="Request declined"
        message={statusMessage || "The lobby owner declined your request to join."}
        onLeave={onLeave}
      />
    );
  }

  if (joinStatus === "removed") {
    return (
      <StatusScreen
        eyebrow="Removed"
        title="You were removed"
        message={statusMessage || "The lobby owner removed you from this lobby."}
        onLeave={onLeave}
      />
    );
  }

  if (joinStatus === "closed") {
    return (
      <StatusScreen
        eyebrow="Lobby closed"
        title="This lobby was closed"
        message={statusMessage || "The lobby owner closed this lobby."}
        onLeave={onLeave}
      />
    );
  }

  return (
    <div className="room">
      {toastMessage && <div className="toast">{toastMessage}</div>}
      <header>
        <div>
          <p className="eyebrow">Table</p>
          <h1>{roomId}</h1>
        </div>
        <div className="header-right">
          <span className={`status ${connected ? "on" : "off"}`}>{connected ? "Connected" : "Connecting…"}</span>
          {room && (
            <span className={`persist-badge ${room.persistent ? "saved" : "temp"}`}>
              {room.persistent ? "Saved lobby" : "Temporary lobby"}
            </span>
          )}
          {room?.visibility && (
            <span className={`visibility-badge ${room.visibility}`}>
              {room.visibility === "private" ? "Private" : "Public"}
            </span>
          )}
          <div className="players">
            {(room?.users ?? []).map((u) => (
              <span key={u.id} className="chip" style={{ borderColor: u.color, color: u.color }}>
                {u.name}
              </span>
            ))}
          </div>
          <button className="invite-btn" onClick={() => setShowInvite(true)}>
            Invite Players
          </button>
          <button className="leave" onClick={onLeave}>
            Leave table
          </button>
        </div>
      </header>

      {showInvite && (
        <InviteDialog
          roomId={roomId}
          inviteCode={room?.inviteCode ?? null}
          persistent={!!room?.persistent}
          onClose={() => setShowInvite(false)}
        />
      )}

      <div className="body">
        <div className="col-left">
          <button
            className={`initiative-btn ${initiativePanelOpen ? "active" : ""}`}
            onClick={() => setInitiativePanelOpen((prev) => !prev)}
          >
            Initiative{initiative?.active ? ` · Round ${initiative.round}` : ""}
          </button>
          <DiceTray rolls={rolls} onRoll={rollDice} />
        </div>
        <div className="col-center">
          <BattleMap
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
        </div>
        <div className="col-right">
          <ChatPanel messages={messages} onSend={sendMessage} />
        </div>
      </div>

      <InitiativePanel
        open={initiativePanelOpen}
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

      {isOwner && (
        <div className="manage-wrap">
          <LobbyManagePanel
            users={room?.users ?? []}
            joinRequests={joinRequests}
            onRespond={respondToJoinRequest}
            onRemove={removePlayer}
            onClose={closeLobby}
          />
        </div>
      )}

      <style jsx>{`
        .room {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--ink);
        }
        .toast {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--panel);
          border: 1px solid var(--crimson);
          color: var(--parchment);
          padding: 10px 18px;
          border-radius: 4px;
          font-size: 13px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          z-index: 200;
          max-width: 90vw;
          text-align: center;
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 28px;
          border-bottom: 1px solid var(--rule);
          flex-wrap: wrap;
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0;
        }
        h1 {
          font-family: var(--font-display);
          font-size: 24px;
          margin: 2px 0 0;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .status {
          font-family: var(--font-mono);
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid var(--rule);
        }
        .status.on { color: var(--forest); border-color: var(--forest); }
        .status.off { color: var(--parchment-dim); }
        .persist-badge {
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid;
        }
        .persist-badge.saved { color: var(--gold); border-color: var(--gold); }
        .persist-badge.temp { color: var(--parchment-dim); border-color: var(--rule); }
        .visibility-badge {
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid;
        }
        .visibility-badge.public { color: var(--forest); border-color: var(--forest); }
        .visibility-badge.private { color: var(--crimson); border-color: var(--crimson); }
        .players { display: flex; gap: 8px; flex-wrap: wrap; }
        .chip {
          font-family: var(--font-mono);
          font-size: 12px;
          padding: 4px 10px;
          border: 1px solid;
          border-radius: 20px;
        }
        .leave {
          background: transparent;
          border: 1px solid var(--crimson);
          color: var(--crimson);
          padding: 8px 14px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .leave:hover { background: var(--crimson); color: var(--parchment); }
        .invite-btn {
          background: transparent;
          border: 1px solid var(--gold);
          color: var(--gold);
          padding: 8px 14px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .invite-btn:hover { background: var(--gold); color: var(--ink); }
        .initiative-btn {
          background: var(--panel);
          border: none;
          border-bottom: 1px solid var(--rule);
          color: var(--parchment-dim);
          padding: 16px;
          font-family: var(--font-mono);
          font-size: 13px;
          text-align: left;
        }
        .initiative-btn:hover { color: var(--gold); }
        .initiative-btn.active { color: var(--gold); background: rgba(201, 162, 39, 0.08); }
        .body {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr;
          gap: 1px;
          background: var(--rule);
        }
        @media (min-width: 1000px) {
          .body { grid-template-columns: 30% 47% 23%; }
        }
        .col-left, .col-center, .col-right {
          background: var(--ink);
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .col-left { gap: 1px; }
        .col-center { min-height: 320px; }
        .col-right { min-height: 0; }
        .manage-wrap { padding: 20px 28px; }
      `}</style>
    </div>
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
    <div className="status-screen">
      <div className="card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="message">{message}</p>
        {onRetry && (
          <button className="retry" onClick={onRetry}>
            {retryLabel || "Retry"}
          </button>
        )}
        <button className={onRetry ? "secondary" : undefined} onClick={onLeave}>Back</button>
      </div>
      <style jsx>{`
        .status-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--ink);
        }
        .card {
          width: 100%;
          max-width: 420px;
          background: var(--panel);
          border: 1px solid var(--rule);
          border-radius: 4px;
          padding: 40px 36px;
          text-align: center;
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0 0 6px;
        }
        h1 {
          font-family: var(--font-display);
          font-size: 28px;
          margin: 0 0 16px;
          color: var(--parchment);
        }
        .message {
          color: var(--parchment-dim);
          line-height: 1.5;
          margin: 0 0 28px;
          font-size: 15px;
        }
        button {
          background: var(--gold);
          color: var(--ink);
          border: none;
          border-radius: 3px;
          padding: 13px 24px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 15px;
        }
        button:hover { filter: brightness(1.08); }
        button.retry { margin-bottom: 12px; }
        button.secondary {
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--parchment-dim);
        }
        button.secondary:hover { border-color: var(--gold); color: var(--gold); }
      `}</style>
    </div>
  );
}
