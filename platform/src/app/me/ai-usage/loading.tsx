import { Skeleton } from "@/components/ui/skeleton";

export default function PersonalAIUsageLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-3 w-96" />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
