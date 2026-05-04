import type { Config } from "tailwindcss";

/**
 * Astrabody Platform — Tailwind config.
 *
 * The whole design system lives here. Two rules:
 *   1. Add new tokens to `theme.extend` only, not at top level.
 *   2. Every brand colour also exists as a shadcn semantic token in
 *      globals.css, so 21st.dev components plug in cleanly.
 *
 * If you find yourself reaching for a one-off hex in a component, stop
 * and either pick the nearest token here, or add a new token.
 */

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ===== Brand tokens (Astrabody-native names) =====
        cream: {
          DEFAULT: "#F6F3EE",
          deep: "#EFEAE2",
        },
        sand: "#DED2C3",
        sage: {
          DEFAULT: "#758564",
          deep: "#5C6B4E",
          light: "#BBC4AA",
        },
        olive: {
          DEFAULT: "#3E3E31",
          soft: "rgba(62,62,49,0.62)",
          faint: "rgba(62,62,49,0.42)",
        },
        hairline: {
          DEFAULT: "rgba(62,62,49,0.08)",
          strong: "rgba(62,62,49,0.14)",
        },
        terracotta: "#C9623F",
        gold: {
          DEFAULT: "#B8945A",
          soft: "#E5D2A8",
        },

        // ===== shadcn / 21st.dev semantic tokens =====
        // These read CSS variables defined in globals.css, so the whole
        // shadcn ecosystem (and any 21st.dev block) inherits Astrabody
        // colours automatically.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        // White-label brand tokens — backed by hex CSS vars set per
        // tenant in src/components/TenantThemeStyle.tsx. Use these
        // (`bg-brand-primary`, `text-brand-text`, etc.) in NEW UI you
        // want to inherit the tenant's palette. Existing Astrabody UI
        // keeps using sage / cream / olive directly.
        brand: {
          primary: "var(--brand-primary, #5C6B4E)",
          secondary: "var(--brand-secondary, #BBC4AA)",
          background: "var(--brand-background, #F6F3EE)",
          text: "var(--brand-text, #3E3E31)",
          accent: "var(--brand-accent, #758564)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },

      fontFamily: {
        // Cormorant for editorial / hero / numbers in cards.
        // Inter for everything else.
        // Mono for tabular financial / time data when monospace helps.
        serif: ["var(--font-cormorant)", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
      },

      // 8 px grid hardcoded as friendly aliases.
      spacing: {
        "0.5": "0.125rem", // 2px
        "1": "0.25rem",    // 4px
        "2": "0.5rem",     // 8px
        "3": "0.75rem",    // 12px
        "4": "1rem",       // 16px
        "5": "1.25rem",    // 20px
        "6": "1.5rem",     // 24px
        "8": "2rem",       // 32px
        "12": "3rem",      // 48px
        "16": "4rem",      // 64px
        "24": "6rem",      // 96px
      },

      borderRadius: {
        // Apple-style: nothing sharp.
        sm: "8px",
        DEFAULT: "12px",
        md: "12px",
        lg: "22px",        // standard card
        xl: "28px",        // hero / loyalty card
        "2xl": "44px",     // phone screen mockup
        full: "999px",     // pill / button
      },

      boxShadow: {
        // Three-layer Apple-neutral shadow palette — see design-dna.md §3.6
        "1": "0 1px 2px rgba(62,62,49,0.05)",
        "2": "0 0.5px 1px rgba(62,62,49,0.06), 0 4px 18px rgba(62,62,49,0.06)",
        "3": "0 1px 2px rgba(62,62,49,0.06), 0 4px 12px rgba(62,62,49,0.06), 0 24px 64px rgba(62,62,49,0.10)",
        btn: "0 1px 2px rgba(62,62,49,0.10), 0 8px 20px rgba(62,62,49,0.12)",
        "btn-hover": "0 1px 2px rgba(62,62,49,0.10), 0 14px 28px rgba(62,62,49,0.16)",
        // Subtle inner highlight used on the loyalty hero card.
        "inset-glow": "inset 0 1px 0 rgba(255,255,255,0.10)",
      },

      letterSpacing: {
        tightest: "-0.02em",
        tighter: "-0.015em",
        tight: "-0.01em",
        snug: "-0.005em",
        normal: "0",
        // Apple-style all-caps labels: 16% tracking is the magic number.
        "label-caps": "0.16em",
      },

      backdropBlur: {
        "20": "20px",
        "24": "24px",
      },

      // Apple's iOS native easing curve. Use this for everything.
      transitionTimingFunction: {
        ios: "cubic-bezier(0.32, 0.72, 0, 1)",
      },

      transitionDuration: {
        "120": "120ms",
        "200": "200ms",
        "240": "240ms",
        "320": "320ms",
        "600": "600ms",
      },

      keyframes: {
        // Apple-style "tap-back" — used for a 600 ms confirmation pulse
        // on the loyalty number when points are credited.
        "soft-pulse": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "soft-pulse": "soft-pulse 600ms cubic-bezier(0.32, 0.72, 0, 1)",
        "fade-up": "fade-up 240ms cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
