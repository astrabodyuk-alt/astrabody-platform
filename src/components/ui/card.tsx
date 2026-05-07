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

// ── LiquidCard ────────────────────────────────────────────────────────────────

/**
 * LiquidCard — glass morphism card with SVG displacement filter.
 * The card itself is bg-transparent; the SVG backdrop filter creates
 * a subtle liquid-glass refraction effect on whatever sits behind it.
 */
export function LiquidCard({
  className,
  wrapperClassName,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <div
        data-slot="card"
        style={{ backdropFilter: 'url("#container-glass")' }}
        className={cn(
          "text-card-foreground bg-transparent flex flex-col rounded-xl border",
          "shadow-[0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(0,0,0,0.9),inset_-3px_-3px_0.5px_-3px_rgba(0,0,0,0.85),inset_1px_1px_1px_-0.5px_rgba(0,0,0,0.6),inset_-1px_-1px_1px_-0.5px_rgba(0,0,0,0.6),inset_0_0_6px_6px_rgba(0,0,0,0.12),inset_0_0_2px_2px_rgba(0,0,0,0.06),0_0_12px_rgba(255,255,255,0.15)]",
          "transition-all",
          className
        )}
        {...props}
      >
        {children}
      </div>
      <GlassFilter />
    </div>
  );
}

function GlassFilter() {
  return (
    <svg className="hidden" aria-hidden>
      <defs>
        <filter
          id="container-glass"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.02"
            numOctaves="1"
            seed="1"
            result="turbulence"
          />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale="120"
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

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
