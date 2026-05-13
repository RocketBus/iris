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

const SITES: Array<{ value: string; label: string }> = [
  { value: "datadoghq.com", label: "US1 (datadoghq.com)" },
  { value: "us3.datadoghq.com", label: "US3 (us3.datadoghq.com)" },
  { value: "us5.datadoghq.com", label: "US5 (us5.datadoghq.com)" },
  { value: "datadoghq.eu", label: "EU (datadoghq.eu)" },
  { value: "ap1.datadoghq.com", label: "AP1 (ap1.datadoghq.com)" },
  { value: "ddog-gov.com", label: "US1-FED (ddog-gov.com)" },
];

export type DatadogIntegrationStatus =
  | { status: "not_connected" }
  | {
      status: "active" | "error" | "disconnected";
      site: string | null;
      apiKeyMask: string | null;
      lastSyncAt: string | null;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
      unmatchedDeploymentsCount: number;
    };

interface Props {
  organizationId: string;
  initial: DatadogIntegrationStatus;
}

export function DatadogConnectForm({ organizationId, initial }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const [state, setState] = useState<DatadogIntegrationStatus>(initial);
  const [apiKey, setApiKey] = useState("");
  const [appKey, setAppKey] = useState("");
  const [site, setSite] = useState<string>("datadoghq.com");
  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const isConnected = state.status === "active";

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey || !appKey || !site) return;

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/integrations/datadog`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey, appKey, site }),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        toast.error(
          body.message ?? t("settings.integrations.datadog.connectError"),
        );
        return;
      }
      toast.success(t("settings.integrations.datadog.connectSuccess"));
      setApiKey("");
      setAppKey("");
      setState({
        status: "active",
        site: body.site,
        apiKeyMask: body.apiKeyMask,
        lastSyncAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unmatchedDeploymentsCount: 0,
      });
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("settings.integrations.datadog.connectError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/integrations/datadog`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          body.message ?? t("settings.integrations.datadog.disconnectError"),
        );
        return;
      }
      toast.success(t("settings.integrations.datadog.disconnectSuccess"));
      setState({ status: "not_connected" });
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("settings.integrations.datadog.disconnectError"),
      );
    } finally {
      setDisconnecting(false);
    }
  }

  if (isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            {t("settings.integrations.datadog.connectedTitle")}
          </CardTitle>
          <CardDescription>
            {t("settings.integrations.datadog.connectedDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">
                {t("settings.integrations.datadog.fields.site")}
              </dt>
              <dd className="font-mono">{state.site}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("settings.integrations.datadog.fields.apiKey")}
              </dt>
              <dd className="font-mono">{state.apiKeyMask ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("settings.integrations.datadog.fields.lastSyncAt")}
              </dt>
              <dd>
                {state.lastSyncAt
                  ? new Date(state.lastSyncAt).toLocaleString()
                  : t("settings.integrations.datadog.fields.neverSynced")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t("settings.integrations.datadog.fields.connectedAt")}
              </dt>
              <dd>{new Date(state.createdAt).toLocaleString()}</dd>
            </div>
            {state.unmatchedDeploymentsCount > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">
                  {t(
                    "settings.integrations.datadog.fields.unmatchedDeployments",
                  )}
                </dt>
                <dd className="flex flex-col gap-1">
                  <span className="font-mono">
                    {state.unmatchedDeploymentsCount}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      "settings.integrations.datadog.fields.unmatchedDeploymentsHint",
                    )}
                  </span>
                </dd>
              </div>
            )}
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
                {t("settings.integrations.datadog.disconnectButton")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("settings.integrations.datadog.disconnectDialog.title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    "settings.integrations.datadog.disconnectDialog.description",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("settings.integrations.datadog.disconnectDialog.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {t("settings.integrations.datadog.disconnectDialog.confirm")}
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
        <CardTitle>{t("settings.integrations.datadog.connectTitle")}</CardTitle>
        <CardDescription>
          {t("settings.integrations.datadog.connectDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleConnect} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dd-api-key">
              {t("settings.integrations.datadog.fields.apiKey")}
            </Label>
            <Input
              id="dd-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="dd-api-…"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-app-key">
              {t("settings.integrations.datadog.fields.appKey")}
            </Label>
            <Input
              id="dd-app-key"
              type="password"
              autoComplete="off"
              value={appKey}
              onChange={(e) => setAppKey(e.target.value)}
              placeholder="dd-app-…"
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.integrations.datadog.fields.appKeyHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dd-site">
              {t("settings.integrations.datadog.fields.site")}
            </Label>
            <Select value={site} onValueChange={setSite}>
              <SelectTrigger id="dd-site">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("settings.integrations.datadog.connectButton")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
