"use client";

import { useState } from "react";
import { InitiativeState, User } from "shared";

interface Props {
  open: boolean;
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
}

export default function InitiativePanel({
  open,
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
}: Props) {
  const [customName, setCustomName] = useState("");
  const [customInitiative, setCustomInitiative] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  // Session-only — not sent anywhere until Roll Initiative is clicked, and not
  // saved. A future character-sheet Dexterity modifier will pre-fill this
  // (or replace it) without changing anything else here.
  const [rollModifier, setRollModifier] = useState("0");

  const entries = initiative?.entries ?? [];
  const playerRefIds = new Set(entries.filter((e) => e.type === "player").map((e) => e.refId));
  const addablePlayers = users.filter((u) => !playerRefIds.has(u.id));

  return (
    <div className={`panel ${open ? "open" : ""}`}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Initiative</p>
          {initiative?.active && <p className="round">Round {initiative.round}</p>}
        </div>
        <button className="close-btn" onClick={onClose}>Close</button>
      </div>

      <div className="panel-body">
        <div className="roll-row">
          <button className="roll-btn" onClick={() => onRoll(Number(rollModifier) || 0)}>Roll Initiative (1d20)</button>
          <label className="modifier-label">
            Modifier
            <input
              type="number"
              className="modifier-input"
              value={rollModifier}
              onChange={(e) => setRollModifier(e.target.value)}
            />
          </label>
        </div>

        <div className="add-section">
          <p className="section-label">Add player</p>
          <div className="row">
            <select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}>
              <option value="">Choose a player…</option>
              {addablePlayers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <button
              disabled={!selectedPlayerId}
              onClick={() => {
                if (selectedPlayerId) onAddPlayer(selectedPlayerId);
                setSelectedPlayerId("");
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className="add-section">
          <p className="section-label">Add monster / NPC</p>
          <div className="row">
            <input
              placeholder="Name (e.g. Goblin 1)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              maxLength={60}
            />
            <input
              type="number"
              placeholder="Init"
              className="init-input"
              value={customInitiative}
              onChange={(e) => setCustomInitiative(e.target.value)}
            />
            <button
              disabled={!customName.trim()}
              onClick={() => {
                onAddCustom(customName.trim(), Number(customInitiative) || 0);
                setCustomName("");
                setCustomInitiative("");
              }}
            >
              Add
            </button>
          </div>
        </div>

        <p className="section-label">Order</p>
        <div className="entries">
          {entries.length === 0 && <p className="empty">No one's in the initiative order yet.</p>}
          {entries.map((entry) => (
            <div key={entry.id} className={`entry ${initiative?.currentTurnEntryId === entry.id ? "current" : ""}`}>
              <span className="entry-type">{entry.type === "player" ? "●" : "○"}</span>
              <input
                className="entry-name"
                value={entry.name}
                onChange={(e) => onUpdate(entry.id, { name: e.target.value })}
                style={entry.color ? { color: entry.color } : undefined}
              />
              <input
                type="number"
                className="entry-initiative"
                value={entry.initiative}
                onChange={(e) => onUpdate(entry.id, { initiative: Number(e.target.value) || 0 })}
              />
              <button className="remove-entry" onClick={() => onRemove(entry.id)}>✕</button>
            </div>
          ))}
        </div>

        <div className="turn-controls">
          {!initiative?.active ? (
            <button className="start-btn" onClick={onStart} disabled={entries.length === 0}>Start Combat</button>
          ) : (
            <>
              <div className="turn-row">
                <button onClick={onPrev}>◀ Previous</button>
                <button onClick={onNext}>Next ▶</button>
              </div>
              <button className="end-btn" onClick={onEnd}>End Combat</button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .panel {
          position: fixed;
          top: 0;
          right: 0;
          height: 100vh;
          width: 380px;
          max-width: 90vw;
          background: var(--panel);
          border-left: 1px solid var(--rule);
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
          transform: translateX(100%);
          transition: transform 0.3s ease;
          z-index: 50;
          display: flex;
          flex-direction: column;
        }
        .panel.open { transform: translateX(0); }
        .panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 20px 20px 16px;
          border-bottom: 1px solid var(--rule);
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0;
        }
        .round { color: var(--parchment); font-family: var(--font-display); font-size: 20px; margin: 4px 0 0; }
        .close-btn {
          background: none;
          border: none;
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          font-size: 12px;
          text-decoration: underline;
        }
        .panel-body { flex: 1; overflow-y: auto; padding: 16px 20px 24px; }
        .roll-row {
          display: flex;
          gap: 8px;
          align-items: flex-end;
          margin-bottom: 20px;
        }
        .roll-btn {
          flex: 1;
          background: var(--gold);
          color: var(--ink);
          border: none;
          border-radius: 3px;
          padding: 12px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 14px;
        }
        .roll-btn:hover { filter: brightness(1.08); }
        .modifier-label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          text-transform: uppercase;
          color: var(--parchment-dim);
        }
        .modifier-input {
          width: 56px;
          background: var(--ink);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 11px 8px;
          color: var(--parchment);
          font-family: var(--font-mono);
          text-align: center;
        }
        .add-section { margin-bottom: 16px; }
        .section-label {
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          color: var(--parchment-dim);
          margin: 0 0 8px;
        }
        .row { display: flex; gap: 6px; }
        select, input {
          background: var(--ink);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 8px 10px;
          color: var(--parchment);
          font-size: 13px;
          font-family: var(--font-body);
        }
        select { flex: 1; min-width: 0; }
        .row input:not(.init-input) { flex: 1; min-width: 0; }
        .init-input { width: 56px; }
        .row button {
          background: var(--panel-raised);
          border: 1px solid var(--gold);
          color: var(--gold);
          border-radius: 3px;
          padding: 0 14px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .row button:disabled { opacity: 0.4; }
        .row button:not(:disabled):hover { background: var(--gold); color: var(--ink); }
        .entries { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
        .empty { color: var(--parchment-dim); font-size: 13px; }
        .entry {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--panel-raised);
          border: 1px solid transparent;
          border-radius: 3px;
          padding: 6px 8px;
        }
        .entry.current { border-color: var(--gold); background: rgba(201, 162, 39, 0.12); }
        .entry-type { color: var(--parchment-dim); font-size: 12px; }
        .entry-name {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          font-size: 13px;
          padding: 4px 2px;
        }
        .entry-initiative {
          width: 44px;
          text-align: center;
          padding: 4px;
        }
        .remove-entry {
          background: none;
          border: none;
          color: var(--crimson);
          font-size: 13px;
          padding: 2px 4px;
        }
        .turn-controls { border-top: 1px solid var(--rule); padding-top: 16px; }
        .start-btn {
          width: 100%;
          background: var(--forest);
          color: var(--ink);
          border: none;
          border-radius: 3px;
          padding: 12px;
          font-family: var(--font-display);
          font-weight: 700;
        }
        .start-btn:disabled { opacity: 0.4; }
        .turn-row { display: flex; gap: 8px; margin-bottom: 10px; }
        .turn-row button {
          flex: 1;
          background: var(--panel-raised);
          border: 1px solid var(--rule);
          color: var(--parchment);
          border-radius: 3px;
          padding: 10px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .turn-row button:hover { border-color: var(--gold); }
        .end-btn {
          width: 100%;
          background: transparent;
          border: 1px solid var(--crimson);
          color: var(--crimson);
          border-radius: 3px;
          padding: 10px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .end-btn:hover { background: var(--crimson); color: var(--parchment); }
      `}</style>
    </div>
  );
}
