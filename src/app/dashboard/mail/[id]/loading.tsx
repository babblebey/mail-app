import { Skeleton } from "~/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      {/* Message skeleton */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Subject */}
        <div className="px-4 py-4 border-b">
          <Skeleton className="h-6 w-2/3 rounded-md" />
        </div>

        {/* Message header */}
        <div className="flex items-start gap-4 px-4 py-5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-3 w-28 rounded" />
              </div>
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          </div>
        </div>

        {/* Message body */}
        <div className="px-4 pb-6 space-y-2 pl-18">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
          <div className="pt-2" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>
      </div>
    </div>
  )
}
