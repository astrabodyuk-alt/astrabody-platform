import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentClient } from "@/lib/portal/queries";
import { getRedemptionForBooking } from "@/lib/portal/booking-queries";
import { BookClient } from "./BookClient";

/**
 * Step 1 of 4 — pick a service.
 *
 * Server component keeps only:
 * 1. Auth guard (getCurrentClient).
 * 2. ?reward= redirect — requires a DB call to verify the redemption.
 *
 * Everything else (service grid, "your usual", flash badges, ?filter= logic)
 * lives in BookClient and is powered by useSWR("/api/portal/book") for
 * instant re-navigation without any waterfall.
 */
export default async function PortalBookPage({
  searchParams,
}: {
  searchParams: Promise<{ reward?: string; ref?: string; filter?: string }>;
}) {
  const { reward } = await searchParams;

  // ?reward= redirect — must be server-side (needs DB to verify redemption)
  if (reward) {
    const redemption = await getRedemptionForBooking(reward);
    if (redemption?.available && redemption.serviceId) {
      redirect(
        `/portal/book/${redemption.serviceId}?reward=${encodeURIComponent(reward)}`
      );
    }
  }

  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");

  // BookClient uses useSearchParams() → needs Suspense boundary
  return (
    <Suspense fallback={<BookSkeleton />}>
      <BookClient />
    </Suspense>
  );
}

function BookSkeleton() {
  return (
    <div className="px-4 pt-4">
      <header className="mb-2 px-2 py-3">
        <div className="h-2.5 w-20 animate-pulse rounded-full bg-olive/15" />
        <div className="mt-2 h-7 w-40 animate-pulse rounded-full bg-olive/20" />
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-olive/10" />
      </header>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-[20px] bg-sand/60"
            style={{ height: 200, animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
