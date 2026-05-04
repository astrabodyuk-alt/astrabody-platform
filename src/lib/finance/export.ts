import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { splitVat, type VatSplit } from "./vat";
import type { TenantVatSettings } from "./queries";

const TZ = "Europe/London";

export interface ExportRow {
  /** Stable id — booking.id or package_purchases.id. */
  id: string;
  /** Date the revenue was earned (booking start or purchase date). */
  date: string;
  type: "booking" | "package_sale";
  description: string;
  client: string;
  staff: string;
  payment_method: string;
  gross_pence: number;
  ex_vat_pence: number;
  vat_pence: number;
}

export interface ExportSummary {
  monthIso: string;
  /** "April 2026" */
  monthLabel: string;
  tenantName: string;
  vatNumber: string | null;
  vatRegistered: boolean;
  vatRatePct: number;
  rows: ExportRow[];
  totals: VatSplit;
  bookingTotals: VatSplit;
  packTotals: VatSplit;
}

/**
 * Pull every revenue-bearing row for the given tenant + month and split
 * into ex-VAT + VAT according to the tenant's settings. Used by the
 * export route for both the CSV and the PDF render.
 */
export async function buildMonthExport(
  tenantId: string,
  monthIso: string,
  vat: TenantVatSettings
): Promise<ExportSummary> {
  const [year, month] = monthIso.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error("invalid month");
  }
  const startIso = fromZonedTime(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    TZ
  ).toISOString();
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endIso = fromZonedTime(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00`,
    TZ
  ).toISOString();

  const admin = createAdminSupabase();
  const [tenantResult, bookingsResult, purchasesResult] = await Promise.all([
    admin
      .from("tenants")
      .select("name, vat_number, vat_registered, vat_rate_pct")
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("bookings")
      .select(
        "id, starts_at, price_pence, status, " +
          "services (name), " +
          "clients (full_name, email), " +
          "staff:staff_id (display_name)"
      )
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "completed"])
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .order("starts_at", { ascending: true }),
    admin
      .from("package_purchases")
      .select(
        "id, created_at, amount_paid_pence, payment_method, refunded, " +
          "service_packages:package_id (name), " +
          "clients (full_name, email), " +
          "sold_by:sold_by_staff_id (display_name)"
      )
      .eq("tenant_id", tenantId)
      .eq("refunded", false)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true }),
  ]);

  type B = {
    id: string;
    starts_at: string;
    price_pence: number;
    services: unknown;
    clients: unknown;
    staff: unknown;
  };
  type P = {
    id: string;
    created_at: string;
    amount_paid_pence: number;
    payment_method: string;
    service_packages: unknown;
    clients: unknown;
    sold_by: unknown;
  };

  const bookings = (bookingsResult.data ?? []) as unknown as B[];
  const purchases = (purchasesResult.data ?? []) as unknown as P[];

  const bookingRows: ExportRow[] = bookings
    .filter((b) => (b.price_pence ?? 0) > 0)
    .map((b) => {
      const split = splitVat(b.price_pence, vat.registered, vat.ratePct);
      const svc = pickFirst<{ name: string }>(b.services);
      const cli = pickFirst<{
        full_name: string | null;
        email: string | null;
      }>(b.clients);
      const stf = pickFirst<{ display_name: string }>(b.staff);
      return {
        id: b.id,
        date: b.starts_at,
        type: "booking" as const,
        description: svc?.name ?? "Session",
        client: cli?.full_name ?? cli?.email ?? "—",
        staff: stf?.display_name ?? "—",
        payment_method: "card",
        gross_pence: split.ttcPence,
        ex_vat_pence: split.exVatPence,
        vat_pence: split.vatPence,
      };
    });

  const packRows: ExportRow[] = purchases.map((p) => {
    const split = splitVat(
      p.amount_paid_pence,
      vat.registered,
      vat.ratePct
    );
    const pkg = pickFirst<{ name: string }>(p.service_packages);
    const cli = pickFirst<{
      full_name: string | null;
      email: string | null;
    }>(p.clients);
    const stf = pickFirst<{ display_name: string }>(p.sold_by);
    return {
      id: p.id,
      date: p.created_at,
      type: "package_sale" as const,
      description: pkg?.name ?? "Pack sale",
      client: cli?.full_name ?? cli?.email ?? "—",
      staff: stf?.display_name ?? "—",
      payment_method: p.payment_method,
      gross_pence: split.ttcPence,
      ex_vat_pence: split.exVatPence,
      vat_pence: split.vatPence,
    };
  });

  const all = [...bookingRows, ...packRows].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const totals = sumRows(all);
  const bookingTotals = sumRows(bookingRows);
  const packTotals = sumRows(packRows);

  const tenant = (tenantResult.data ?? {}) as {
    name?: string;
    vat_number?: string | null;
  };

  return {
    monthIso,
    monthLabel: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
      "en-GB",
      { month: "long", year: "numeric" }
    ),
    tenantName: tenant.name ?? "Studio",
    vatNumber: tenant.vat_number ?? null,
    vatRegistered: vat.registered,
    vatRatePct: vat.ratePct,
    rows: all,
    totals,
    bookingTotals,
    packTotals,
  };
}

/** Render the export as a CSV string. UTF-8 with BOM for Excel. */
export function renderCsv(summary: ExportSummary): string {
  const headers = [
    "id",
    "date",
    "type",
    "description",
    "client",
    "staff",
    "payment_method",
    "gross_gbp",
    "ex_vat_gbp",
    "vat_gbp",
  ];
  const lines: string[] = [headers.join(",")];
  for (const r of summary.rows) {
    lines.push(
      [
        r.id,
        formatIso(r.date),
        r.type,
        csvEscape(r.description),
        csvEscape(r.client),
        csvEscape(r.staff),
        r.payment_method,
        toGbp(r.gross_pence),
        toGbp(r.ex_vat_pence),
        toGbp(r.vat_pence),
      ].join(",")
    );
  }
  // Totals row.
  lines.push("");
  lines.push(
    [
      "",
      "",
      "TOTAL",
      "",
      "",
      "",
      "",
      toGbp(summary.totals.ttcPence),
      toGbp(summary.totals.exVatPence),
      toGbp(summary.totals.vatPence),
    ].join(",")
  );
  // BOM so Excel detects UTF-8 correctly.
  return "﻿" + lines.join("\n");
}

function sumRows(rows: ExportRow[]): VatSplit {
  let ttc = 0;
  let ex = 0;
  let vat = 0;
  for (const r of rows) {
    ttc += r.gross_pence;
    ex += r.ex_vat_pence;
    vat += r.vat_pence;
  }
  return { ttcPence: ttc, exVatPence: ex, vatPence: vat };
}

function pickFirst<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function toGbp(pence: number): string {
  return (pence / 100).toFixed(2);
}

function formatIso(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  });
}
