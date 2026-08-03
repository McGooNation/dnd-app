"use client";

import { useState } from "react";
import { AccountUser, loginAccount, registerAccount } from "shared";

interface Props {
  serverUrl: string;
  onGuest: () => void;
  onAuthenticated: (user: AccountUser, token: string) => void;
}

type View = "choice" | "login" | "register";

export default function AuthScreen({ serverUrl, onGuest, onAuthenticated }: Props) {
  const [view, setView] = useState<View>("choice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await loginAccount(serverUrl, email, password);
      onAuthenticated(user, token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await registerAccount(serverUrl, email, password, name);
      onAuthenticated(user, token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">Welcome</p>
        <h1>TavernTable</h1>

        {view === "choice" && (
          <div className="choice-list">
            <button className="primary" onClick={() => setView("login")}>Log in</button>
            <button className="secondary" onClick={() => setView("register")}>Create account</button>
            <button className="guest" onClick={onGuest}>Continue as guest</button>
          </div>
        )}

        {view === "login" && (
          <form onSubmit={handleLogin}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit" disabled={loading}>{loading ? "Logging in…" : "Log in"}</button>
            <button type="button" className="link" onClick={() => { setView("choice"); setError(null); }}>Back</button>
          </form>
        )}

        {view === "register" && (
          <form onSubmit={handleRegister}>
            <label>
              Account Name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
            <button type="button" className="link" onClick={() => { setView("choice"); setError(null); }}>Back</button>
          </form>
        )}
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: flex;
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
          margin: 0 0 28px;
          color: var(--parchment);
        }
        .choice-list, form {
          display: flex;
          flex-direction: column;
          gap: 14px;
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
        button.primary {
          background: var(--gold);
          color: var(--ink);
          border: none;
          border-radius: 3px;
          padding: 13px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 15px;
        }
        button.primary:hover { filter: brightness(1.08); }
        button.primary:disabled { opacity: 0.6; }
        button.secondary {
          background: transparent;
          border: 1px solid var(--gold);
          color: var(--gold);
          border-radius: 3px;
          padding: 13px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 15px;
        }
        button.secondary:hover { background: var(--gold); color: var(--ink); }
        button.guest {
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--parchment-dim);
          border-radius: 3px;
          padding: 13px;
          font-family: var(--font-mono);
          font-size: 13px;
        }
        button.guest:hover { border-color: var(--parchment-dim); color: var(--parchment); }
        button.link {
          background: none;
          border: none;
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          font-size: 12px;
          text-decoration: underline;
          padding: 4px 0;
        }
        .error { color: var(--crimson); font-size: 13px; margin: 0; }
      `}</style>
    </main>
  );
}
