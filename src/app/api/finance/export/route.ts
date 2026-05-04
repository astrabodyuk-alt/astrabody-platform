import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { getTenantVatSettings } from "@/lib/finance/queries";
import { buildMonthExport, renderCsv } from "@/lib/finance/export";
import { renderPdf } from "@/lib/finance/pdf";

/**
 * GET /api/finance/export?month=YYYY-MM&format=pdf|csv
 *
 * Owner-only. Streams a downloadable PDF or CSV of the month's
 * bookings + pack sales with VAT split per row + totals. Filename:
 *   {tenant-slug}-revenue-{month}.{ext}
 */
export async function GET(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) {
    return new NextResponse("unauthorised", { status: 401 });
  }
  if (ctx.role !== "owner") {
    return new NextResponse("owner only", { status: 403 });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? "";
  const format = (url.searchParams.get("format") ?? "pdf").toLowerCase();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return new NextResponse("invalid month", { status: 400 });
  }
  if (format !== "pdf" && format !== "csv") {
    return new NextResponse("invalid format", { status: 400 });
  }

  const vat = await getTenantVatSettings(ctx.tenantId);

  let summary;
  try {
    summary = await buildMonthExport(ctx.tenantId, month, vat);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "export failed";
    return new NextResponse(msg, { status: 500 });
  }

  const slug = (summary.tenantName ?? "studio")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filename = `${slug}-revenue-${month}.${format}`;

  if (format === "csv") {
    const csv = renderCsv(summary);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // PDF
  try {
    const buffer = await renderPdf(summary);
    // Wrap as a Blob — Buffer / Uint8Array hit a TS BodyInit mismatch
    // under Next 15's strict undici typings, but Blob is universally
    // accepted as a BodyInit.
    const blob = new Blob([new Uint8Array(buffer)], {
      type: "application/pdf",
    });
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pdf failed";
    return new NextResponse(msg, { status: 500 });
  }
}
