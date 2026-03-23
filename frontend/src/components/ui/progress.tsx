import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function Progress({ value, className, ...props }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-[#efe7d6]", className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#c79a2b_0%,#1f2a44_100%)] transition-all"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
