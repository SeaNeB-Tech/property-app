"use client";

function SkeletonBlock({ className }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#e9ebef] ${className || ""}`} />;
}

function SkeletonPanel() {
  return (
    <div className="overflow-hidden rounded-[12px] border-[0.5px] border-black/10 bg-[#fafafb]">
      <div className="flex items-center justify-between border-b-[0.5px] border-black/10 px-5 py-4">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-7 w-16" />
      </div>
      <div className="flex min-h-[216px] items-center justify-center px-6 py-8">
        <div className="flex w-full max-w-[220px] flex-col items-center">
          <SkeletonBlock className="h-11 w-11 rounded-full" />
          <SkeletonBlock className="mt-4 h-4 w-32" />
          <SkeletonBlock className="mt-2 h-3 w-full" />
          <SkeletonBlock className="mt-1 h-3 w-40" />
          <SkeletonBlock className="mt-4 h-8 w-28" />
        </div>
      </div>
      <div className="border-t-[0.5px] border-black/10 bg-white px-5 py-3">
        <SkeletonBlock className="h-3 w-full" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="rounded-[12px] border-[0.5px] border-black/10 bg-[#f7f7f8] p-3">
        <div className="rounded-[12px] border-[0.5px] border-black/10 bg-white p-3">
          <div className="flex items-start gap-3">
            <SkeletonBlock className="h-9 w-9" />
            <div className="flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, groupIndex) => (
            <div key={groupIndex} className="space-y-2">
              <SkeletonBlock className="h-3 w-16" />
              <div className="space-y-1">
                {Array.from({ length: groupIndex === 0 ? 2 : 1 }).map((__, itemIndex) => (
                  <div
                    key={`${groupIndex}-${itemIndex}`}
                    className="flex items-center justify-between rounded-[8px] border-[0.5px] border-black/10 bg-white px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <SkeletonBlock className="h-7 w-7" />
                      <SkeletonBlock className="h-4 w-[4.5rem]" />
                    </div>
                    <SkeletonBlock className="h-5 w-7 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-[12px] border-[0.5px] border-black/10 bg-[#f7f7f8] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-3 w-48" />
          </div>
          <div className="flex items-center gap-3 rounded-[8px] border-[0.5px] border-black/10 bg-white px-3 py-2">
            <SkeletonBlock className="h-8 w-8" />
            <div className="space-y-1">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonPanel />
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
