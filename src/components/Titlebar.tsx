import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { clsx } from "clsx";

export function Titlebar() {
  const win = getCurrentWindow();
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  const handleMinimize = () => win.minimize();
  const handleHide = () => win.hide();
  const confirmQuit = async () => {
    await invoke("force_quit");
  };

  return (
    <>
      <div
        data-tauri-drag-region
        className="flex items-center justify-between h-10 px-4 bg-bg-surface border-b border-bg-border shrink-0 select-none"
        style={{ minHeight: 40 }}
      >
        {/* Traffic lights — left, macOS order: close · minimize · zoom */}
        <div className="flex items-center gap-1.5">
          <TrafficButton
            color="#ff605c"
            hoverSymbol="✕"
            hoverTextColor="#4d0000"
            title="Quit"
            onClick={() => setShowQuitConfirm(true)}
          />
          <TrafficButton
            color="#f6be00"
            hoverSymbol="−"
            hoverTextColor="#4d3800"
            title="Minimize"
            onClick={handleMinimize}
          />
          <TrafficButton
            color="#00ca4e"
            hoverSymbol="+"
            hoverTextColor="#003d18"
            title="Hide to tray"
            onClick={handleHide}
          />
        </div>

        {/* Centered title */}
        <div
          data-tauri-drag-region
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none"
        >
          <span className="text-accent font-display font-700 text-sm tracking-wide">
            CONDUCTOR
          </span>
          <span className="text-text-muted text-xs font-mono">v0.1</span>
        </div>

        {/* Right spacer to balance layout */}
        <div className="w-[72px]" data-tauri-drag-region />
      </div>

      {showQuitConfirm && (
        <QuitConfirmDialog
          onConfirm={confirmQuit}
          onCancel={() => setShowQuitConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Traffic light button ─────────────────────────────────────────────────────

function TrafficButton({
  color,
  hoverSymbol,
  hoverTextColor,
  title,
  onClick,
}: {
  color: string;
  hoverSymbol: string;
  hoverTextColor: string;
  title: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      className="w-3 h-3 rounded-full flex items-center justify-center transition-all active:brightness-75"
      style={{ background: color, filter: hovered ? "brightness(0.85)" : undefined }}
    >
      {hovered && (
        <span
          className="text-[8px] font-bold leading-none"
          style={{ color: hoverTextColor }}
        >
          {hoverSymbol}
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
            Any running Claude Desktop instances will continue running independently.
            You can reopen Conductor anytime from the menu bar.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            className={clsx("btn-primary")}
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
