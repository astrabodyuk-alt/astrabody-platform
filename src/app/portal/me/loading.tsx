export default function MeLoading() {
  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* Profile header skeleton */}
      <div className="flex items-center gap-4 py-2">
        <div className="h-14 w-14 animate-pulse rounded-full bg-olive/10" />
        <div className="flex flex-col gap-2">
          <div className="h-5 w-32 animate-pulse rounded-full bg-olive/10" />
          <div className="h-3 w-20 animate-pulse rounded-full bg-olive/8" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/80" />
      ))}
    </div>
  );
}
