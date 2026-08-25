/**
 * Suspense fallbacks for the dashboard panels.
 *
 * Each shape roughly matches the section it stands in for, so a panel
 * resolving doesn't shift the sections below it more than it has to.
 */

import { Skeleton } from "@/components/ui/skeleton";

/** Section heading (title + one line of description) that most panels render. */
function SectionHeading() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

/** OrgPulse: six hero metric cards. */
export function HeroRowSkeleton() {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

/** Heading plus a row of KPI cards — PRHealth, DORAOverview. */
export function MetricGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-4">
      <SectionHeading />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}

/** Heading plus a single chart/table block. */
export function SectionSkeleton({ height = "h-72" }: { height?: string }) {
  return (
    <div className="space-y-4">
      <SectionHeading />
      <Skeleton className={height} />
    </div>
  );
}

/** Heading plus two side-by-side blocks — DeliveryQuality, AIvsHuman. */
export function SplitSectionSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className="space-y-4">
      <SectionHeading />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className={height} />
        <Skeleton className={height} />
      </div>
    </div>
  );
}
