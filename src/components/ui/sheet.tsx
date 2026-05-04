"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Side-drawer primitive built on @radix-ui/react-dialog. Used in
 * /admin/bookings (booking detail) and elsewhere where a Dialog feels
 * too modal. Cream background, hairline left edge, shadow-3, rounded-r-lg.
 *
 * Mirrors shadcn's API (Sheet / SheetTrigger / SheetContent / SheetHeader
 * / SheetTitle / SheetDescription / SheetFooter).
 */

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[100] bg-olive/40",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "right" | "left";
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = "right", ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed top-0 z-[101] flex h-full w-full max-w-[480px] flex-col gap-4 overflow-y-auto",
        "border-[0.5px] border-hairline bg-cream p-6 shadow-3",
        side === "right" && "right-0 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        side === "left" && "left-0 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
        "data-[state=open]:animate-in data-[state=closed]:animate-out duration-200",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-olive-soft transition-colors duration-200 ease-ios hover:text-olive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/50"
        aria-label="Close"
      >
        <X size={16} strokeWidth={1.6} />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-2 pr-8", className)} {...props} />
);

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex items-center justify-end gap-2 pt-4", className)} {...props} />
);

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "font-serif text-[22px] font-medium leading-tight tracking-tight text-olive",
      className
    )}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[14px] tracking-snug text-olive-soft", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
