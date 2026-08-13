import { WAIT_PHASES, WINDOW_PHASES } from "@/lib/queries/cycle-time-flow";
import { cn } from "@/lib/utils";
import type { FlowPhaseKey } from "@/types/org-summary";

/**
 * Tailwind colors per lifecycle phase. Mirrors the per-repo Flow Efficiency
 * card so the org-level bar reads consistently across the product.
 */
export const FLOW_PHASE_COLORS: Record<FlowPhaseKey, string> = {
  coding: "bg-signal-green",
  awaiting_first_review: "bg-signal-yellow",
  in_review_active: "bg-signal-purple",
  in_review_wait: "bg-signal-red",
  awaiting_merge: "bg-signal-gray",
};

interface FlowPhaseBarProps {
  /** Median hours per phase (org-aggregated). */
  phaseHours: Partial<Record<FlowPhaseKey, number>>;
  /** Localized label per phase. */
  labels: Record<FlowPhaseKey, string>;
  /** Format a phase duration for display (e.g. "14 h"). */
  formatHours: (hours: number) => string;
  /** Phase to highlight as the dominant (widest) one, if any. */
  dominantKey?: FlowPhaseKey | null;
  /** Localized footnote explaining the wait-phase hatch (optional). */
  waitNote?: string;
}

/**
 * Horizontal stacked bar + legend showing how the measured code window
 * (PR open -> merge) splits across its phases. Excludes `coding` (pre-open
 * authoring time), matching the verdict's window. Presentational only.
 */
export function FlowPhaseBar({
  phaseHours,
  labels,
  formatHours,
  dominantKey,
  waitNote,
}: FlowPhaseBarProps) {
  const total = WINDOW_PHASES.reduce(
    (sum, key) => sum + (phaseHours[key] ?? 0),
    0,
  );
  if (total <= 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full">
        {WINDOW_PHASES.map((key) => {
          const hours = phaseHours[key] ?? 0;
          if (hours === 0) return null;
          const pct = (hours / total) * 100;
          return (
            <div
              key={key}
              className={cn(
                "h-full",
                FLOW_PHASE_COLORS[key],
                key === dominantKey && "ring-2 ring-inset ring-foreground/40",
              )}
              style={{
                width: `${pct}%`,
                // Wait phases (queue time) get a diagonal hatch so active vs
                // wait reads at a glance — the flow-efficiency signal.
                ...(WAIT_PHASES.has(key) && {
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 1.5px, transparent 1.5px, transparent 4px)",
                }),
              }}
              title={`${labels[key]}: ${formatHours(hours)}`}
            />
          );
        })}
      </div>
      <div className="grid gap-1 text-xs">
        {WINDOW_PHASES.map((key) => {
          const hours = phaseHours[key] ?? 0;
          if (hours === 0) return null;
          return (
            <div
              key={key}
              className="flex items-center justify-between border-b border-border/40 py-1"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block size-2 rounded-full",
                    FLOW_PHASE_COLORS[key],
                  )}
                />
                <span
                  className={cn(
                    key === dominantKey && "font-medium text-foreground",
                  )}
                >
                  {labels[key]}
                </span>
              </span>
              <span className="font-mono text-muted-foreground">
                {formatHours(hours)}
              </span>
            </div>
          );
        })}
      </div>
      {waitNote && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {waitNote}
        </p>
      )}
    </div>
  );
}
