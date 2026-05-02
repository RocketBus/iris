'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import type { ToolComparison, ToolRow } from '@/types/tool-comparison';

interface ToolComparisonProps {
  data: ToolComparison;
}

function fmtPct(value: number | null, decimals = 0): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

function fmtCommits(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function Row({ row }: { row: ToolRow }) {
  const { t } = useTranslation();
  return (
    <tr
      className={cn(
        'border-b border-border last:border-0 hover:bg-muted/30',
        row.belowThreshold && 'text-muted-foreground',
      )}
    >
      <td className="px-4 py-3 font-medium">
        {row.tool}
        {row.belowThreshold && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({t('toolComparison.belowThreshold')})
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtCommits(row.commits)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(row.durability)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(row.cascadeRate)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(row.revertRate, 1)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(row.singlePassRate)}</td>
    </tr>
  );
}

export function ToolComparison({ data }: ToolComparisonProps) {
  const { t } = useTranslation();

  if (data.significantTools === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('toolComparison.title')}</CardTitle>
          <CardDescription>{t('toolComparison.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('toolComparison.noSignificant', { threshold: data.commitThreshold })}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('toolComparison.title')}</CardTitle>
        <CardDescription>{t('toolComparison.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">
                  {t('toolComparison.columnTool')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('toolComparison.columnCommits')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('toolComparison.columnDurability')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('toolComparison.columnCascade')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('toolComparison.columnRevert')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('toolComparison.columnSinglePass')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <Row key={row.tool} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {t('toolComparison.thresholdNote', { threshold: data.commitThreshold })}
        </p>
      </CardContent>
    </Card>
  );
}
