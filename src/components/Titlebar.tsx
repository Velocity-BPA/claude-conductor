import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function Titlebar() {
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  const startDrag = (e: React.MouseEvent) => {
    // Only drag on primary mouse button, and not if a button was the target
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    getCurrentWindow().startDragging();
  };

  return (
    <>
      <div
        className="flex items-center h-10 px-4 bg-bg-surface border-b border-bg-border shrink-0 select-none"
        style={{ minHeight: 40 }}
        onMouseDown={startDrag}
      >
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <TrafficButton
            color="#ff605c"
            symbol="✕"
            title="Quit Conductor"
            onClick={() => setShowQuitConfirm(true)}
          />
          <TrafficButton
            color="#f6be00"
            symbol="−"
            title="Minimize"
            onClick={() => invoke("minimize_window")}
          />
          <TrafficButton
            color="#00ca4e"
            symbol="⤢"
            title="Maximize"
            onClick={() => invoke("toggle_maximize")}
          />
        </div>

        {/* Centered title */}
        <div className="absolute left-0 right-0 flex items-center justify-center pointer-events-none h-10">
          <span className="text-accent font-display font-700 text-sm tracking-wide">
            CONDUCTOR
          </span>
          <span className="text-text-muted text-xs font-mono ml-2">v0.1</span>
        </div>

        {/* Right spacer */}
        <div className="ml-auto w-[60px]" />
      </div>

      {showQuitConfirm && (
        <QuitConfirmDialog
          onConfirm={() => invoke("force_quit")}
          onCancel={() => setShowQuitConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Traffic light button ─────────────────────────────────────────────────────

function TrafficButton({
  color,
  symbol,
  title,
  onClick,
}: {
  color: string;
  symbol: string;
  title: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      className="w-3 h-3 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-default"
      style={{
        background: color,
        filter: hovered ? "brightness(0.82)" : undefined,
      }}
    >
      {hovered && (
        <span className="text-[8px] font-bold leading-none" style={{ color: "rgba(0,0,0,0.45)" }}>
          {symbol}
        </span>
      )}
    </button>
  );
}

// ─── Quit Confirm Dialog ──────────────────────────────────────────────────────

function QuitConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="card w-[340px] p-6 flex flex-col gap-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-display font-700 text-text-primary text-base">
            Quit Conductor?
          </h2>
          <p className="text-text-secondary text-sm mt-1.5 leading-relaxed">
            Any running Claude Desktop instances will keep running independently.
            You can reopen Conductor anytime from the menu bar.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            className="btn-primary"
            style={{ background: "#ff605c", borderColor: "#ff605c" }}
            onClick={onConfirm}
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}
