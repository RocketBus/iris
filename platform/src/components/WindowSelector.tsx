"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Analysis-window selector (issue #80). Writes the chosen window to the
 * `?window=` search param so the server component re-renders every view for
 * that window — the URL stays linkable and the choice survives a refresh.
 *
 * Renders nothing when fewer than two windows have data: with a single
 * ingested window there is nothing to switch between.
 */
export function WindowSelector({
  windowDays,
  options,
  paramKey = "window",
}: {
  windowDays: number;
  options: number[];
  paramKey?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (options.length < 2) return null;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramKey, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {t("common.windowSelector.label")}
      </span>
      <Select value={String(windowDays)} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-[112px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {t("common.windowSelector.option", { days })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
