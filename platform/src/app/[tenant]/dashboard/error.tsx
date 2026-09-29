"use client";

import { useEffect } from "react";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Segment error boundary for the org dashboard.
 *
 * Before this file existed, the whole app had zero `error.tsx` files — an
 * uncaught exception in any panel (e.g. computeOrgDORA throwing on a
 * transient `external_*` query failure) took down the entire dashboard
 * render instead of just that section, because Next.js has no local
 * boundary to catch it. This contains that blast radius to the dashboard
 * route: one failing panel now shows a retry card instead of a blank page.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          Não foi possível carregar parte do dashboard. Isso costuma ser
          temporário — tente novamente.
        </p>
        <Button onClick={() => reset()}>
          <RotateCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );
}
