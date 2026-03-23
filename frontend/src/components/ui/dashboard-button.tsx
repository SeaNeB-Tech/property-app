"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const dashboardButtonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a2b]/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#1f2a44] text-white hover:bg-[#172036]",
        secondary: "bg-[#fff6df] text-[#6f5317] hover:bg-[#ffefc3]",
        outline: "border border-[#d9c79f] bg-white text-[#1f2a44] hover:bg-[#fbf4e2]",
        ghost: "text-[#1f2a44] hover:bg-[#fbf4e2]",
        danger: "bg-[#9b2c2c] text-white hover:bg-[#7f1d1d]",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 rounded-lg px-3",
        lg: "h-12 rounded-2xl px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface DashboardButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof dashboardButtonVariants> {}

const DashboardButton = React.forwardRef<HTMLButtonElement, DashboardButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(dashboardButtonVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  )
);

DashboardButton.displayName = "DashboardButton";

export { DashboardButton, dashboardButtonVariants };
