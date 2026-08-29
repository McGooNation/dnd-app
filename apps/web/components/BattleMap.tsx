"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BattleMapState, Token, User, SIZE_SCALE, getContrastTextColor } from "shared";
import ContextToolbar from "./ContextToolbar";
import { resizeImageFile } from "../lib/resizeImage";

interface Props {
  battleMap: BattleMapState | null;
  users: User[];
  onSetMode: (mode: "grid" | "image") => void;
  onSetImage: (imageDataUrl: string) => void;
  onAddPlayerToken: (targetUserId: string) => void;
  onAddCustomToken: (name: string, type: "monster" | "npc") => void;
  onRemoveToken: (tokenId: string) => void;
  onMoveToken: (tokenId: string, x: number, y: number, final?: boolean) => void;
  onUpdateToken: (tokenId: string, changes: { color?: string; size?: string }) => void;
  onSetTokenImage: (tokenId: string, imageDataUrl: string) => void;
  onRemoveTokenImage: (tokenId: string) => void;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const BASE_TOKEN_SIZE = 34; // px, at "medium"

// Local view (zoom/pan) — never sent anywhere, never part of battleMap.
// 100% is the floor; there's intentionally no way to zoom below the normal
// default view. 4x is generous for inspecting detail without being so high
// it stops being useful — easy to bump later, it's just this one constant.
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** Keeps the (locally) transformed map content fully covering the (locally)
 * fixed viewport — so a user can never pan far enough to see empty space
 * past the map's edge. Pure function of the current viewport's own actual
 * size, not a hardcoded assumption about any particular screen. At zoom 1
 * this always collapses to exactly {x:0, y:0} — the map's normal position. */
function clampPan(pan: { x: number; y: number }, zoom: number, viewportWidth: number, viewportHeight: number) {
  const minX = viewportWidth * (1 - zoom);
  const minY = viewportHeight * (1 - zoom);
  return {
    x: Math.min(0, Math.max(minX, pan.x)),
    y: Math.min(0, Math.max(minY, pan.y)),
  };
}

export default function BattleMap({
  battleMap,
  users,
  onSetMode,
  onSetImage,
  onAddPlayerToken,
  onAddCustomToken,
  onRemoveToken,
  onMoveToken,
  onUpdateToken,
  onSetTokenImage,
  onRemoveTokenImage,
}: Props) {
  // containerRef now points at the inner, zoom/pan-transformed content layer
  // (not the outer fixed viewport) — see the render below. This is
  // deliberate: getBoundingClientRect() on a transformed element already
  // reflects that transform, so the EXISTING token-drag math further down
  // (which measures this ref) keeps working completely unchanged, whether
  // the map is zoomed/panned or not, with zero new coordinate math needed.
  const containerRef = useRef<HTMLDivElement>(null);
  // The outer, fixed-size viewport — used only for wheel-zoom cursor math
  // and pan boundary calculations, both of which need the map's stable,
  // untransformed on-screen size and position.
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Selection is intentionally local-only React state — never sent over the
  // socket, so each user can inspect a different token without affecting
  // anyone else's screen.
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  // A display-only preference, kept local like token selection above (never
  // sent over the socket) — this is a "how do I want MY screen decluttered"
  // choice, not shared lobby data, so each person can set it independently.
  // Defaults to on, matching the always-on behavior before this feature existed.
  const [showTokenNames, setShowTokenNames] = useState(true);
  // If a token's image data URL somehow fails to render (corrupt data,
  // browser quirk, etc.), fall back to the normal initials/color appearance
  // rather than showing nothing — keyed by the image's own data, so a token
  // getting a fresh image after a failure always gets a clean try.
  const [imageLoadFailed, setImageLoadFailed] = useState<Set<string>>(new Set());
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<"monster" | "npc">("monster");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const draggingRef = useRef<{ tokenId: string; raf: number | null; lastPos: { x: number; y: number } | null } | null>(null);
  // Local camera state — same philosophy as selection/showTokenNames above:
  // never sent over the socket, never touches battleMap, purely this user's
  // own view of the one shared map. Mirrored into refs (updated
  // synchronously alongside every setState call below) so the wheel/pan
  // handlers — native listeners set up once, not re-created on every zoom
  // tick — always read the truly current value rather than a stale closure.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  // Set for the duration of an actual pan drag so the click handler that
  // normally deselects a token on empty-space clicks doesn't also fire at
  // the end of a drag gesture — mirrors how token dragging already
  // suppresses its own trailing click via stopPropagation.
  const suppressNextClickRef = useRef(false);

  const mode = battleMap?.mode ?? "grid";
  const tokens = battleMap?.tokens ?? [];
  const playerRefIds = new Set(tokens.filter((t) => t.type === "player").map((t) => t.refId));
  const addablePlayers = users.filter((u) => !playerRefIds.has(u.id));
  const selectedToken = tokens.find((t) => t.id === selectedTokenId) ?? null;

  // If the selected token was removed (by this user or anyone else), clear
  // the local selection — this is what makes another player's removal clear
  // your toolbar automatically, with no server involvement.
  useEffect(() => {
    if (selectedTokenId && !tokens.some((t) => t.id === selectedTokenId)) {
      setSelectedTokenId(null);
    }
  }, [tokens, selectedTokenId]);

  // Escape closes the toolbar, per spec.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedTokenId(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploadError(null);

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setUploadError("Please choose a PNG, JPG, or WEBP image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("That image is too large — please use something under 5MB.");
      return;
    }
    // Resized/compressed client-side before it's ever sent, so most uploads
    // end up well under the cap even for large source photos.
    resizeImageFile(file)
      .then(onSetImage)
      .catch(() => setUploadError("Couldn't process that image — please try again."));
  }

