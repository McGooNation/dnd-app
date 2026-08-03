"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import RoomView from "../../../components/RoomView";
import AuthScreen from "../../../components/AuthScreen";
import { AccountUser, fetchCurrentUser, fetchInviteInfo, InviteInfo, CONNECTION_ERROR_MESSAGE } from "shared";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
const TOKEN_STORAGE_KEY = "tabletop_token";

type Step = "loading" | "invalid" | "auth" | "guestName" | "room" | "connectionError";

export default function JoinInvitePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;

  const [step, setStep] = useState<Step>("loading");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");

  // Pulled out so the Retry button on a connection failure can re-run the
  // exact same load sequence instead of needing its own copy of it.
  async function loadInvite() {
    let info: InviteInfo;
    try {
      info = await fetchInviteInfo(SERVER_URL, code);
    } catch {
      // Server unreachable — different from "this invite doesn't exist",
      // which is handled separately below and shows its own message.
      setStep("connectionError");
      return;
    }

    if (!info.valid) {
      setStep("invalid");
      return;
    }
    setInvite(info);

    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!savedToken) {
      setStep("auth");
      return;
    }
    try {
      const user = await fetchCurrentUser(SERVER_URL, savedToken);
      if (user) {
        // Already logged in — go straight into the lobby, no extra prompts.
        setAccount(user);
        setToken(savedToken);
        setName(user.name);
        setStep("room");
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setStep("auth");
      }
    } catch {
      setStep("connectionError");
    }
  }

  useEffect(() => {
    setStep("loading");
    loadInvite();
  }, [code]);

  function handleAuthenticated(user: AccountUser, newToken: string) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setAccount(user);
    setToken(newToken);
    setName(user.name);
    setStep("room"); // logged in (or just registered) — straight into the lobby
  }

  function handleGuest() {
    // Guests have no account name to default to, so this is the one
    // unavoidable prompt — everyone else skips straight to the lobby.
    setStep("guestName");
  }

  if (step === "loading") {
    return <main className="wrap" />;
  }

  if (step === "connectionError") {
    return (
      <main className="wrap">
        <div className="card">
          <p className="eyebrow">Connection problem</p>
          <h1>{CONNECTION_ERROR_MESSAGE}</h1>
          <button onClick={() => { setStep("loading"); loadInvite(); }}>Retry</button>
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

  if (step === "invalid") {
    return (
      <main className="wrap">
        <div className="card">
          <p className="eyebrow">Invite link</p>
          <h1>This lobby is no longer available</h1>
          <p className="message">It may have expired or been deleted.</p>
          <Link href="/">
            <button>Return to TavernTable</button>
          </Link>
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
            font-size: 26px;
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
          button:hover {
            filter: brightness(1.08);
          }
        `}</style>
      </main>
    );
  }

  if (step === "auth") {
    return <AuthScreen serverUrl={SERVER_URL} onGuest={handleGuest} onAuthenticated={handleAuthenticated} />;
  }

  if (step === "guestName") {
    return (
      <main className="wrap">
        <div className="card">
          <p className="eyebrow">Almost there</p>
          <h1>What should we call you?</h1>
          <p className="sub">Shown to other players in this lobby only.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) setStep("room");
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Elandra" maxLength={40} autoFocus required />
            <button type="submit">Join lobby</button>
          </form>
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
            font-size: 28px;
            margin: 0 0 8px;
            color: var(--parchment);
          }
          .sub {
            color: var(--parchment-dim);
            font-size: 14px;
            margin: 0 0 24px;
          }
          form {
            display: flex;
            flex-direction: column;
            gap: 14px;
          }
          input {
            background: var(--ink);
            border: 1px solid var(--rule);
            border-radius: 3px;
            padding: 12px 14px;
            color: var(--parchment);
            font-size: 16px;
          }
          button {
            background: var(--gold);
            color: var(--ink);
            border: none;
            border-radius: 3px;
            padding: 13px;
            font-family: var(--font-display);
            font-weight: 700;
            font-size: 15px;
          }
          button:hover {
            filter: brightness(1.08);
          }
        `}</style>
      </main>
    );
  }

  if (step === "room" && invite?.roomId) {
    return (
      <RoomView
        serverUrl={SERVER_URL}
        roomId={invite.roomId}
        name={name}
        token={token ?? undefined}
        accountId={account?.id}
        onLeave={() => router.push("/")}
      />
    );
  }

  return null;
}
