"use client";

import { motion } from "motion/react";
import { pulseData, getColor } from "./pulse-data";

export function DeliveryPulse() {
  const maxCommits = Math.max(...pulseData.map((d) => d.commits));

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-1.5 sm:gap-2 min-w-[500px] px-2">
        {pulseData.map((week, i) => {
          const height = Math.max(12, (week.commits / maxCommits) * 80);
          const color = getColor(week.stabilization);

          return (
            <div key={week.week} className="flex flex-col items-center gap-1.5 flex-1">
              <motion.div
                className="w-full rounded-sm pulse-breathe"
                style={{ backgroundColor: color }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height, opacity: 1 }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
              <span className="font-mono text-[10px] text-muted-foreground">
                {week.week}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-signal-purple" />
          Stable
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-signal-yellow" />
          Moderate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-signal-red" />
          Volatile
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-signal-gray" />
          No data
        </span>
      </div>
    </div>
  );
}
