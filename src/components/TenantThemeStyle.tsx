import "server-only";
import {
  getCurrentTenantBrand,
  hexToHslTriplet,
} from "@/lib/tenant/brand";

const ASTRABODY_DEFAULTS = {
  primary: "#5C6B4E",
  secondary: "#BBC4AA",
  background: "#F6F3EE",
  text: "#3E3E31",
  accent: "#758564",
  fontHeading: "Cormorant Garamond",
  fontBody: "Inter",
};

/**
 * Server component that emits two side-effects in <head>:
 *
 *   1. A <style> block overriding shadcn's CSS variables
 *      (--primary, --accent, --background, --foreground) when the
 *      current tenant has a brand override. Hand-coded sage / cream
 *      utility classes (`bg-sage`, `text-olive`) keep their colours;
 *      shadcn-derived components (`bg-primary`, `text-foreground`)
 *      pick up the tenant brand.
 *
 *   2. A Google Fonts <link> when the tenant overrides the default
 *      Cormorant + Inter. Default fonts are already loaded by Next's
 *      font pipeline in RootLayout; this only fires for non-default
 *      pairs picked from the curated allowlist.
 *
 * Skipping the override entirely when the tenant matches Astrabody's
 * defaults avoids re-flowing the page on a fresh install.
 */
export async function TenantThemeStyle() {
  const brand = await getCurrentTenantBrand();

  const primary = brand.primaryHex ?? ASTRABODY_DEFAULTS.primary;
  const accent = brand.accentHex ?? ASTRABODY_DEFAULTS.accent;
  const background = brand.backgroundHex ?? ASTRABODY_DEFAULTS.background;
  const text = brand.textHex ?? ASTRABODY_DEFAULTS.text;
  const fontHeading = brand.fontHeading ?? ASTRABODY_DEFAULTS.fontHeading;
  const fontBody = brand.fontBody ?? ASTRABODY_DEFAULTS.fontBody;

  const hasColourOverride =
    primary !== ASTRABODY_DEFAULTS.primary ||
    accent !== ASTRABODY_DEFAULTS.accent ||
    background !== ASTRABODY_DEFAULTS.background ||
    text !== ASTRABODY_DEFAULTS.text;

  const hasFontOverride =
    fontHeading !== ASTRABODY_DEFAULTS.fontHeading ||
    fontBody !== ASTRABODY_DEFAULTS.fontBody;

  // Build the override CSS only when we actually deviate from the
  // platform default. Most tenants in V1 will be Astrabody-themed.
  const cssLines: string[] = [];
  if (hasColourOverride) {
    cssLines.push(":root{");
    cssLines.push(`--primary: ${hexToHslTriplet(primary)};`);
    cssLines.push(`--accent: ${hexToHslTriplet(accent)};`);
    cssLines.push(`--background: ${hexToHslTriplet(background)};`);
    cssLines.push(`--foreground: ${hexToHslTriplet(text)};`);
    cssLines.push(`--brand-primary: ${primary};`);
    cssLines.push(`--brand-secondary: ${brand.secondaryHex ?? ASTRABODY_DEFAULTS.secondary};`);
    cssLines.push(`--brand-background: ${background};`);
    cssLines.push(`--brand-text: ${text};`);
    cssLines.push(`--brand-accent: ${accent};`);
    cssLines.push("}");
  }
  if (hasFontOverride) {
    cssLines.push(":root{");
    cssLines.push(`--brand-font-heading: '${escape(fontHeading)}', serif;`);
    cssLines.push(`--brand-font-body: '${escape(fontBody)}', sans-serif;`);
    cssLines.push("}");
  }

  const fontHref = hasFontOverride ? buildGoogleFontsHref(fontHeading, fontBody) : null;

  return (
    <>
      {fontHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          <link href={fontHref} rel="stylesheet" />
        </>
      )}
      {cssLines.length > 0 && (
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: cssLines.join("") }}
        />
      )}
    </>
  );
}

function buildGoogleFontsHref(heading: string, body: string): string {
  const families = [heading, body]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

function escape(value: string): string {
  return value.replace(/'/g, "\\'");
}