  // Mouse-wheel zoom, toward the cursor. Uses a native (non-React) event
  // listener attached directly to the viewport element, not JSX's onWheel —
  // React attaches onWheel as a passive listener, which silently prevents
  // preventDefault() from working, so the page would scroll underneath the
  // map instead of the map zooming. Attaching natively, and scoped to just
  // this element, is also what keeps this from affecting scrolling
  // anywhere else on the page.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = viewport!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12; // scroll up = zoom in
      const currentZoom = zoomRef.current;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * factor));
      if (newZoom === currentZoom) return; // already at a boundary

      // Standard "zoom toward a point" approach: find what map-content point
      // is currently under the cursor, then choose a new pan so that same
      // point stays under the cursor after the zoom changes.
      const currentPan = panRef.current;
      const contentX = (mouseX - currentPan.x) / currentZoom;
      const contentY = (mouseY - currentPan.y) / currentZoom;
      const rawPan = { x: mouseX - contentX * newZoom, y: mouseY - contentY * newZoom };
      const clamped = clampPan(rawPan, newZoom, rect.width, rect.height);

      // Update refs immediately (not just via the mirroring effects below),
      // so a burst of rapid wheel ticks — which can fire faster than React
      // re-renders — always compute from the truly latest values.
      zoomRef.current = newZoom;
      panRef.current = clamped;
      setZoom(newZoom);
      setPan(clamped);
    }

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // If the viewport itself resizes (e.g. entering/exiting Expanded Map
  // View, or the browser window resizing) while zoomed/panned, re-check the
  // pan boundaries against the new size — otherwise a pan that was valid
  // for the old size could briefly show empty space past the map's edge in
  // the new one.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const clamped = clampPan(panRef.current, zoomRef.current, width, height);
      if (clamped.x !== panRef.current.x || clamped.y !== panRef.current.y) {
        panRef.current = clamped;
        setPan(clamped);
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  function resetView() {
    zoomRef.current = MIN_ZOOM;
    panRef.current = { x: 0, y: 0 };
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  }

  // Click-and-drag panning on empty map space. Tokens and the context
  // toolbar already call stopPropagation() in their own onMouseDown — the
  // exact existing mechanism that already separates "clicking a token" from
  // "clicking the map" — so this handler naturally only ever fires for a
  // genuine empty-area mousedown, never one that started on a token.
  function handleMapMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return; // only the primary button pans
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const startPan = panRef.current;
    const currentZoom = zoomRef.current;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let raf: number | null = null;
    let pending: { x: number; y: number } | null = null;

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      pending = clampPan({ x: startPan.x + dx, y: startPan.y + dy }, currentZoom, rect.width, rect.height);
      if (raf) return; // throttle to one update per animation frame, same as token dragging
      raf = requestAnimationFrame(() => {
        raf = null;
        if (pending) {
          panRef.current = pending;
          setPan(pending);
        }
      });
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (moved) suppressNextClickRef.current = true;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      const drag = draggingRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;
      if (drag.raf) return; // throttle to one update per animation frame
      drag.raf = requestAnimationFrame(() => {
        drag.raf = null;
        const rect = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
        drag.lastPos = { x, y };
        // Live update: broadcasts instantly for smooth movement, but is
        // never written to disk (final=false) — only the position at the
        // end of the drag is persisted. See server/index.js battlemap:moveToken.
        onMoveToken(drag.tokenId, x, y, false);
      });
    },
    [onMoveToken]
  );

  function startDrag(tokenId: string) {
    draggingRef.current = { tokenId, raf: null, lastPos: null };
    setSelectedTokenId(tokenId);

    function onMouseMove(e: MouseEvent) {
      handlePointerMove(e.clientX, e.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (t) handlePointerMove(t.clientX, t.clientY);
    }
    function stop() {
      const drag = draggingRef.current;
      draggingRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stop);
      // One final, persisted update with the position the token was
      // actually released at — this is the only write that hits disk.
      if (drag?.lastPos) {
        onMoveToken(drag.tokenId, drag.lastPos.x, drag.lastPos.y, true);
      }
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", stop);
  }

  return (
    <div className="wrap">
      <div className="controls">
        <div className="control-group">
          <button className="ctrl-btn" onClick={() => fileInputRef.current?.click()}>Upload Map</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          {mode === "image" && (
            <button className="ctrl-btn" onClick={() => onSetMode("grid")}>Use Default Grid</button>
          )}
        </div>

        <div className="control-group">
          <select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}>
            <option value="">Add player token…</option>
            {addablePlayers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button
            className="ctrl-btn"
            disabled={!selectedPlayerId}
            onClick={() => {
              if (selectedPlayerId) onAddPlayerToken(selectedPlayerId);
              setSelectedPlayerId("");
            }}
          >
            Add
          </button>
        </div>

        <div className="control-group">
          <input
            placeholder="Monster/NPC name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            maxLength={40}
          />
          <select value={customType} onChange={(e) => setCustomType(e.target.value as "monster" | "npc")}>
            <option value="monster">Monster</option>
            <option value="npc">NPC</option>
          </select>
          <button
            className="ctrl-btn"
            disabled={!customName.trim()}
            onClick={() => {
              onAddCustomToken(customName.trim(), customType);
              setCustomName("");
            }}
          >
            Add
          </button>
        </div>
        <div className="control-group">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showTokenNames}
              onChange={(e) => setShowTokenNames(e.target.checked)}
            />
            Show Token Names
          </label>
        </div>
        <div className="control-group">
          <button
            className="ctrl-btn"
            disabled={zoom === MIN_ZOOM && pan.x === 0 && pan.y === 0}
            onClick={resetView}
          >
            Reset View
          </button>
        </div>
      </div>

      {uploadError && <p className="upload-error">{uploadError}</p>}

      <div ref={viewportRef} className="map-area">
        <div
          ref={containerRef}
          className="map-content"
          onMouseDown={handleMapMouseDown}
          onClick={() => {
            if (suppressNextClickRef.current) {
              suppressNextClickRef.current = false;
              return;
            }
            setSelectedTokenId(null);
          }}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            ...(mode === "image" && battleMap?.imageDataUrl ? { backgroundImage: `url(${battleMap.imageDataUrl})` } : {}),
          }}
        >
          {mode === "grid" && <div className="grid-overlay" />}

          {tokens.map((t: Token) => {
            const scale = SIZE_SCALE[t.size] ?? 1;
            const size = BASE_TOKEN_SIZE * scale;
            return (
              <div
                key={t.id}
                className={`token ${t.type} ${selectedTokenId === t.id ? "selected" : ""}`}
                style={{
                  left: `${t.x}%`,
                  top: `${t.y}%`,
                  width: size,
                  height: size,
                  background: t.color,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (e.button !== 0) return; // only the primary button starts a drag
                  startDrag(t.id);
                }}
                onClick={(e) => {
                  // The browser fires a native "click" after mouseup even though
                  // mousedown already stopped its own propagation — without this,
                  // that click bubbles to the map area's onClick and immediately
                  // clears the selection this same interaction just set.
                  e.stopPropagation();
                }}
                onContextMenu={(e) => {
                  e.preventDefault(); // show our toolbar instead of the browser's menu
                  e.stopPropagation();
                  setSelectedTokenId(t.id);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  startDrag(t.id);
                }}
              >
                <div className="token-face">
                  <span className="token-inner" style={{ color: getContrastTextColor(t.color) }}>
                    {t.label.slice(0, 2).toUpperCase()}
                  </span>
                  {t.imageUrl && !imageLoadFailed.has(t.imageUrl) && (
                    <img
                      key={t.imageUrl}
                      src={t.imageUrl}
                      alt={t.label}
                      className="token-image"
                      draggable={false}
                      onError={() => setImageLoadFailed((prev) => new Set(prev).add(t.imageUrl!))}
                    />
                  )}
                </div>
                {showTokenNames && <span className="token-label">{t.label}</span>}
              </div>
            );
          })}

          {selectedToken && (
            <div
              className="toolbar-anchor"
              style={{
                left: `${selectedToken.x}%`,
                top: `${selectedToken.y}%`,
                // Keeps the toolbar a constant, readable size regardless of
                // map zoom — otherwise it would visually grow right along
                // with everything else in this transformed layer (fine for a
                // token, not for UI controls). translate's own offset isn't
                // affected by the scale() that follows it, so this still
                // tracks the token correctly at any zoom level.
                transform: `translate(-50%, 28px) scale(${1 / zoom})`,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <ContextToolbar
                token={selectedToken}
                onRemove={() => {
                  onRemoveToken(selectedToken.id);
                  setSelectedTokenId(null);
                }}
                onColorChange={(hex) => onUpdateToken(selectedToken.id, { color: hex })}
                onSizeChange={(size) => onUpdateToken(selectedToken.id, { size })}
                onSetImage={(dataUrl) => onSetTokenImage(selectedToken.id, dataUrl)}
                onRemoveImage={() => onRemoveTokenImage(selectedToken.id)}
              />
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .wrap { display: flex; flex-direction: column; height: 100%; }
        .controls {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--rule);
          background: var(--panel);
        }
        .control-group { display: flex; gap: 6px; align-items: center; }
        .ctrl-btn {
          background: var(--panel-raised);
          border: 1px solid var(--gold);
          color: var(--gold);
          border-radius: 3px;
          padding: 7px 12px;
          font-family: var(--font-mono);
          font-size: 11px;
          white-space: nowrap;
        }
        .ctrl-btn:disabled { opacity: 0.4; }
        .ctrl-btn:not(:disabled):hover { background: var(--gold); color: var(--ink); }
        select, input {
          background: var(--ink);
          border: 1px solid var(--rule);
          border-radius: 3px;
          padding: 7px 8px;
          color: var(--parchment);
          font-size: 12px;
          font-family: var(--font-body);
        }
        .upload-error { color: var(--crimson); font-size: 12px; padding: 6px 16px 0; margin: 0; }
        .toggle-label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--parchment-dim);
          font-family: var(--font-mono);
          font-size: 11px;
          white-space: nowrap;
          cursor: pointer;
        }
        .toggle-label input { cursor: pointer; }
        .map-area {
          position: relative;
          flex: 1;
          min-height: 320px;
          background-color: var(--ink);
          overflow: hidden;
        }
        .map-content {
          position: relative;
          width: 100%;
          height: 100%;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          cursor: grab;
        }
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            repeating-linear-gradient(to right, rgba(236, 228, 211, 0.08) 0, rgba(236, 228, 211, 0.08) 1px, transparent 1px, transparent 2%),
            repeating-linear-gradient(to bottom, rgba(236, 228, 211, 0.08) 0, rgba(236, 228, 211, 0.08) 1px, transparent 1px, transparent 2%);
        }
        .token {
          position: absolute;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          border: 2px solid var(--ink);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
          user-select: none;
          touch-action: none;
        }
        .token.monster, .token.npc { border-radius: 6px; }
        .token.selected { outline: 2px solid var(--gold); outline-offset: 2px; }
        .token-face {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .token-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
        }
        .token-inner {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          pointer-events: none;
        }
        .token-label {
          position: absolute;
          top: 100%;
          margin-top: 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--parchment);
          background: rgba(22, 19, 32, 0.85);
          padding: 1px 5px;
          border-radius: 3px;
          white-space: nowrap;
          pointer-events: none;
        }
        .toolbar-anchor {
          position: absolute;
          z-index: 10;
        }
      `}</style>
    </div>
  );
}
