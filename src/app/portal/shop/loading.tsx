export default function ShopLoading() {
  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* Section title skeleton */}
      <div className="h-4 w-32 animate-pulse rounded-full bg-olive/10 mt-2" />
      {/* Product cards skeleton */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-[22px] bg-white/80 shadow-sm">
          {/* Cover image area */}
          <div className="aspect-[16/9] w-full animate-pulse bg-olive/8" />
          <div className="flex flex-col gap-2 p-4">
            <div className="h-5 w-40 animate-pulse rounded-full bg-olive/10" />
            <div className="h-3 w-full animate-pulse rounded-full bg-olive/7" />
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-olive/7" />
            <div className="mt-1 h-4 w-16 animate-pulse rounded-full bg-olive/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
