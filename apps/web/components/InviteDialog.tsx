"use client";

import { useState } from "react";

interface Props {
  roomId: string;
  inviteCode: string | null;
  persistent: boolean;
  onClose: () => void;
}

export default function InviteDialog({ roomId, inviteCode, persistent, onClose }: Props) {
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

  const inviteUrl =
    inviteCode && typeof window !== "undefined" ? `${window.location.origin}/join/${inviteCode}` : null;

  function copy(text: string, message: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedMessage(message);
        setTimeout(() => setCopiedMessage(null), 2000);
      })
      .catch(() => setCopiedMessage("Couldn't copy — please copy it manually."));
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="header">
          <p className="eyebrow">Invite Players</p>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>

        <label className="field">
          Lobby Name
          <input readOnly value={roomId} />
        </label>

        {!persistent || !inviteCode || !inviteUrl ? (
          <p className="temp-note">
            Temporary lobbies don't have a shareable invite link. Just give people this table
            name — anyone who types it will land in the same table.
          </p>
        ) : (
          <>
            <label className="field">
              Invite Link
              <div className="copy-row">
                <input readOnly value={inviteUrl} />
                <button onClick={() => copy(inviteUrl, "Invite link copied!")}>Copy Invite Link</button>
              </div>
            </label>

            <label className="field">
              Join Code
              <div className="copy-row">
                <input readOnly value={inviteCode} className="code-input" />
                <button onClick={() => copy(inviteCode, "Join code copied!")}>Copy Join Code</button>
              </div>
            </label>
          </>
        )}

        {copiedMessage && <p className="copied-toast">{copiedMessage}</p>}

        <button className="close-btn" onClick={onClose}>Close</button>
      </div>

      <style jsx>{`
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
        }
        .dialog {
          background: var(--panel);
          border: 1px solid var(--rule);
          border-radius: 6px;
          padding: 28px;
          width: 100%;
          max-width: 440px;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0;
        }
        .close-x {
          background: none;
          border: none;
          color: var(--parchment-dim);
          font-size: 16px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          color: var(--parchment-dim);
          margin-bottom: 16px;
        }
        input {
          background: var(--ink);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 10px 12px;
          color: var(--parchment);
          font-family: var(--font-body);
          font-size: 14px;
        }
        .code-input { font-family: var(--font-mono); letter-spacing: 0.08em; }
        .copy-row { display: flex; gap: 8px; }
        .copy-row input { flex: 1; min-width: 0; }
        .copy-row button {
          background: var(--panel-raised);
          border: 1px solid var(--gold);
          color: var(--gold);
          border-radius: 3px;
          padding: 0 12px;
          font-family: var(--font-mono);
          font-size: 11px;
          white-space: nowrap;
        }
        .copy-row button:hover { background: var(--gold); color: var(--ink); }
        .temp-note {
          color: var(--parchment-dim);
          font-size: 13px;
          line-height: 1.5;
          margin: 0 0 20px;
        }
        .copied-toast {
          color: var(--forest);
          font-family: var(--font-mono);
          font-size: 12px;
          margin: 0 0 16px;
        }
        .close-btn {
          width: 100%;
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--parchment-dim);
          padding: 10px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .close-btn:hover { border-color: var(--gold); color: var(--gold); }
      `}</style>
    </div>
  );
}
