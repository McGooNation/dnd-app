"use client";

import { JoinRequestSummary, User } from "shared";

interface Props {
  users: User[];
  selfUserId?: string;
  joinRequests: JoinRequestSummary[];
  onRespond: (requestId: string, approve: boolean) => void;
  onRemove: (targetUserId: string) => void;
  onClose: () => void;
}

export default function LobbyManagePanel({ users, selfUserId, joinRequests, onRespond, onRemove, onClose }: Props) {
  return (
    <section className="manage">
      <p className="eyebrow">Manage lobby (owner)</p>

      {joinRequests.length > 0 && (
        <div className="requests">
          <p className="section-label">Join requests</p>
          {joinRequests.map((r) => (
            <div key={r.requestId} className="request-row">
              <span>{r.name}</span>
              <div className="request-actions">
                <button className="approve" onClick={() => onRespond(r.requestId, true)}>Approve</button>
                <button className="decline" onClick={() => onRespond(r.requestId, false)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="section-label">Players</p>
      <div className="players">
        {users.map((u) => (
          <div key={u.id} className="player-row">
            <span style={{ color: u.color }}>{u.name}</span>
            {u.id !== selfUserId && (
              <button className="remove" onClick={() => onRemove(u.id)}>Remove</button>
            )}
          </div>
        ))}
      </div>

      <button className="close-lobby" onClick={onClose}>Close this lobby</button>

      <style jsx>{`
        .manage {
          background: var(--panel);
          border: 1px solid var(--crimson);
          border-radius: 4px;
          padding: 20px;
          margin-top: 20px;
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0 0 14px;
        }
        .section-label {
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          color: var(--parchment-dim);
          margin: 14px 0 8px;
        }
        .requests { display: flex; flex-direction: column; gap: 8px; }
        .request-row, .player-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--panel-raised);
          border-radius: 3px;
          padding: 8px 12px;
          font-size: 13px;
          color: var(--parchment);
          margin-bottom: 6px;
        }
        .request-actions { display: flex; gap: 8px; }
        .approve, .decline, .remove {
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 5px 10px;
          border-radius: 3px;
          border: 1px solid;
        }
        .approve { border-color: var(--forest); color: var(--forest); background: none; }
        .approve:hover { background: var(--forest); color: var(--ink); }
        .decline, .remove { border-color: var(--crimson); color: var(--crimson); background: none; }
        .decline:hover, .remove:hover { background: var(--crimson); color: var(--parchment); }
        .close-lobby {
          margin-top: 18px;
          width: 100%;
          background: transparent;
          border: 1px solid var(--crimson);
          color: var(--crimson);
          padding: 10px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .close-lobby:hover { background: var(--crimson); color: var(--parchment); }
      `}</style>
    </section>
  );
}
