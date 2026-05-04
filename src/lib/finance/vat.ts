/**
 * UK VAT helpers. price_pence on bookings + package_purchases is the
 * AMOUNT THE CLIENT PAYS (TTC, gross). When a tenant is VAT-registered
 * we treat price as VAT-inclusive at `vat_rate_pct` (default 20%) and
 * back out the ex-VAT portion. When not registered, ex-VAT = TTC.
 *
 * Pure, no DB calls. Designed to be called with money in pence and
 * return integer pence — rounding to nearest with banker's-style ties.
 */

export interface VatSplit {
  /** What the client pays (gross, VAT-inclusive). */
  ttcPence: number;
  /** Net of VAT — what the studio "earns" pre-tax. */
  exVatPence: number;
  /** Tax portion. ttc - exVat. Always >= 0. */
  vatPence: number;
}

/**
 * Split a TTC amount into ex-VAT + VAT.
 * For non-registered tenants, vatPence = 0 and exVat = ttc.
 */
export function splitVat(
  ttcPence: number,
  vatRegistered: boolean,
  vatRatePct: number
): VatSplit {
  if (!vatRegistered || vatRatePct <= 0 || ttcPence <= 0) {
    return { ttcPence, exVatPence: ttcPence, vatPence: 0 };
  }
  const factor = 1 + vatRatePct / 100;
  const exVat = Math.round(ttcPence / factor);
  return {
    ttcPence,
    exVatPence: exVat,
    vatPence: ttcPence - exVat,
  };
}

/** Sum a list of TTC pence into one VatSplit. */
export function sumVat(
  ttcPences: number[],
  vatRegistered: boolean,
  vatRatePct: number
): VatSplit {
  let ttc = 0;
  let ex = 0;
  for (const p of ttcPences) {
    const split = splitVat(p, vatRegistered, vatRatePct);
    ttc += split.ttcPence;
    ex += split.exVatPence;
  }
  return { ttcPence: ttc, exVatPence: ex, vatPence: ttc - ex };
}
