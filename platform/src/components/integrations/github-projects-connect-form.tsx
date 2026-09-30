"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";

interface Board {
  owner: string;
  ownerType?: string;
  number: number;
  teamSlug?: string;
}

export type GithubProjectsIntegrationStatus =
  | { status: "not_connected" }
  | {
      status: "active" | "error" | "disconnected";
      board: Board | null;
      boardTitle: string | null;
      tokenMask: string | null;
      lastSyncAt: string | null;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
    };

interface Props {
  organizationId: string;
  initial: GithubProjectsIntegrationStatus;
}

/**
 * Connects exactly one board — the config shape (`org_integrations.config`)
 * supports an array, but multi-board management and `statusConfig` column
 * mapping have no UI yet (see docs/integrations/github-projects.md); set
 * those by hand for now. This form covers the common case: one board, one
 * token, generic column-name heuristics.
 */
export function GithubProjectsConnectForm({ organizationId, initial }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const [state, setState] = useState<GithubProjectsIntegrationStatus>(initial);
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [ownerType, setOwnerType] = useState<"organization" | "user">(
    "organization",
  );
  const [number, setNumber] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Same reasoning as DatadogConnectForm: show the connected surface (with
  // whatever last_error there is) for both active AND error states, so a
  // failing sync stays visible instead of falling back to an empty form.
  const isLive = state.status === "active" || state.status === "error";
  const inErrorState = state.status === "error";

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const parsedNumber = Number(number);
    if (!token || !owner || !Number.isInteger(parsedNumber)) return;

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/integrations/github_projects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            owner,
            ownerType,
            number: parsedNumber,
            teamSlug: teamSlug || undefined,
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        toast.error(
          body.message ??
            t("settings.integrations.githubProjects.connectError"),
        );
        return;
      }
      toast.success(t("settings.integrations.githubProjects.connectSuccess"));
      setToken("");
      setState({
        status: "active",
        board: body.board,
        boardTitle: body.boardTitle,
        tokenMask: body.tokenMask,
        lastSyncAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("settings.integrations.githubProjects.connectError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/integrations/github_projects`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          body.message ??
            t("settings.integrations.githubProjects.disconnectError"),
        );
        return;
      }
      toast.success(
        t("settings.integrations.githubProjects.disconnectSuccess"),
      );
      setState({ status: "not_connected" });
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("settings.integrations.githubProjects.disconnectError"),
      );
    } finally {
      setDisconnecting(false);
    }
  }

  if (isLive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck
              className={
                inErrorState ? "size-5 text-destructive" : "size-5 text-primary"
              }
            />
            {inErrorState
              ? t("settings.integrations.githubProjects.errorTitle")
              : t("settings.integrations.githubProjects.connectedTitle")}
          </CardTitle>
          <CardDescription>
            {inErrorState
              ? t("settings.integrations.githubProjects.errorDescription")
              : t("settings.integrations.githubProjects.connectedDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">
                {t("settings.integrations.githubProjects.fields.board")}
              </dt>
              <dd className="font-mono">
                {state.boardTitle ?? "—"}
                {state.board && (
                  <span className="ml-2 text-muted-foreground">
                    ({state.board.owner}/{state.board.number})
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("settings.integrations.githubProjects.fields.token")}
              </dt>
              <dd className="font-mono">{state.tokenMask ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("settings.integrations.githubProjects.fields.lastSyncAt")}
              </dt>
              <dd>
                {state.lastSyncAt
                  ? new Date(state.lastSyncAt).toLocaleString()
                  : t(
                      "settings.integrations.githubProjects.fields.neverSynced",
                    )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("settings.integrations.githubProjects.fields.connectedAt")}
              </dt>
              <dd>{new Date(state.createdAt).toLocaleString()}</dd>
            </div>
          </dl>

          {state.lastError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {state.lastError}
            </p>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 size-4" />
                {t("settings.integrations.githubProjects.disconnectButton")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(
                    "settings.integrations.githubProjects.disconnectDialog.title",
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    "settings.integrations.githubProjects.disconnectDialog.description",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t(
                    "settings.integrations.githubProjects.disconnectDialog.cancel",
                  )}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {t(
                    "settings.integrations.githubProjects.disconnectDialog.confirm",
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("settings.integrations.githubProjects.connectTitle")}
        </CardTitle>
        <CardDescription>
          {t("settings.integrations.githubProjects.connectDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleConnect} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gh-token">
              {t("settings.integrations.githubProjects.fields.token")}
            </Label>
            <Input
              id="gh-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_…"
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.integrations.githubProjects.fields.tokenHint")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gh-owner">
                {t("settings.integrations.githubProjects.fields.owner")}
              </Label>
              <Input
                id="gh-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="acme-inc"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gh-owner-type">
                {t("settings.integrations.githubProjects.fields.ownerType")}
              </Label>
              <Select
                value={ownerType}
                onValueChange={(v) =>
                  setOwnerType(v === "user" ? "user" : "organization")
                }
              >
                <SelectTrigger id="gh-owner-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">
                    {t(
                      "settings.integrations.githubProjects.fields.ownerTypeOrg",
                    )}
                  </SelectItem>
                  <SelectItem value="user">
                    {t(
                      "settings.integrations.githubProjects.fields.ownerTypeUser",
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gh-number">
              {t("settings.integrations.githubProjects.fields.number")}
            </Label>
            <Input
              id="gh-number"
              type="number"
              min={1}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="42"
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.integrations.githubProjects.fields.numberHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gh-team-slug">
              {t("settings.integrations.githubProjects.fields.teamSlug")}
            </Label>
            <Input
              id="gh-team-slug"
              value={teamSlug}
              onChange={(e) => setTeamSlug(e.target.value)}
              placeholder="platform"
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.integrations.githubProjects.fields.teamSlugHint")}
            </p>
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("settings.integrations.githubProjects.connectButton")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
