import * as React from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-[#1f2a44] text-sm font-semibold text-[#f8d98f]",
        className
      )}
    >
      {children}
    </div>
  );
}
