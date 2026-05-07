"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Zap, X, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatGBP } from "@/lib/utils";
import type { FlashSlot } from "@/lib/flash-slots/queries";
import { createFlashSlot, cancelFlashSlot } from "./actions";

type Suggestion = {
  gapStart: string;
  gapEnd: string;
  gapDurationMin: number;
  services: Array<{ id: string; name: string; durationMin: number; pricePence: number }>;
};

export function FlashSlotsClient({
  active,
  suggestions,
}: {
  active: FlashSlot[];
  suggestions: Suggestion[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Active flash slots */}
      {active.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-olive/50">
            Live now
          </p>
          <div className="flex flex-col gap-2">
            {active.map((slot) => (
              <ActiveSlotCard key={slot.id} slot={slot} />
            ))}
          </div>
        </section>
      )}

      {/* AI Suggestions */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={13} className="text-sage" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-olive/50">
            Suggested deals for today
          </p>
        </div>

        {suggestions.length === 0 ? (
          <Card className="p-4">
            <p className="text-[13px] text-olive-soft">
              No free windows found today — the schedule looks full, or the studio is closed.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {suggestions.map((s) => (
              <SuggestionCard key={s.gapStart} suggestion={s} />
            ))}
          </div>
        )}
      </section>

      {/* Manual create */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-olive/50">
          Create manually
        </p>
        <ManualCreateCard />
      </section>
    </div>
  );
}

// ── Active slot card ───────────────────────────────────────────────────────────

function ActiveSlotCard({ slot }: { slot: FlashSlot }) {
  const [pending, start] = useTransition();
  const savings = slot.originalPricePence - slot.flashPricePence;
  const pct = Math.round((savings / slot.originalPricePence) * 100);

  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #758564, #3E4D2E)" }}
        >
          <Zap size={15} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-olive truncate">{slot.label}</p>
          <p className="text-[12px] text-olive-soft">
            {slot.serviceName} · {format(new Date(slot.slotStart), "HH:mm")}–{format(new Date(slot.slotEnd), "HH:mm")}
          </p>
          <p className="text-[12px] text-sage font-medium">
            {formatGBP(slot.flashPricePence)}{" "}
            <span className="text-olive-soft line-through text-[11px]">{formatGBP(slot.originalPricePence)}</span>
            {" "}<span className="text-sage-deep font-semibold">−{pct}%</span>
          </p>
          <p className="text-[11px] text-olive-soft">
            {slot.claimsCount}/{slot.maxClaims} claimed
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await cancelFlashSlot(slot.id); })}
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-olive/15 text-olive-soft hover:border-destructive/50 hover:text-destructive transition-colors disabled:opacity-50"
        title="Cancel deal"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </Card>
  );
}

// ── Suggestion card ────────────────────────────────────────────────────────────

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const [open, setOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(suggestion.services[0]!);
  const [flashPrice, setFlashPrice] = useState(
    Math.round(selectedService.pricePence * 0.5 / 100) * 100 // default 50% off, rounded
  );
  const [label, setLabel] = useState("Flash Deal — Today Only");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card className="flex items-center gap-2 p-4">
        <Zap size={14} className="text-sage" />
        <p className="text-[13px] text-olive-soft">Deal published ✓</p>
      </Card>
    );
  }

  const originalPence = selectedService.pricePence;
  const savings = originalPence - flashPrice;
  const pct = originalPence > 0 ? Math.round((savings / originalPence) * 100) : 0;

  return (
    <Card className="overflow-hidden border-sage/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sage/10 px-2 py-0.5 text-[11px] font-semibold text-sage">
              {suggestion.gapDurationMin} min free
            </span>
            <p className="text-[14px] font-medium text-olive">
              {format(new Date(suggestion.gapStart), "HH:mm")}–{format(new Date(suggestion.gapEnd), "HH:mm")}
            </p>
          </div>
          <p className="mt-0.5 text-[12px] text-olive-soft">
            {suggestion.services.map((s) => s.name).join(", ")} fit in this window
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-olive-soft" /> : <ChevronDown size={16} className="text-olive-soft" />}
      </button>

      {open && (
        <div className="border-t border-hairline px-4 pb-4 pt-3 flex flex-col gap-3">
          {/* Service picker */}
          <div>
            <label className="block text-[11px] font-medium text-olive-soft mb-1">Service</label>
            <select
              className="w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
              value={selectedService.id}
              onChange={(e) => {
                const svc = suggestion.services.find((s) => s.id === e.target.value)!;
                setSelectedService(svc);
                setFlashPrice(Math.round(svc.pricePence * 0.5 / 100) * 100);
              }}
            >
              {suggestion.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatGBP(s.pricePence)} · {s.durationMin} min
                </option>
              ))}
            </select>
          </div>

          {/* Flash price */}
          <div>
            <label className="block text-[11px] font-medium text-olive-soft mb-1">
              Flash price (£) — normal is {formatGBP(originalPence)}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={flashPrice / 100}
                onChange={(e) => setFlashPrice(Math.round(parseFloat(e.target.value || "0") * 100))}
                className="w-28 rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
              />
              {pct > 0 && (
                <span className="text-[12px] font-semibold text-sage-deep">
                  −{pct}% · you save {formatGBP(savings)} per booking
                </span>
              )}
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-[11px] font-medium text-olive-soft mb-1">Label (shown to clients)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
            />
          </div>

          <Button
            disabled={pending || flashPrice <= 0 || !label}
            onClick={() => start(async () => {
              const slotEnd = new Date(new Date(suggestion.gapStart).getTime() + selectedService.durationMin * 60000).toISOString();
              const res = await createFlashSlot({
                serviceId: selectedService.id,
                staffId: null,
                slotStart: suggestion.gapStart,
                slotEnd,
                flashPricePence: flashPrice,
                originalPricePence: originalPence,
                label,
                description: null,
                maxClaims: 1,
              });
              if (res.ok) setDone(true);
            })}
            className="w-full bg-sage text-white hover:bg-sage/90"
          >
            <Zap size={13} className="mr-1.5" />
            {pending ? "Publishing…" : "Publish flash deal"}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Manual create ──────────────────────────────────────────────────────────────

