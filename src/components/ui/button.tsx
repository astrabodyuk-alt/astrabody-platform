"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — three Astrabody variants only (primary / secondary / ghost),
 * one size by default, plus a compact size for inline actions.
 *
 * Compatible with shadcn/ui consumers and 21st.dev blocks: same name,
 * same prop shape, same `asChild` / `Slot` pattern. Variants and tokens
 * are tuned to Astrabody's palette and Apple-style tap-back interaction.
 */
const buttonVariants = cva(
  // Base — 999px pill, Inter 500 14px, calm tap-back, focus ring is keyboard-only
  "inline-flex items-center justify-center gap-2 rounded-full font-sans text-[14px] font-medium tracking-snug transition-all duration-200 ease-ios active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream",
  {
    variants: {
      variant: {
        primary:
          "bg-olive text-cream shadow-btn hover:-translate-y-px hover:shadow-btn-hover",
        secondary:
          "bg-white text-olive shadow-1 hover:shadow-2 border-[0.5px] border-hairline-strong",
        ghost:
          "bg-transparent text-sage-deep hover:underline underline-offset-4",
        // Stripe-style accent reserved for the checkout pay button.
        pay:
          "text-cream shadow-btn hover:-translate-y-px hover:shadow-btn-hover",
      },
      size: {
        default: "h-11 px-[22px]",
        sm: "h-9 px-[16px] text-[13px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    // Stripe-inspired pay button: subtle indigo→sage gradient + white fill.
    // We only apply this when the variant is "pay" so the rest of the app
    // stays canon Apple.
    const payStyle =
      variant === "pay"
        ? {
            background:
              "linear-gradient(180deg, #5C6B4E 0%, #758564 100%)",
          }
        : undefined;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={payStyle}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
