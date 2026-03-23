"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const accentStyles = {
  blue: "bg-[#eef4ff] text-[#2f5bea]",
  emerald: "bg-[#ebfbf3] text-[#12824c]",
  amber: "bg-[#fff5e7] text-[#b76d12]",
  violet: "bg-[#f3edff] text-[#6d43d8]",
};

export function KpiStatCard({
  title,
  value,
  helper = "",
  icon: Icon,
  accent = "blue",
}) {
  return (
    <Card className="rounded-[24px] border-[#e7eaf3] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c879d]">
              {title}
            </p>
            <p className="text-3xl font-black tracking-tight text-[#101828]">{value}</p>
            {helper ? <p className="text-sm leading-6 text-[#667085]">{helper}</p> : null}
          </div>
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl",
              accentStyles[accent]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
