import { ArrowUp, ArrowDown } from "lucide-react";

import { Sparkline } from "./Sparkline";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HeroMetricCardProps {
  label: string;
  value: string;
  delta?: number | null;
  deltaFormat?: "pp" | "abs" | "pct";
  invertDelta?: boolean;
  sparkline?: number[];
  qualifier?: string;
}

export function HeroMetricCard({
  label,
  value,
  delta,
  deltaFormat = "pp",
  invertDelta = false,
  sparkline,
  qualifier,
}: HeroMetricCardProps) {
  const hasDelta = delta !== null && delta !== undefined && delta !== 0;
  const isPositive = hasDelta && delta > 0;
  const isNegative = hasDelta && delta < 0;
  const isGood = invertDelta ? isNegative : isPositive;
  const isBad = invertDelta ? isPositive : isNegative;

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
      <CardContent className="pt-3 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {hasDelta && (
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
              ) : (
                <ArrowDown className="size-3" />
              )}
              {formatDelta(delta)}
            </span>
          )}
        </div>
        {qualifier && (
          <p className="mt-0.5 text-xs text-muted-foreground">{qualifier}</p>
        )}
        {sparkline && sparkline.length >= 2 && (
          <div className="mt-2">
            <Sparkline data={sparkline} width={100} height={20} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