function ManualCreateCard() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const [serviceId, setServiceId] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [flashPricePounds, setFlashPricePounds] = useState("");
  const [originalPricePounds, setOriginalPricePounds] = useState("");
  const [label, setLabel] = useState("Flash Deal — Today Only");
  const [maxClaims, setMaxClaims] = useState(1);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card className="flex items-center gap-2 p-4">
        <Zap size={14} className="text-sage" />
        <p className="text-[13px] text-olive-soft">Deal published ✓</p>
        <button type="button" onClick={() => setDone(false)} className="ml-auto text-[12px] text-sage underline">New deal</button>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-[11px] font-medium text-olive-soft mb-1">Service ID</label>
          <input
            type="text"
            placeholder="Paste the service UUID from Settings"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-olive-soft mb-1">Slot start (today)</label>
            <input
              type="datetime-local"
              min={`${todayStr}T08:00`}
              max={`${todayStr}T21:00`}
              value={slotStart}
              onChange={(e) => setSlotStart(e.target.value)}
              className="w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-olive-soft mb-1">Duration (min)</label>
            <input
              type="number" min={15} step={15} value={durationMin}
              onChange={(e) => setDurationMin(parseInt(e.target.value) || 30)}
              className="w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-olive-soft mb-1">Flash price (£)</label>
            <input
              type="number" min={0} step={1} value={flashPricePounds}
              onChange={(e) => setFlashPricePounds(e.target.value)}
              placeholder="e.g. 80"
              className="w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-olive-soft mb-1">Normal price (£)</label>
            <input
              type="number" min={0} step={1} value={originalPricePounds}
              onChange={(e) => setOriginalPricePounds(e.target.value)}
              placeholder="e.g. 160"
              className="w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-olive-soft mb-1">Label</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-olive-soft mb-1">Max claims</label>
          <input type="number" min={1} max={10} value={maxClaims} onChange={(e) => setMaxClaims(parseInt(e.target.value) || 1)}
            className="w-28 rounded-lg border border-olive/15 bg-cream px-3 py-2 text-[13px] text-olive focus:outline-none focus:ring-1 focus:ring-sage"
          />
        </div>

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        <Button
          disabled={pending || !serviceId || !slotStart || !flashPricePounds}
          onClick={() => start(async () => {
            setError(null);
            const start_iso = new Date(slotStart).toISOString();
            const end_iso = new Date(new Date(slotStart).getTime() + durationMin * 60000).toISOString();
            const res = await createFlashSlot({
              serviceId,
              staffId: null,
              slotStart: start_iso,
              slotEnd: end_iso,
              flashPricePence: Math.round(parseFloat(flashPricePounds) * 100),
              originalPricePence: Math.round(parseFloat(originalPricePounds || "0") * 100),
              label,
              description: null,
              maxClaims,
            });
            if (res.ok) setDone(true);
            else setError(res.error);
          })}
          className="w-full bg-sage text-white hover:bg-sage/90"
        >
          <Zap size={13} className="mr-1.5" />
          {pending ? "Publishing…" : "Publish flash deal"}
        </Button>
      </div>
    </Card>
  );
}
