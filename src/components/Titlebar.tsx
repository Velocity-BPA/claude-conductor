import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { clsx } from "clsx";

export function Titlebar() {
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  const handleMinimize = async () => {
    const win = getCurrentWindow();
    await win.minimize();
  };

  const handleHide = async () => {
    const win = getCurrentWindow();
    await win.hide();
  };

  const confirmQuit = async () => {
    await invoke("force_quit");
  };

  return (
    <>
      {/*
        Key fix: the drag region is an ABSOLUTE layer that fills the bar.
        The buttons sit in the normal flow ON TOP of it (z-10 > z-0).
        This way Tauri's drag handler never intercepts button mousedown events.
      */}
      <div
        className="relative flex items-center h-10 px-4 bg-bg-surface border-b border-bg-border shrink-0 select-none"
        style={{ minHeight: 40 }}
      >
        {/* Drag region — fills the whole bar but sits behind everything */}
        <div
          data-tauri-drag-region
          className="absolute inset-0 z-0"
        />

        {/* Traffic lights — in normal flow, z-10 so they're above the drag region */}
        <div className="relative z-10 flex items-center gap-1.5">
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

        {/* Centered title — also above drag region but pointer-events-none so drag still works */}
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="text-accent font-display font-700 text-sm tracking-wide">
            CONDUCTOR
          </span>
          <span className="text-text-muted text-xs font-mono ml-2">v0.1</span>
        </div>

        {/* Right spacer — balances the traffic lights visually */}
        <div className="relative z-10 ml-auto w-[72px]" />
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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      className="w-3 h-3 rounded-full flex items-center justify-center transition-all active:scale-90"
      style={{
        background: color,
        filter: hovered ? "brightness(0.82)" : undefined,
      }}
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
