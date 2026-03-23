"use client";

export function DashboardTopHeader({
  title,
  subtitle,
  userName,
  userMetaLabel,
  userFallback,
}) {
  return (
    <header className="flex flex-col gap-4 rounded-[12px] border-[0.5px] border-black/10 bg-[#f7f7f8] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-[#1f2328]">{title}</p>
        {subtitle ? (
          <p className="mt-1 text-[12px] leading-5 text-[#6d747d]">{subtitle}</p>
        ) : null}
      </div>

      <div className="inline-flex w-full items-center gap-3 self-start rounded-[8px] border-[0.5px] border-black/10 bg-white px-3 py-2 sm:w-auto">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-black/10 bg-[#f1f2f4] text-[12px] font-medium text-[#1f2328]">
          {userFallback}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-[#1f2328]">{userName}</p>
          {userMetaLabel ? (
            <p className="truncate text-[11px] leading-5 text-[#6d747d]">{userMetaLabel}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
