"use client";

import { useState } from "react";
import { CUSTOM_DICE_MAX_SIDES, CUSTOM_DICE_MIN_SIDES, DICE_TYPES, DiceType, RollRequest, RollResult } from "shared";

interface Props {
  rolls: RollResult[];
  onRoll: (request: RollRequest) => void;
}

export default function DiceTray({ rolls, onRoll }: Props) {
  const [diceType, setDiceType] = useState<DiceType>("d20");
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<"normal" | "advantage" | "disadvantage">("normal");
  const [customSides, setCustomSides] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const isD20AdvEligible = diceType === "d20" && count === 1;

  function applyCustomSides() {
    const n = parseInt(customSides, 10);
    if (!customSides || isNaN(n) || n < CUSTOM_DICE_MIN_SIDES || n > CUSTOM_DICE_MAX_SIDES) {
      setCustomError(`Enter a number between ${CUSTOM_DICE_MIN_SIDES} and ${CUSTOM_DICE_MAX_SIDES}.`);
      return;
    }
    setCustomError(null);
    setDiceType(`d${n}`);
  }

  return (
    <section className="tray">
      <div className="controls">
        <p className="eyebrow">Roll dice</p>
        <div className="dice-row">
          {DICE_TYPES.map((d) => (
            <button
              key={d}
              className={`die ${diceType === d ? "active" : ""}`}
              onClick={() => setDiceType(d)}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="custom-row">
          <label>
            Custom die
            <div className="custom-input-group">
              <span className="d-prefix">d</span>
              <input
                type="number"
                min={CUSTOM_DICE_MIN_SIDES}
                max={CUSTOM_DICE_MAX_SIDES}
                placeholder="e.g. 37"
                value={customSides}
                onChange={(e) => setCustomSides(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyCustomSides()}
              />
              <button type="button" className="use-custom" onClick={applyCustomSides}>
                Use
              </button>
            </div>
          </label>
          {customError && <p className="custom-error">{customError}</p>}
          {!DICE_TYPES.includes(diceType) && !customError && (
            <p className="custom-active">Using custom die: {diceType}</p>
          )}
        </div>

        <div className="row">
          <label>
            Count
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            />
          </label>
          <label>
            Modifier
            <input
              type="number"
              value={modifier}
              onChange={(e) => setModifier(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        {isD20AdvEligible && (
          <div className="mode-row">
            {(["normal", "advantage", "disadvantage"] as const).map((m) => (
              <button key={m} className={`mode ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        )}

        <button
          className="roll-btn"
          onClick={() =>
            onRoll({
              diceType,
              count,
              modifier,
              mode: isD20AdvEligible ? mode : "normal",
            })
          }
        >
          Roll {count > 1 ? count : ""}{diceType}
          {modifier ? (modifier > 0 ? ` +${modifier}` : ` ${modifier}`) : ""}
        </button>
      </div>

      <div className="feed">
        <p className="eyebrow">Roll history</p>
        <div className="feed-scroll">
          {rolls.length === 0 && <p className="empty">No rolls yet — the table is quiet.</p>}
          {[...rolls].reverse().map((r) => (
            <div key={r.id} className="roll-card" style={{ borderLeftColor: r.user.color }}>
              <div className="roll-meta">
                <span className="who" style={{ color: r.user.color }}>{r.user.name}</span>
                <span className="what">
                  {r.request.count > 1 ? r.request.count : ""}
                  {r.request.diceType}
                  {r.request.mode !== "normal" ? ` (${r.request.mode})` : ""}
                  {r.request.modifier ? (r.request.modifier > 0 ? ` +${r.request.modifier}` : ` ${r.request.modifier}`) : ""}
                </span>
              </div>
              <div className="roll-result">
                <span className="total">{r.total}</span>
                <span className="breakdown">[{r.rolls.join(", ")}]</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .tray {
          background: var(--panel);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0 0 12px;
        }
        .dice-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .die {
          background: var(--panel-raised);
          border: 1px solid var(--rule);
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          font-size: 13px;
          padding: 8px 14px;
          border-radius: 3px;
        }
        .die.active { border-color: var(--gold); color: var(--gold); }
        .custom-row { margin-top: 16px; }
        .custom-row label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--parchment-dim);
        }
        .custom-input-group {
          display: flex;
          align-items: stretch;
          border: 1px solid var(--rule);
          border-radius: 3px;
          overflow: hidden;
        }
        .d-prefix {
          display: flex;
          align-items: center;
          padding: 0 10px;
          background: var(--panel-raised);
          color: var(--parchment-dim);
          font-family: var(--font-mono);
        }
        .custom-input-group input {
          flex: 1;
          background: var(--ink);
          border: none;
          padding: 10px;
          color: var(--parchment);
          font-family: var(--font-mono);
        }
        .use-custom {
          background: var(--panel-raised);
          border: none;
          border-left: 1px solid var(--rule);
          color: var(--gold);
          padding: 0 16px;
          font-family: var(--font-mono);
          font-size: 12px;
        }
        .use-custom:hover { background: var(--gold); color: var(--ink); }
        .custom-error { color: var(--crimson); font-size: 12px; margin: 6px 0 0; }
        .custom-active { color: var(--forest); font-size: 12px; margin: 6px 0 0; font-family: var(--font-mono); }
        .row { display: flex; gap: 16px; margin-top: 16px; }
        label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--parchment-dim);
          flex: 1;
        }
        input {
          background: var(--ink);
          border: 1px solid var(--rule);
          color: var(--parchment);
          padding: 10px;
          border-radius: 3px;
          font-family: var(--font-mono);
        }
        .mode-row { display: flex; gap: 8px; margin-top: 16px; }
        .mode {
          flex: 1;
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--parchment-dim);
          padding: 8px;
          border-radius: 3px;
          font-family: var(--font-mono);
          font-size: 12px;
          text-transform: capitalize;
        }
        .mode.active { border-color: var(--forest); color: var(--forest); }
        .roll-btn {
          margin-top: 20px;
          background: var(--gold);
          color: var(--ink);
          border: none;
          padding: 14px;
          border-radius: 3px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 15px;
        }
        .roll-btn:hover { filter: brightness(1.08); }
        .feed-scroll {
          max-height: 360px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .empty { color: var(--parchment-dim); font-size: 14px; }
        .roll-card {
          background: var(--panel-raised);
          border-left: 3px solid;
          border-radius: 3px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .roll-meta { display: flex; flex-direction: column; gap: 2px; }
        .who { font-family: var(--font-mono); font-size: 12px; font-weight: 700; }
        .what { font-size: 12px; color: var(--parchment-dim); }
        .roll-result { display: flex; align-items: baseline; gap: 8px; }
        .total { font-family: var(--font-display); font-size: 22px; color: var(--parchment); }
        .breakdown { font-family: var(--font-mono); font-size: 11px; color: var(--parchment-dim); }
      `}</style>
    </section>
  );
}
