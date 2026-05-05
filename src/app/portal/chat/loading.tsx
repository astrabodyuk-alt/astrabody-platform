export default function ChatLoading() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
      {[80, 60, 90, 50, 70].map((w, i) => (
        <div
          key={i}
          className={`h-10 animate-pulse rounded-2xl bg-white/80 ${i % 2 === 0 ? "self-start" : "self-end"}`}
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}
