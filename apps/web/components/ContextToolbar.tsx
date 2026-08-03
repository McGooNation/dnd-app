"use client";

import { useState } from "react";
import { PRESET_TOKEN_COLORS, TOKEN_SIZES, Token } from "shared";

interface Props {
  token: Token;
  onRemove: () => void;
  onColorChange: (hex: string) => void;
  onSizeChange: (size: string) => void;
}

type Submenu = null | "remove" | "color" | "size";

export default function ContextToolbar({ token, onRemove, onColorChange, onSizeChange }: Props) {
  const [submenu, setSubmenu] = useState<Submenu>(null);

  // Config-array driven so future buttons (Rename, Duplicate, HP, Conditions,
  // Token Image, Notes, Lock Position, ...) are just new entries here —
  // nothing about how the toolbar renders needs to change.
  const actions: { key: Submenu; icon: string; label: string }[] = [
    { key: "remove", icon: "🗑", label: "Remove from Map" },
    { key: "color", icon: "🎨", label: "Color" },
    { key: "size", icon: "📏", label: "Size" },
  ];

  return (
    <div className="toolbar" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="buttons">
        {actions.map((a) => (
          <button
            key={a.key}
            className={`action-btn ${submenu === a.key ? "active" : ""}`}
            title={a.label}
            onClick={() => setSubmenu(submenu === a.key ? null : a.key)}
          >
            {a.icon}
          </button>
        ))}
      </div>

      {submenu === "remove" && (
        <div className="submenu confirm">
          <p>Remove this token from the battle map?</p>
          <div className="confirm-buttons">
            <button className="danger" onClick={onRemove}>Remove</button>
            <button onClick={() => setSubmenu(null)}>Cancel</button>
          </div>
        </div>
      )}

      {submenu === "color" && (
        <div className="submenu">
          <div className="swatches">
            {PRESET_TOKEN_COLORS.map((c) => (
              <button
                key={c.hex}
                className={`swatch ${token.color === c.hex ? "selected" : ""}`}
                style={{ background: c.hex }}
                title={c.name}
                onClick={() => {
                  onColorChange(c.hex);
                  setSubmenu(null);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {submenu === "size" && (
        <div className="submenu">
          <div className="size-options">
            {TOKEN_SIZES.map((s) => (
              <button
                key={s}
                className={`size-btn ${token.size === s ? "selected" : ""}`}
                onClick={() => {
                  onSizeChange(s);
                  setSubmenu(null);
                }}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .toolbar {
          background: var(--panel);
          border: 1px solid var(--gold);
          border-radius: 6px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          padding: 6px;
          min-width: 128px;
        }
        .buttons { display: flex; gap: 4px; }
        .action-btn {
          background: var(--panel-raised);
          border: 1px solid var(--rule);
          border-radius: 4px;
          padding: 6px 8px;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
        }
        .action-btn:hover, .action-btn.active { border-color: var(--gold); background: rgba(201, 162, 39, 0.12); }
        .submenu { margin-top: 8px; }
        .confirm p {
          color: var(--parchment);
          font-size: 12px;
          margin: 0 0 8px;
          max-width: 160px;
        }
        .confirm-buttons { display: flex; gap: 6px; }
        .confirm-buttons button {
          flex: 1;
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 6px;
          border-radius: 3px;
          border: 1px solid var(--rule);
          background: var(--panel-raised);
          color: var(--parchment-dim);
          cursor: pointer;
        }
        .confirm-buttons .danger { border-color: var(--crimson); color: var(--crimson); }
        .confirm-buttons .danger:hover { background: var(--crimson); color: var(--parchment); }
        .swatches {
          display: grid;
          grid-template-columns: repeat(4, 20px);
          gap: 6px;
        }
        .swatch {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          border: 2px solid transparent;
          padding: 0;
          cursor: pointer;
        }
        .swatch:hover { border-color: var(--parchment-dim); }
        .swatch.selected { border-color: var(--parchment); }
        .size-options { display: flex; flex-direction: column; gap: 4px; }
        .size-btn {
          background: var(--panel-raised);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 6px 10px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--parchment-dim);
          text-align: left;
          cursor: pointer;
        }
        .size-btn:hover { border-color: var(--gold); }
        .size-btn.selected { border-color: var(--gold); color: var(--gold); }
      `}</style>
    </div>
  );
}
