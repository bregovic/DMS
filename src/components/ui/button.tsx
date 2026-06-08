import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        // plná černá → na hover bílá s černým rámečkem (invert)
        default:
          "bg-stone-950 text-stone-50 border border-stone-950 hover:bg-stone-50 hover:text-stone-950",
        // rámeček → na hover plná černá
        outline:
          "border border-stone-300 bg-transparent text-stone-700 hover:border-stone-950 hover:bg-stone-950 hover:text-stone-50",
        ghost: "text-stone-600 hover:bg-stone-200/70 hover:text-stone-950",
        destructive:
          "border border-stone-300 bg-transparent text-stone-700 hover:border-stone-950 hover:bg-stone-950 hover:text-stone-50",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-7",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
