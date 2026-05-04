/**
 * Client-safe pieces of the tenant brand system. The server-only
 * resolver lives in `brand.ts` — anything client code needs
 * (font allowlist, contrast helper, hex normalise) lands here.
 */

export interface TenantBrand {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryHex: string;
  secondaryHex: string;
  backgroundHex: string;
  textHex: string;
  accentHex: string;
  fontHeading: string;
  fontBody: string;
  subdomain: string | null;
  customDomain: string | null;
  timezone: string;
}

export interface FontPair {
  id: string;
  label: string;
  heading: string;
  body: string;
}

export const FONT_PAIRS: FontPair[] = [
  {
    id: "cormorant-inter",
    label: "Cormorant + Inter (Astrabody default)",
    heading: "Cormorant Garamond",
    body: "Inter",
  },
  {
    id: "playfair-source-sans",
    label: "Playfair Display + Source Sans 3",
    heading: "Playfair Display",
    body: "Source Sans 3",
  },
  {
    id: "fraunces-figtree",
    label: "Fraunces + Figtree",
    heading: "Fraunces",
    body: "Figtree",
  },
  {
    id: "libre-baskerville-mulish",
    label: "Libre Baskerville + Mulish",
    heading: "Libre Baskerville",
    body: "Mulish",
  },
  {
    id: "dm-serif-dm-sans",
    label: "DM Serif Display + DM Sans",
    heading: "DM Serif Display",
    body: "DM Sans",
  },
  {
    id: "ibm-plex-serif-ibm-plex-sans",
    label: "IBM Plex Serif + IBM Plex Sans",
    heading: "IBM Plex Serif",
    body: "IBM Plex Sans",
  },
  {
    id: "manrope-only",
    label: "Manrope (modern sans, single family)",
    heading: "Manrope",
    body: "Manrope",
  },
];

/** Convert hex → CSS HSL triplet ("92 14% 46%"). Pure. */
export function hexToHslTriplet(hex: string): string {
  const cleaned = hex.replace(/^#/, "");
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  if (full.length !== 6) return "0 0% 0%";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Validate a hex colour string. Accepts #RGB or #RRGGBB. Returns the
 * canonical 7-char form, or null if invalid.
 */
export function normaliseHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const m = trimmed.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
  if (!m) return null;
  if (m[1].length === 3) {
    return (
      "#" +
      m[1]
        .split("")
        .map((c) => c + c)
        .join("")
        .toUpperCase()
    );
  }
  return "#" + m[1].toUpperCase();
}

/**
 * WCAG 2.1 contrast ratio between two hex colours. AA threshold for
 * body text is 4.5:1; large text 3:1.
 */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const lum = (hex: string): number => {
    const cleaned = hex.replace(/^#/, "");
    const r = parseInt(cleaned.slice(0, 2), 16) / 255;
    const g = parseInt(cleaned.slice(2, 4), 16) / 255;
    const b = parseInt(cleaned.slice(4, 6), 16) / 255;
    const channel = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const l1 = lum(fgHex);
  const l2 = lum(bgHex);
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}
