"use client";

import { useTransition } from "react";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { Loader2 } from "lucide-react";

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
  const [isPending, startTransition] = useTransition();

  if (options.length < 2) return null;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramKey, value);
    // Wrapping the navigation in a transition keeps this page visible with
    // isPending=true instead of unmounting to the route's loading.tsx — the
    // right feel for a filter (instant feedback on the control itself)
    // rather than a full-page flash. Also blocks a second click from firing
    // another replace() before the first one resolves.
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {t("common.windowSelector.label")}
      </span>
      <Select
        value={String(windowDays)}
        onValueChange={handleChange}
        disabled={isPending}
      >
        <SelectTrigger className="h-8 w-[112px]">
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <SelectValue />
          )}
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
