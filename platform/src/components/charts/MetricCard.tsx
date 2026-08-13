import { ArrowUp, ArrowDown, Minus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: number | null;
  deltaFormat?: "pp" | "abs" | "pct";
  invertDelta?: boolean; // true = negative delta is good (e.g. revert rate)
  /**
   * true = this metric is raw activity volume (e.g. commit count), not an
   * outcome — up or down is neither good nor bad on its own, so the delta
   * renders in a neutral color instead of purple/red.
   */
  neutral?: boolean;
  /** Small caption under the value — e.g. a sample-size caveat. */
  hint?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaFormat = "pp",
  invertDelta = false,
  neutral = false,
  hint,
}: MetricCardProps) {
  const hasDelta = delta !== null && delta !== undefined;
  const isPositive = hasDelta && delta > 0;
  const isNegative = hasDelta && delta < 0;
  const isGood = !neutral && (invertDelta ? isNegative : isPositive);
  const isBad = !neutral && (invertDelta ? isPositive : isNegative);

  function formatDelta(d: number): string {
    const abs = Math.abs(d);
    const sign = d > 0 ? "+" : "";
    switch (deltaFormat) {
      case "pp":
        return `${sign}${(abs * 100).toFixed(0)}pp`;
      case "pct":
        return `${sign}${(abs * 100).toFixed(0)}%`;
      case "abs":
        return `${sign}${abs.toFixed(0)}`;
    }
  }

  return (
    <Card>
      <CardContent className="pt-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {hasDelta && delta !== 0 && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                isGood && "text-signal-purple",
                isBad && "text-signal-red",
                !isGood && !isBad && "text-muted-foreground",
              )}
            >
              {isPositive ? (
                <ArrowUp className="size-3" />
              ) : isNegative ? (
                <ArrowDown className="size-3" />
              ) : (
                <Minus className="size-3" />
              )}
              {formatDelta(delta)}
            </span>
          )}
        </div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
