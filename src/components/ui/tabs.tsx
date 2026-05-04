"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Tabs primitive on @radix-ui/react-tabs. Apple-canon styling:
 * underline indicator on the active trigger, sage on hover, olive when
 * active, hairline below the row.
 */

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 border-b-[0.5px] border-hairline",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative px-4 py-3 text-[13px] font-medium tracking-snug text-olive-soft",
      "transition-colors duration-200 ease-ios hover:text-olive",
      "data-[state=active]:text-olive",
      "after:absolute after:bottom-[-0.5px] after:left-0 after:right-0 after:h-[2px] after:bg-transparent",
      "data-[state=active]:after:bg-sage",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/50 focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-6 focus-visible:outline-none",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
