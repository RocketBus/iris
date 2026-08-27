"use client";

import { GitHubAvatar } from "@/app/[tenant]/repos/[repoName]/github-avatar";
import { useTranslation } from "@/hooks/useTranslation";
import type { HyperEngineer } from "@/types/org-summary";

interface HyperEngineersProps {
  engineers: HyperEngineer[];
}

function EngineerCard({
  eng,
  t,
}: {
  eng: HyperEngineer;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      {eng.github ? (
        <GitHubAvatar username={eng.github} name={eng.name} />
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {eng.name.charAt(0).toUpperCase()}
        </div>
      )}
      {eng.github ? (
        <a
          href={`https://github.com/${eng.github}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm hover:text-primary transition-colors"
        >
          {eng.name}
        </a>
      ) : (
        <span className="text-sm">{eng.name}</span>
      )}
      <span title={t("dashboard.hyperEngineers.badge")}>&#x1F3C6;</span>
      {eng.repos > 1 && (
        <span className="text-xs text-muted-foreground">
          {t("dashboard.hyperEngineers.repos", { count: eng.repos })}
        </span>
      )}
    </div>
  );
}

export function HyperEngineers({ engineers }: HyperEngineersProps) {
  const { t } = useTranslation();
  if (engineers.length === 0) return null;

  // Split by whether we could resolve a real GitHub identity. Two people
  // (or two aliases of the same person iris/cli.py couldn't tie together —
  // e.g. a personal email that isn't linked/verified on their GitHub
  // account) can share a display name, so "identified" is the group we can
  // actually confirm and link to a profile; "unidentified" is everyone else,
  // shown separately rather than mixed in or hidden outright.
  const identified = engineers.filter((eng) => eng.github);
  const unidentified = engineers.filter((eng) => !eng.github);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">
          {t("dashboard.hyperEngineers.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.hyperEngineers.subtitle")}
        </p>
      </div>

      {identified.length > 0 && (
        <div className="space-y-2">
          {unidentified.length > 0 && (
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("dashboard.hyperEngineers.identified")}
            </h3>
          )}
          <div className="flex flex-wrap gap-2">
            {identified.map((eng) => (
              <EngineerCard key={eng.name} eng={eng} t={t} />
            ))}
          </div>
        </div>
      )}

      {unidentified.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("dashboard.hyperEngineers.unidentified")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {unidentified.map((eng) => (
              <EngineerCard key={eng.name} eng={eng} t={t} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
