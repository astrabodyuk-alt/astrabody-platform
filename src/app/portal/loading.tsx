/**
 * Instant skeleton shown while the portal home server component loads.
 * Matches the exact layout of page.tsx so there's no layout shift.
 */
export default function PortalHomeLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-56px-86px)] flex-col px-4 pb-6 pt-4">
      {/* Hero card skeleton */}
      <div
        className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl p-6"
        style={{
          background: "linear-gradient(145deg, #4a5a3a 0%, #3a4a2c 50%, #2e3d22 100%)",
          minHeight: 340,
        }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-24 animate-pulse rounded-full bg-cream/20" />
            <div className="h-8 w-36 animate-pulse rounded-full bg-cream/25" />
          </div>
          <div className="h-6 w-20 animate-pulse rounded-full bg-cream/15" />
        </div>

        {/* Points */}
        <div className="flex flex-col gap-2">
          <div className="h-2.5 w-28 animate-pulse rounded-full bg-cream/20" />
          <div className="h-14 w-24 animate-pulse rounded-full bg-cream/25" />
          <div className="h-2.5 w-40 animate-pulse rounded-full bg-cream/15" />
        </div>

        {/* Bottom pill */}
        <div className="h-[52px] animate-pulse rounded-2xl bg-cream/10" />
      </div>

      {/* Quick actions skeleton */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[76px] animate-pulse rounded-2xl bg-white/60"
          />
        ))}
      </div>
    </div>
  );
}
