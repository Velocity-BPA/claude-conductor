import { useEffect } from "react";
import { useStore } from "@/stores";

export function ErrorToast() {
  const { error, clearError } = useStore();

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 5000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  if (!error) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-bg-elevated border border-status-error/30 shadow-lg max-w-sm">
        <span className="text-status-error text-sm shrink-0">⚠</span>
        <span className="text-text-primary text-sm flex-1">{error}</span>
        <button
          onClick={clearError}
          className="text-text-muted hover:text-text-primary text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
