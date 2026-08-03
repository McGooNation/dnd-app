"use client";

import { useEffect, useState } from "react";
import RoomView from "../components/RoomView";
import AuthScreen from "../components/AuthScreen";
import LobbyBrowser from "../components/LobbyBrowser";
import { AccountUser, fetchCurrentUser, LobbyJoinPolicy, LobbyVisibility, CONNECTION_ERROR_MESSAGE } from "shared";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
const TOKEN_STORAGE_KEY = "tabletop_token";

export default function Home() {
  const [step, setStep] = useState<"loading" | "auth" | "join" | "room" | "connectionError">("loading");
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  // Only used if this join ends up creating a new persistent lobby.
  const [visibility, setVisibility] = useState<LobbyVisibility>("public");
  const [joinPolicy, setJoinPolicy] = useState<LobbyJoinPolicy>("auto");
  const [maxPlayers, setMaxPlayers] = useState("");

  // On first load, try to restore a saved login session so returning users
  // don't have to log in every time. Guests are unaffected — this only runs
  // a lookup, it never blocks or forces a login. Separated into its own
  // function so the "Retry" button on a connection failure can call the
  // exact same logic again, rather than needing its own copy.
  async function restoreSession() {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
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
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setStep("auth");
      }
    } catch {
      // The server couldn't be reached at all (as opposed to the token just
      // being invalid, handled above) — don't guess, show a clear retry
      // screen instead of silently sitting on a blank loading page.
      setStep("connectionError");
    }
  }

  useEffect(() => {
    setStep("loading");
    restoreSession();
  }, []);

  function handleAuthenticated(user: AccountUser, newToken: string) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
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

  function handleLeaveRoom() {
    setJoined(false);
    setStep("join");
  }

  if (step === "loading") {
    return <main className="wrap" />;
  }

  if (step === "connectionError") {
    return (
      <main className="wrap">
        <div className="card connection-error-card">
          <p className="eyebrow">Connection problem</p>
          <h1>{CONNECTION_ERROR_MESSAGE}</h1>
          <button onClick={() => { setStep("loading"); restoreSession(); }}>Retry</button>
        </div>
        <style jsx>{`
          .wrap {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: var(--ink);
          }
          .connection-error-card {
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
            color: var(--crimson);
            margin: 0 0 12px;
          }
          h1 {
            font-family: var(--font-body);
            font-weight: 400;
            font-size: 16px;
            line-height: 1.5;
            color: var(--parchment);
            margin: 0 0 24px;
          }
          button {
            background: var(--gold);
            color: var(--ink);
            border: none;
            border-radius: 3px;
            padding: 13px 28px;
            font-family: var(--font-display);
            font-weight: 700;
            font-size: 15px;
          }
          button:hover { filter: brightness(1.08); }
        `}</style>
      </main>
    );
  }

  if (step === "auth") {
    return <AuthScreen serverUrl={SERVER_URL} onGuest={handleGuest} onAuthenticated={handleAuthenticated} />;
  }

  if (joined) {
    return (
      <RoomView
        serverUrl={SERVER_URL}
        roomId={roomId}
        name={name}
        token={token ?? undefined}
        accountId={account?.id}
        visibility={visibility}
        joinPolicy={joinPolicy}
        maxPlayers={maxPlayers ? parseInt(maxPlayers, 10) : undefined}
        onLeave={handleLeaveRoom}
      />
    );
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">Gather at the table</p>
        <h1>TavernTable</h1>
        <p className="sub">Enter a table name to join or create it. Anyone with the same name lands in the same room.</p>

        {account && (
          <p className="account-badge">
            Logged in as <strong>{account.name}</strong>
            <button
              className="switch-account"
              onClick={() => {
                localStorage.removeItem(TOKEN_STORAGE_KEY);
                setAccount(null);
                setToken(null);
                setName("");
                setStep("auth");
              }}
            >
              Log out
            </button>
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && roomId.trim()) setJoined(true);
          }}
        >
          <label>
            Lobby Display Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Elandra" maxLength={40} required />
            <span className="hint">
              {account
                ? "Shown to other players in this lobby only — pick anything, it won't change your account name."
                : "Shown to other players in this lobby."}
            </span>
          </label>
          <label>
            Table name
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="curse-of-strahd" maxLength={40} required />
          </label>

          {account && (
            <div className="creation-settings">
              <p className="creation-hint">
                These only apply if this table name doesn't exist yet — you'd be creating it.
              </p>
              <label className="inline-label">
                Visibility
                <div className="segmented">
                  <button type="button" className={visibility === "public" ? "active" : ""} onClick={() => setVisibility("public")}>Public</button>
                  <button type="button" className={visibility === "private" ? "active" : ""} onClick={() => setVisibility("private")}>Private</button>
                </div>
              </label>
              {visibility === "public" && (
                <label className="inline-label">
                  Joining
                  <div className="segmented">
                    <button type="button" className={joinPolicy === "auto" ? "active" : ""} onClick={() => setJoinPolicy("auto")}>Auto-join</button>
                    <button type="button" className={joinPolicy === "approval" ? "active" : ""} onClick={() => setJoinPolicy("approval")}>Requires approval</button>
                  </div>
                </label>
              )}
              <label className="inline-label">
                Max players (optional)
                <input
                  type="number"
                  min={1}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(e.target.value)}
                  placeholder="No limit"
                  className="max-players-input"
                />
              </label>
            </div>
          )}

          <button type="submit">Sit down</button>
        </form>

        {account && (
          <button className="browse-link" onClick={() => setShowBrowser((v) => !v)}>
            {showBrowser ? "Hide public lobbies" : "Browse public lobbies"}
          </button>
        )}
      </div>

      {account && showBrowser && (
        <LobbyBrowser
          serverUrl={SERVER_URL}
          token={token!}
          onClose={() => setShowBrowser(false)}
          onSelect={(selectedRoomId) => {
            setRoomId(selectedRoomId);
            setShowBrowser(false);
          }}
        />
      )}

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(ellipse at top, rgba(201, 162, 39, 0.08), transparent 60%),
            var(--ink);
        }
        .card {
          width: 100%;
          max-width: 420px;
          background: var(--panel);
          border: 1px solid var(--rule);
          border-radius: 4px;
          padding: 40px 36px;
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
          font-size: 34px;
          margin: 0 0 12px;
          color: var(--parchment);
        }
        .sub {
          color: var(--parchment-dim);
          line-height: 1.5;
          margin: 0 0 28px;
          font-size: 15px;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        input {
          background: var(--ink);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 12px 14px;
          color: var(--parchment);
          font-family: var(--font-body);
          font-size: 16px;
        }
        button {
          margin-top: 8px;
          background: var(--gold);
          color: var(--ink);
          border: none;
          border-radius: 3px;
          padding: 13px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.04em;
        }
        button:hover { filter: brightness(1.08); }
        .account-badge {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: var(--panel-raised);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 10px 14px;
          margin: 0 0 20px;
          font-size: 13px;
          color: var(--parchment-dim);
        }
        .account-badge strong { color: var(--gold); font-weight: 600; }
        .hint {
          font-family: var(--font-body);
          text-transform: none;
          letter-spacing: normal;
          color: var(--parchment-dim);
          font-size: 12px;
          font-weight: 400;
        }
        .switch-account {
          margin-top: 0;
          background: none;
          border: none;
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          font-size: 12px;
          text-decoration: underline;
          padding: 0;
        }
        .creation-settings {
          background: var(--panel-raised);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .creation-hint {
          font-family: var(--font-body);
          text-transform: none;
          letter-spacing: normal;
          color: var(--parchment-dim);
          font-size: 12px;
          margin: 0;
        }
        .inline-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .segmented {
          display: flex;
          border: 1px solid var(--rule);
          border-radius: 3px;
          overflow: hidden;
        }
        .segmented button {
          flex: 1;
          background: var(--ink);
          border: none;
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          font-size: 12px;
          padding: 8px;
          margin: 0;
          text-transform: none;
          letter-spacing: normal;
        }
        .segmented button.active { background: var(--gold); color: var(--ink); font-weight: 700; }
        .segmented button + button { border-left: 1px solid var(--rule); }
        .max-players-input {
          width: 100%;
          padding: 8px 10px;
          font-size: 14px;
        }
        .browse-link {
          margin-top: 16px;
          width: 100%;
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          font-size: 12px;
          padding: 10px;
        }
        .browse-link:hover { border-color: var(--gold); color: var(--gold); }
      `}</style>
    </main>
  );
}
