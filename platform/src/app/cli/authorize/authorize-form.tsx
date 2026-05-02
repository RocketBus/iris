"use client";

import { useState } from "react";

import { Building2, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface AuthorizeFormProps {
  organizations: Organization[];
  port: string;
  state: string;
}

export function AuthorizeForm({ organizations, port, state }: AuthorizeFormProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleAuthorize(org: Organization) {
    setLoading(org.id);
    setError(null);

    try {
      const res = await fetch("/api/cli/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: org.id,
          port,
          state,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('cliAuthorize.authorizationFailed'));
        setLoading(null);
        return;
      }

      // Redirect to CLI's local callback
      setDone(true);
      window.location.href = data.redirect_url;
    } catch {
      setError(t('cliAuthorize.networkError'));
      setLoading(null);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <p className="text-sm font-medium">{t('cliAuthorize.done')}</p>
        <p className="text-xs text-muted-foreground">{t('cliAuthorize.doneSubtitle')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {organizations.map((org) => (
        <button
          key={org.id}
          onClick={() => handleAuthorize(org)}
          disabled={loading !== null}
          className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{org.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{org.role}</p>
          </div>
          {loading === org.id ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Button size="sm" variant="outline" asChild>
              <span>{t('cliAuthorize.authorizeButton')}</span>
            </Button>
          )}
        </button>
      ))}

      {error && (
        <p className="mt-2 text-center text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
