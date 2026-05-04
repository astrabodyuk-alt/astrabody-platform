"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Format = "pdf" | "csv";

/**
 * Export-for-accountant card. Defaults to LAST completed month + PDF.
 * Submits to GET /api/finance/export which streams a file download.
 *
 * The toast surface is a thin "Preparing your file…" line that appears
 * above the button when the request takes >700ms — typical month is
 * sub-second but a year-end run might be slower.
 */
export function ExportCard() {
  const months = useMemo(() => last12MonthsOptions(), []);
  const defaultMonth = months[1]?.iso ?? months[0]?.iso ?? "";
  const [month, setMonth] = useState<string>(defaultMonth);
  const [format, setFormat] = useState<Format>("pdf");
  const [busy, setBusy] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    const toastTimer = setTimeout(() => setShowToast(true), 700);
    try {
      const url = `/api/finance/export?month=${encodeURIComponent(
        month
      )}&format=${format}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ??
        `export.${format}`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't download");
    } finally {
      clearTimeout(toastTimer);
      setShowToast(false);
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-serif text-[22px] font-medium tracking-tight text-olive">
        Export for accountant
      </h2>
      <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
        Bookings, deposits, and pack sales for one month — PDF summary
        or raw CSV for Sage / Xero.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <Field label="Month">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] tabular-nums text-olive shadow-1"
          >
            {months.map((m) => (
              <option key={m.iso} value={m.iso}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Format">
          <div className="inline-flex w-fit rounded-full border-[0.5px] border-hairline-strong bg-white p-0.5">
            {(["pdf", "csv"] as const).map((f) => {
              const selected = f === format;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[12px] font-medium uppercase tracking-label-caps transition-colors duration-200 ease-ios",
                    selected ? "bg-sage text-cream" : "text-olive-soft"
                  )}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </Field>

        {showToast && (
          <p className="text-[12px] tracking-snug text-olive-soft">
            Preparing your file…
          </p>
        )}
        {error && (
          <p className="text-[12px] tracking-snug text-destructive">{error}</p>
        )}

        <div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleDownload}
            disabled={busy || !month}
          >
            {busy ? "Preparing" : "Download"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

interface MonthOption {
  iso: string;
  label: string;
}

function last12MonthsOptions(): MonthOption[] {
  const now = new Date();
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const [y, m] = ymd.split("-").map(Number);
  const out: MonthOption[] = [];
  let yy = y;
  let mm = m;
  for (let i = 0; i < 13; i++) {
    out.push({
      iso: `${yy}-${String(mm).padStart(2, "0")}`,
      label: new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
    });
    if (mm === 1) {
      mm = 12;
      yy--;
    } else {
      mm--;
    }
  }
  return out;
}
