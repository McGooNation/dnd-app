"use client";

import { useEffect, useState } from "react";
import { fetchPublicLobbies, PublicLobbySummary } from "shared";

interface Props {
  serverUrl: string;
  token: string;
  onSelect: (roomId: string) => void;
  onClose: () => void;
}

export default function LobbyBrowser({ serverUrl, token, onSelect, onClose }: Props) {
  const [lobbies, setLobbies] = useState<PublicLobbySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicLobbies(serverUrl, token)
      .then(setLobbies)
      .catch((err) => setError(err.message));
  }, [serverUrl, token]);

  return (
    <div className="browser">
      <div className="browser-header">
        <p className="eyebrow">Public lobbies</p>
        <button className="close-btn" onClick={onClose}>Close</button>
      </div>

      {error && <p className="error">{error}</p>}
      {!error && lobbies === null && <p className="empty">Loading…</p>}
      {!error && lobbies?.length === 0 && <p className="empty">No public lobbies right now. Why not create one?</p>}

      <div className="list">
        {lobbies?.map((l) => (
          <button key={l.id} className="lobby-row" onClick={() => onSelect(l.id)}>
            <div>
              <p className="lobby-name">{l.id}</p>
              <p className="lobby-meta">
                Hosted by {l.creatorDisplayName} · {l.joinPolicy === "approval" ? "Requires approval" : "Join instantly"}
              </p>
            </div>
            <span className="lobby-count">
              {l.currentPlayers}{l.maxPlayers ? ` / ${l.maxPlayers}` : ""} players
            </span>
          </button>
        ))}
      </div>

      <style jsx>{`
        .browser {
          background: var(--panel);
          border: 1px solid var(--rule);
          border-radius: 4px;
          padding: 20px;
          margin-top: 20px;
          width: 100%;
          max-width: 420px;
        }
        .browser-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0;
        }
        .close-btn {
          background: none;
          border: none;
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          font-size: 12px;
          text-decoration: underline;
        }
        .empty, .error { color: var(--parchment-dim); font-size: 13px; }
        .error { color: var(--crimson); }
        .list { display: flex; flex-direction: column; gap: 8px; }
        .lobby-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: var(--panel-raised);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 10px 14px;
          text-align: left;
        }
        .lobby-row:hover { border-color: var(--gold); }
        .lobby-name { font-family: var(--font-display); color: var(--parchment); margin: 0; font-size: 15px; }
        .lobby-meta { color: var(--parchment-dim); font-size: 12px; margin: 2px 0 0; }
        .lobby-count { font-family: var(--font-mono); font-size: 12px; color: var(--gold); white-space: nowrap; }
      `}</style>
    </div>
  );
}
