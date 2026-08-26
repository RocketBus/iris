"use client";

import { useState } from "react";

import Link from "next/link";

import { ArrowDownWideNarrow, Clock, Search, Trash2 } from "lucide-react";

import { DeleteRepositoryDialog } from "@/components/repos/DeleteRepositoryDialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { RepoSummary } from "@/types/temporal";
import { healthIndicator } from "@/types/temporal";

interface RepoListProps {
  repos: RepoSummary[];
  orgSlug: string;
  organizationId?: string;
  canDelete?: boolean;
  showSearch?: boolean;
  /** Server-computed timestamp (ms) — the "stale" filter's cutoff is derived
   * from this instead of calling Date.now() during a client render. */
  nowMs: number;
}

const healthColors: Record<string, string> = {
  green: "bg-signal-purple",
  yellow: "bg-signal-yellow",
  red: "bg-signal-red",
  gray: "bg-signal-gray",
};

const STALE_MS = 90 * 24 * 60 * 60 * 1000;

export function RepoList({
  repos,
  orgSlug,
  organizationId,
  canDelete = false,
  showSearch = false,
  nowMs,
}: RepoListProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [sortByAi, setSortByAi] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const showDeleteColumn = canDelete && !!organizationId;
  // nowMs comes from the server component (page.tsx) rather than a
  // Date.now() call here — calling it directly during a client render
  // isn't pure.
  const staleCutoff = nowMs - STALE_MS;

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        <p>{t("dashboard.repoList.empty")}</p>
        <Button asChild size="sm">
          <Link href={`/${orgSlug}/connect`}>
            {t("connect.emptyStateLink")}
          </Link>
        </Button>
      </div>
    );
  }

  let filtered = query
    ? repos.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
    : repos;

  if (staleOnly) {
    filtered = filtered.filter(
      (r) => !r.last_run_at || new Date(r.last_run_at).getTime() < staleCutoff,
    );
  }

  // Repos without AI data sort to the end regardless of direction.
  const sorted = sortByAi
    ? [...filtered].sort(
        (a, b) =>
          (b.ai_detection_coverage_pct ?? -1) -
          (a.ai_detection_coverage_pct ?? -1),
      )
    : filtered;

  return (
    <div className="space-y-2">
      {showSearch && repos.length > 5 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("dashboard.repoList.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            type="button"
            variant={sortByAi ? "default" : "outline"}
            size="sm"
            onClick={() => setSortByAi((v) => !v)}
            className="flex-shrink-0"
          >
            <ArrowDownWideNarrow className="size-4" />
            {t("dashboard.repoList.sortByAi")}
          </Button>
          <Button
            type="button"
            variant={staleOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setStaleOnly((v) => !v)}
            className="flex-shrink-0"
          >
            <Clock className="size-4" />
            {t("dashboard.repoList.staleOnly")}
          </Button>
        </div>
      )}
      {sorted.map((repo) => {
        const color = healthIndicator(repo.health);
        const aiPct = repo.ai_detection_coverage_pct;
        const humanPct = aiPct != null ? 100 - aiPct : null;

        return (
          <div
            key={repo.id}
            className="flex min-h-12 items-stretch rounded-md border border-border transition-colors"
          >
            <Link
              href={`/${orgSlug}/repos/${encodeURIComponent(repo.name)}`}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md p-3 transition-colors",
                "hover:bg-muted/50 active:bg-muted/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                {/* Health dot */}
                <div
                  className={cn(
                    "size-2.5 flex-shrink-0 rounded-full",
                    healthColors[color],
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium">
                    {repo.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {repo.runs_count} runs
                    {repo.last_run_at &&
                      ` · last ${new Date(repo.last_run_at).toISOString().slice(0, 10)}`}
                  </p>
                </div>
              </div>

              {/* Commit mix — share of commits by origin */}
              <div className="flex flex-shrink-0 items-center gap-3 text-xs">
                {humanPct !== null && aiPct !== null ? (
                  <>
                    <span className="text-muted-foreground">
                      {t("dashboard.repoList.human")} {humanPct.toFixed(0)}%
                    </span>
                    <span className="text-primary">
                      {t("dashboard.repoList.ai")} {aiPct.toFixed(0)}%
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{"—"}</span>
                )}
              </div>
            </Link>

            {showDeleteColumn && (
              <div className="flex items-center pr-2">
                <DeleteRepositoryDialog
                  repositoryId={repo.id}
                  repositoryName={repo.name}
                  organizationId={organizationId!}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={t("repos.deleteButton")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </DeleteRepositoryDialog>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
