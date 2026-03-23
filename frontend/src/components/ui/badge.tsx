import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]",
  {
    variants: {
      variant: {
        default: "bg-[#1f2a44] text-[#f8d98f]",
        success: "bg-[#eefbf3] text-[#1f7a46]",
        info: "bg-[#edf6ff] text-[#245ea8]",
        warning: "bg-[#fff7e8] text-[#a16207]",
        danger: "bg-[#fff1eb] text-[#9b2c2c]",
        neutral: "bg-[#f4f4f5] text-[#52525b]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
