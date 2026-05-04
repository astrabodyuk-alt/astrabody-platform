import "server-only";
import type { ExportSummary } from "./export";

/**
 * Render an ExportSummary as a PDF Buffer using pdfkit.
 *
 * pdfkit reads its standard fonts (.afm files) via fs at runtime. We
 * mark the package as `serverExternalPackages` in next.config.ts so
 * webpack doesn't try to bundle the binary font assets.
 *
 * Layout: A4 portrait, sage-deep accents, Helvetica throughout (the
 * shipped pdfkit font — closest visual match to Inter for a printed
 * accountant document).
 */
export async function renderPdf(summary: ExportSummary): Promise<Buffer> {
  // Dynamic import so the heavy pdfkit binary doesn't load on every
  // request that doesn't ask for PDF.
  const PdfKitMod = await import("pdfkit");
  const PDFDocument = (PdfKitMod as unknown as { default: new (opts?: unknown) => PdfDoc })
    .default;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve) => {
    doc.on("end", () => resolve());
  });

  // Header band -------------------------------------------------------
  doc
    .fillColor("#3E3E31")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(summary.tenantName, { continued: false });
  doc
    .moveDown(0.2)
    .fillColor("#5C6B4E")
    .font("Helvetica")
    .fontSize(11)
    .text(`Revenue summary — ${summary.monthLabel}`);

  doc.moveDown(0.6);
  if (summary.vatRegistered) {
    doc
      .fillColor("rgba(62,62,49,0.62)")
      .text(
        `VAT registered at ${summary.vatRatePct}%${
          summary.vatNumber ? ` · VAT no. ${summary.vatNumber}` : ""
        }`,
        { lineGap: 2 }
      );
  } else {
    doc.fillColor("rgba(62,62,49,0.62)").text("Not VAT-registered.");
  }

  doc.moveDown(0.8);
  drawHairline(doc);
  doc.moveDown(0.8);

  // Totals block ------------------------------------------------------
  doc.fillColor("#3E3E31").font("Helvetica-Bold").fontSize(12).text("Totals");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(11);
  totalsRow(doc, "Bookings", summary.bookingTotals);
  totalsRow(doc, "Pack sales", summary.packTotals);
  doc.moveDown(0.2);
  drawHairline(doc, "rgba(62,62,49,0.18)");
  doc.moveDown(0.2);
  totalsRow(doc, "TOTAL", summary.totals, true);

  doc.moveDown(0.8);
  drawHairline(doc);
  doc.moveDown(0.8);

  // Detail table ------------------------------------------------------
  doc.fillColor("#3E3E31").font("Helvetica-Bold").fontSize(12).text("Detail");
  doc.moveDown(0.6);

  const tableTop = doc.y;
  const colX = [56, 110, 230, 360, 430, 490];
  const colWidths = [54, 120, 130, 70, 60, 60];
  const headers = ["Date", "Description", "Client", "Method", "Ex-VAT", "Gross"];

  doc.fillColor("rgba(62,62,49,0.62)").font("Helvetica-Bold").fontSize(9);
  for (let i = 0; i < headers.length; i++) {
    const align: "left" | "right" = i >= 4 ? "right" : "left";
    doc.text(headers[i], colX[i], tableTop, {
      width: colWidths[i],
      align,
    });
  }
  doc.y = tableTop + 14;
  drawHairline(doc, "rgba(62,62,49,0.18)");

  doc.font("Helvetica").fillColor("#3E3E31").fontSize(9.5);
  for (const row of summary.rows) {
    const y = doc.y + 6;
    if (y > doc.page.height - 80) {
      doc.addPage();
    }
    const rowY = doc.y + 6;
    doc.text(formatRowDate(row.date), colX[0], rowY, {
      width: colWidths[0],
    });
    doc.text(row.description, colX[1], rowY, { width: colWidths[1] });
    doc.text(row.client, colX[2], rowY, { width: colWidths[2] });
    doc.text(row.payment_method, colX[3], rowY, {
      width: colWidths[3],
    });
    doc.text(`£${(row.ex_vat_pence / 100).toFixed(2)}`, colX[4], rowY, {
      width: colWidths[4],
      align: "right",
    });
    doc.text(`£${(row.gross_pence / 100).toFixed(2)}`, colX[5], rowY, {
      width: colWidths[5],
      align: "right",
    });
    doc.y = rowY + 14;
  }

  doc.moveDown(1.2);
  doc
    .font("Helvetica-Oblique")
    .fillColor("rgba(62,62,49,0.62)")
    .fontSize(9)
    .text(
      `Generated ${new Date().toLocaleString("en-GB", {
        timeZone: "Europe/London",
      })}. Bookings ${summary.bookingTotals.ttcPence === 0 ? "—" : "fulfilled"} this period.`
    );

  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

interface PdfDoc {
  on(event: string, cb: (arg: Buffer) => void): PdfDoc;
  fillColor(color: string): PdfDoc;
  font(name: string): PdfDoc;
  fontSize(size: number): PdfDoc;
  text(text: string, ...rest: unknown[]): PdfDoc;
  moveDown(amount?: number): PdfDoc;
  moveTo(x: number, y: number): PdfDoc;
  lineTo(x: number, y: number): PdfDoc;
  lineWidth(w: number): PdfDoc;
  stroke(): PdfDoc;
  end(): void;
  addPage(): PdfDoc;
  page: { width: number; height: number };
  y: number;
}

function drawHairline(
  doc: PdfDoc,
  color: string = "rgba(62,62,49,0.10)"
): void {
  const left = 56;
  const right = 595 - 56;
  doc
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .lineWidth(0.5)
    .fillColor(color)
    .stroke();
  doc.y += 6;
}

function totalsRow(
  doc: PdfDoc,
  label: string,
  totals: { ttcPence: number; exVatPence: number; vatPence: number },
  bold?: boolean
): void {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor("#3E3E31");
  const y = doc.y + 4;
  doc.text(label, 56, y, { width: 200 });
  doc.text(`£${(totals.exVatPence / 100).toFixed(2)} ex-VAT`, 260, y, {
    width: 140,
    align: "right",
  });
  doc.text(`£${(totals.vatPence / 100).toFixed(2)} VAT`, 400, y, {
    width: 80,
    align: "right",
  });
  doc.text(`£${(totals.ttcPence / 100).toFixed(2)} gross`, 480, y, {
    width: 70,
    align: "right",
  });
  doc.y = y + 16;
}

function formatRowDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/London",
  });
}
