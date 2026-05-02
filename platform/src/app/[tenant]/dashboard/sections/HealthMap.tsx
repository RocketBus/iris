'use client';

import { ArrowUp, ArrowDown } from 'lucide-react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import type { HealthMapEntry } from '@/types/org-summary';

interface HealthMapProps {
  entries: HealthMapEntry[];
  orgSlug: string;
}

function stabToColor(value: number): string {
  if (value >= 0.7) return '#A528FF'; // green
  if (value >= 0.5) return '#eab308'; // yellow
  return '#ef4444'; // red
}

function healthColor(health: string): string {
  switch (health) {
    case 'healthy':
      return 'text-signal-purple';
    case 'warning':
      return 'text-signal-yellow';
    case 'critical':
      return 'text-signal-red';
    default:
      return 'text-muted-foreground';
  }
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  stabilization?: number;
}

function CustomTreemapContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = '',
  stabilization = 0,
}: TreemapContentProps) {
  if (width < 30 || height < 20) return null;

  const color = stabToColor(stabilization);
  const showLabel = width > 50 && height > 30;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.25}
        stroke="var(--border)"
        strokeWidth={1}
        rx={4}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--foreground)"
          fontSize={width > 80 ? 11 : 9}
        >
          {name.length > 12 ? `${name.slice(0, 10)}...` : name}
        </text>
      )}
    </g>
  );
}

export function HealthMap({ entries }: HealthMapProps) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  const sorted = [...entries].sort(
    (a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0),
  );
  const improving = sorted.filter((e) => e.delta !== null && e.delta > 0.05).slice(0, 3);
  const worsening = sorted.filter((e) => e.delta !== null && e.delta < -0.05).slice(0, 3);

  const treemapData = entries.map((e) => ({
    name: e.name,
    size: Math.max(e.commits, 1),
    stabilization: e.stabilization,
  }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">{t('dashboard.healthMap.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.healthMap.subtitle')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Treemap */}
        <Card className="md:col-span-2">
          <CardContent className="pt-4">
            {/* Desktop: treemap */}
            <div className="hidden sm:block">
              <ResponsiveContainer width="100%" height={280}>
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  nameKey="name"
                  content={<CustomTreemapContent />}
                >
                  <Tooltip
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as
                        | { name: string; stabilization: number; size: number }
                        | undefined;
                      if (!p) return null;
                      return (
                        <div
                          className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md"
                        >
                          <p className="font-medium">{p.name}</p>
                          <p className="text-muted-foreground">
                            {t('dashboard.healthMap.tooltip', {
                              pct: (p.stabilization * 100).toFixed(0),
                              commits: p.size,
                            })}
                          </p>
                        </div>
                      );
                    }}
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>
            {/* Mobile: sorted list */}
            <ul className="flex flex-col gap-2 sm:hidden">
              {entries
                .sort((a, b) => b.commits - a.commits)
                .map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                  >
                    <span className="truncate font-mono text-sm">
                      {e.name}
                    </span>
                    <span
                      className={cn(
                        'flex-shrink-0 text-sm font-medium',
                        healthColor(e.health),
                      )}
                    >
                      {(e.stabilization * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>

        {/* Outliers */}
        <div className="space-y-4">
          {improving.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-signal-purple">
                  {t('dashboard.healthMap.improving')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {improving.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="truncate font-mono">{e.name}</span>
                    <span className="flex items-center gap-0.5 text-signal-purple">
                      <ArrowUp className="size-3" />
                      +{((e.delta ?? 0) * 100).toFixed(0)}pp
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {worsening.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-signal-red">
                  {t('dashboard.healthMap.worsening')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {worsening.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="truncate font-mono">{e.name}</span>
                    <span className="flex items-center gap-0.5 text-signal-red">
                      <ArrowDown className="size-3" />
                      {((e.delta ?? 0) * 100).toFixed(0)}pp
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {improving.length === 0 && worsening.length === 0 && (
            <Card>
              <CardContent className="pt-4 text-center text-sm text-muted-foreground">
                {t('dashboard.healthMap.noChanges')}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
