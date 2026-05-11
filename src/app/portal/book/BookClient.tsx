"use client";

import useSWR from "swr";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatGBP } from "@/lib/utils";
import type { FlashSlot } from "@/lib/flash-slots/queries";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  name: string;
  duration_min: number;
  price_pence: number;
}

interface YourUsual {
  serviceId: string;
  serviceName: string;
  durationMin: number;
  pricePence: number;
  staffId: string | null;
  lastStaffName: string | null;
  lastBookedRelative: string;
}

interface BookData {
  services: Service[];
  flashSlots: FlashSlot[];
  yourUsual: YourUsual | null;
}

// ── Service card visuals ────────────────────────────────────────────────────
const SERVICE_CARD_MAP: { keywords: string[]; photo: string; tagline: string }[] = [
  { keywords: ["ems", "sculpt", "suprasculpt"], photo: "/images/ems-sculpting.jpg",  tagline: "Tone muscle · reduce fat" },
  { keywords: ["fat", "freez", "cryo"],         photo: "/images/fat-freezing.jpg",   tagline: "Permanent fat reduction" },
  { keywords: ["infra", "bike"],                photo: "/images/infrabike-card.jpg", tagline: "Infrared detox · calorie burn" },
  { keywords: ["laser", "hair"],                photo: "/images/laser-hair.jpg",     tagline: "All skin tones · long-lasting" },
];

function getServiceVisuals(name: string) {
  const lower = name.toLowerCase();
  return SERVICE_CARD_MAP.find((m) => m.keywords.some((kw) => lower.includes(kw))) ?? { photo: null, tagline: null };
}

const FILTER_KEYWORDS: Record<string, string[]> = {
  ems:   ["ems", "sculpt", "suprasculpt"],
  fat:   ["fat", "freez", "cryo"],
  bike:  ["infra", "bike"],
  laser: ["laser", "hair"],
};

function matchesFilter(serviceName: string, filter: string): boolean {
  const keywords = FILTER_KEYWORDS[filter];
  if (!keywords) return true;
  const lower = serviceName.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BookClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter") ?? undefined;

  const { data, isLoading } = useSWR<BookData>("/api/portal/book");

  // If filter narrows to exactly 1 service → jump straight to slot picker
  useEffect(() => {
    if (!data || !filter) return;
    const filtered = data.services.filter((s) => matchesFilter(s.name, filter));
    if (filtered.length === 1) {
      router.replace(`/portal/book/${filtered[0]!.id}`);
    }
  }, [data, filter, router]);

  if (isLoading || !data) {
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

  const { yourUsual, flashSlots } = data;

  // Apply filter
  let services = data.services;
  if (filter) {
    const filtered = services.filter((s) => matchesFilter(s.name, filter));
    if (filtered.length > 0) services = filtered;
  }

  const flashByService = new Map(flashSlots.map((f) => [f.serviceId, f]));

  return (
    <div className="px-4 pt-4">
      <header className="mb-2 px-2 py-3">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Step 1 of 4
        </p>
        <h1 className="mt-1 font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          Book a session
        </h1>
        <p className="mt-2 text-[15px] tracking-snug text-olive-soft">
          Pick what you&rsquo;d like. We&rsquo;ll find a time next.
        </p>
      </header>

      {yourUsual && (
        <Link
          href={`/portal/book/${yourUsual.serviceId}?source=book_again${yourUsual.staffId ? `&staff=${yourUsual.staffId}` : ""}`}
          className="mt-4 block focus-visible:outline-none"
        >
          <Card
            interactive
            className="flex items-center justify-between gap-3 border-hairline p-5"
          >
            <div className="min-w-0">
              <h2 className="font-serif text-[18px] font-medium tracking-tight text-olive">
                Your usual
              </h2>
              <p className="mt-0.5 text-[13px] tracking-snug text-olive">
                {yourUsual.serviceName} · {yourUsual.durationMin} min ·{" "}
                {formatGBP(yourUsual.pricePence)}
              </p>
              <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                {yourUsual.lastStaffName
                  ? `Last with ${yourUsual.lastStaffName}`
                  : "Last booked"}{" "}
                · {yourUsual.lastBookedRelative}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-sage/30 px-3 py-1.5 text-[13px] font-medium text-sage-deep">
              Book again <ArrowRight className="size-3.5" />
            </span>
          </Card>
        </Link>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {services.map((svc) => {
          const { photo, tagline } = getServiceVisuals(svc.name);
          const flash = flashByService.get(svc.id);
          const flashHref = flash
            ? `/portal/book/${svc.id}?flash=${flash.id}${flash.staffId ? `&staff=${flash.staffId}` : ""}`
            : `/portal/book/${svc.id}`;
          return (
            <Link key={svc.id} href={flashHref} className="block focus-visible:outline-none">
              <div
                className="group relative overflow-hidden rounded-[20px] transition-transform active:scale-[0.97]"
                style={{ height: 200 }}
              >
                {photo && (
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url('${photo}')` }}
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(14,22,10,0.88) 0%, rgba(14,22,10,0.35) 50%, transparent 80%)",
                  }}
                />
                {flash && (
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-olive shadow-sm">
                    ⚡ {formatGBP(flash.flashPricePence)}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-3.5">
                  <h3 className="font-serif text-[15px] font-medium leading-snug tracking-tight text-white">
                    {svc.name}
                  </h3>
                  {tagline && (
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.10em] text-white/55">
                      {tagline}
                    </p>
                  )}
                  <div
                    className="mt-2.5 flex items-center justify-between rounded-[10px] px-3 py-2 transition-colors group-hover:bg-white/20"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                  >
                    <span className="text-[11px] font-semibold tracking-wide text-white">
                      {svc.duration_min} min ·{" "}
                      {flash ? (
                        <>
                          <span className="line-through opacity-60">
                            {formatGBP(svc.price_pence)}
                          </span>{" "}
                          {formatGBP(flash.flashPricePence)}
                        </>
                      ) : svc.price_pence === 0 ? (
                        "Free"
                      ) : (
                        formatGBP(svc.price_pence)
                      )}
                    </span>
                    <ChevronRight size={11} strokeWidth={2.5} className="text-white/70" />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {services.length === 0 && (
        <Card className="mt-6 p-5">
          <p className="text-[13px] tracking-snug text-olive-soft">
            No services available right now.
          </p>
        </Card>
      )}
    </div>
  );
}
