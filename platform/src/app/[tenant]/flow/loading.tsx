import { Skeleton } from "@/components/ui/skeleton";

export default function BoardFlowLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Quality gates come first on the real page, so they lead here too. */}
      <Skeleton className="h-64 w-full" />

      <Skeleton className="h-40 w-full" />

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>

      <Skeleton className="h-72 w-full" />
    </div>
  );
}
