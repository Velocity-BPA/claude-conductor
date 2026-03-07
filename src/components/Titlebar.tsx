import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { clsx } from "clsx";

export function Titlebar() {
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  return (
    <>
      <div
        className="relative flex items-center h-10 px-4 bg-bg-surface border-b border-bg-border shrink-0 select-none"
        style={{ minHeight: 40 }}
      >
        {/* Drag region sits as absolute z-0 behind everything */}
        <div data-tauri-drag-region className="absolute inset-0 z-0" />

        {/* Traffic lights — z-10 so they receive clicks above the drag layer */}
        <div className="relative z-10 flex items-center gap-1.5">
          {/* Red — Quit */}
          <TrafficButton
            color="#ff605c"
            symbol="✕"
            title="Quit Conductor"
            onClick={() => setShowQuitConfirm(true)}
          />
          {/* Yellow — Minimize */}
          <TrafficButton
            color="#f6be00"
            symbol="−"
            title="Minimize"
            onClick={() => invoke("minimize_window")}
          />
          {/* Green — Hide to tray */}
          <TrafficButton
            color="#00ca4e"
            symbol="+"
            title="Hide to tray"
            onClick={() => invoke("hide_window")}
          />
        </div>

        {/* Centered title — pointer-events-none so drag region works behind it */}
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="text-accent font-display font-700 text-sm tracking-wide">
            CONDUCTOR
          </span>
          <span className="text-text-muted text-xs font-mono ml-2">v0.1</span>
        </div>

        {/* Right spacer balances the traffic lights */}
        <div className="relative z-10 ml-auto w-[60px]" />
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
      onMouseDown={(e) => {
        // Stop the drag region from intercepting this mousedown
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
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
        <span className="text-[8px] font-bold leading-none" style={{ color: "rgba(0,0,0,0.5)" }}>
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
            You can reopen Conductor from the menu bar icon.
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
