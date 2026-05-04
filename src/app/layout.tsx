import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { TenantThemeStyle } from "@/components/TenantThemeStyle";

/**
 * Inter for body / UI, Cormorant Garamond for editorial display.
 * Both load via Next's optimised font pipeline (subset, preload, swap).
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Astrabody",
    template: "%s · Astrabody",
  },
  description:
    "A private sanctuary for your transformation. Sculpt. Refine. Transform.",
  applicationName: "Astrabody",
  appleWebApp: {
    capable: true,
    title: "Astrabody",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    other: [
      { rel: "apple-touch-icon", url: "/icons/icon-192.png" },
      { rel: "icon", url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
  other: {
    "apple-mobile-web-app-status-bar-style": "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F3EE",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-GB"
      className={`${inter.variable} ${cormorant.variable}`}
      suppressHydrationWarning
    >
      <head>
        <TenantThemeStyle />
      </head>
      <body className="bg-cream text-olive">{children}</body>
    </html>
  );
}
