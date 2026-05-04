"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResourceOption } from "@/lib/portal/resources";

/**
 * Resource picker (step 2.5 in the booking flow). Renders only when a
 * service exposes 2+ active resources. Mirrors the PractitionerPicker
 * pattern: stacked cards on mobile, 3-col grid on tablet+.
 *
 * Selection is encoded in the URL via ?resource=<id|any>. The slot
 * picker (next step) reads it back and filters availability.
 */
export function ResourcePicker({
  serviceId,
  resources,
  staffParam,
  rewardId,
}: {
  serviceId: string;
  resources: ResourceOption[];
  /** "any" or a uuid — already resolved by the parent. */
  staffParam: string;
  rewardId?: string | null;
}) {
  const baseQuery = [
    `staff=${encodeURIComponent(staffParam)}`,
    rewardId ? `reward=${encodeURIComponent(rewardId)}` : null,
  ]
    .filter(Boolean)
    .join("&");

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex min-w-max gap-3 md:grid md:min-w-0 md:grid-cols-3">
        {resources.map((r) => (
          <li key={r.id} className="md:contents">
            <Link
              href={`/portal/book/${serviceId}?${baseQuery}&resource=${encodeURIComponent(r.id)}`}
              className="block w-[200px] focus-visible:outline-none md:w-auto"
            >
              <ResourceCard
                variant="resource"
                name={r.name}
                description={r.description}
              />
            </Link>
          </li>
        ))}
        <li className="md:contents">
          <Link
            href={`/portal/book/${serviceId}?${baseQuery}&resource=any`}
            className="block w-[200px] focus-visible:outline-none md:w-auto"
          >
            <ResourceCard
              variant="any"
              name="Any available"
              description="We'll pick the first free unit when you book."
            />
          </Link>
        </li>
      </ul>
    </div>
  );
}

function ResourceCard({
  variant,
  name,
  description,
}: {
  variant: "any" | "resource";
  name: string;
  description: string | null;
}) {
  return (
    <div
      className={cn(
        "ax-tap flex h-full flex-col gap-3 rounded-lg border-[0.5px] border-hairline-strong bg-white p-4 shadow-1",
        "transition-all duration-200 ease-ios hover:shadow-2"
      )}
    >
      {variant === "any" ? (
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-deep text-olive-soft"
        >
          <Layers size={22} strokeWidth={1.6} />
        </span>
      ) : (
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full text-cream"
          style={{ background: "linear-gradient(135deg, #758564, #5C6B4E)" }}
        >
          <Layers size={20} strokeWidth={1.6} />
        </span>
      )}
      <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
        {name}
      </h3>
      {description && (
        <p className="text-[13px] leading-relaxed tracking-snug text-olive-soft">
          {description}
        </p>
      )}
    </div>
  );
}
