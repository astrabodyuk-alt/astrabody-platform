"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Astrabody surface card — white background, hairline border, layered
 * shadow, 22 px radius. Drop-in replacement for the shadcn Card primitive
 * with the Astrabody design DNA baked in.
 *
 * Three sub-parts: Card, CardHeader, CardContent. Anything else (footer,
 * title, description) is plain text inside CardContent — we don't need
 * the full shadcn 6-piece set here.
 */

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(({ className, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "ax-card",
      interactive && "ax-card-hover ax-tap cursor-pointer",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pb-3", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-5 pb-5", className)} {...props} />
));
CardContent.displayName = "CardContent";

/**
 * SectionTitle — the Cormorant section heading we use across pages.
 * Pairs with an optional right-side action link.
 */
export const SectionTitle = ({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "mb-3 mt-7 flex items-baseline justify-between px-1",
      className
    )}
  >
    <h2 className="ax-section-title">{title}</h2>
    {action && (
      <div className="text-[13px] font-medium tracking-snug text-sage-deep">
        {action}
      </div>
    )}
  </div>
);
