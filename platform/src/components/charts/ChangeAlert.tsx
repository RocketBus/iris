import Link from "next/link";

import { AlertTriangle, TrendingDown, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ChangeDetection } from "@/types/temporal";

interface ChangeAlertProps {
  changes: ChangeDetection[];
  tenantSlug: string;
}

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    bg: "bg-signal-red/10 hover:bg-signal-red/15",
    border: "border-signal-red/30 hover:border-signal-red/50",
    text: "text-signal-red",
  },
  warning: {
    icon: TrendingDown,
    bg: "bg-signal-yellow/10 hover:bg-signal-yellow/15",
    border: "border-signal-yellow/30 hover:border-signal-yellow/50",
    text: "text-signal-yellow",
  },
  info: {
    icon: Info,
    bg: "bg-primary/10 hover:bg-primary/15",
    border: "border-primary/30 hover:border-primary/50",
    text: "text-primary",
  },
};

export function ChangeAlert({ changes, tenantSlug }: ChangeAlertProps) {
  if (changes.length === 0) return null;

  return (
    <div className="space-y-2">
      {changes.map((change, i) => {
        const config = severityConfig[change.severity];
        const Icon = config.icon;
        return (
          <Link
            key={`${change.repository_id}-${change.metric}-${i}`}
            href={`/${tenantSlug}/repos/${encodeURIComponent(change.repository_name)}`}
            className={cn(
              "flex items-start gap-2 rounded-md border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              config.bg,
              config.border,
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", config.text)} />
            <div>
              <span className="text-sm font-medium">
                {change.repository_name}
              </span>
              <span className="text-sm text-muted-foreground">
                {" — "}
                {change.description}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
