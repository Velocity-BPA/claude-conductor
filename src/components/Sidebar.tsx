import { clsx } from "clsx";
import { useStore } from "@/stores";
import type { ActiveView } from "@/types";

interface NavItem {
  id: ActiveView;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "profiles", label: "Profiles", icon: "⊞" },
  { id: "monitor", label: "Running", icon: "◉" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  const { activeView, setActiveView, instances } = useStore();
  const runningCount = instances.length;

  return (
    <aside className="w-[60px] flex flex-col items-center py-3 gap-1 bg-bg-surface border-r border-bg-border shrink-0">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveView(item.id)}
          title={item.label}
          className={clsx(
            "relative w-10 h-10 flex items-center justify-center rounded-[6px]",
            "text-lg transition-all duration-150 hover:bg-bg-elevated",
            activeView === item.id
              ? "bg-accent/15 text-accent"
              : "text-text-muted hover:text-text-secondary"
          )}
        >
          {item.icon}
          {item.id === "monitor" && runningCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-accent text-bg-base text-[9px] font-bold px-0.5">
              {runningCount}
            </span>
          )}
        </button>
      ))}
    </aside>
  );
}
