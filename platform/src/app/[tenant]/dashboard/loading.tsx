import { Skeleton } from "@/components/ui/skeleton";

/**
 * Covers only the shell — org name, repo count, window selector — since the
 * page streams and every section below carries its own Suspense fallback.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
  );
}
