export default function BookLoading() {
  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      <div className="h-7 w-40 animate-pulse rounded-full bg-olive/10" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/80" />
        ))}
      </div>
    </div>
  );
}
