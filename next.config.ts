import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "astrabody.co.uk",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
    // Keep pages in the client-side router cache longer so revisiting
    // a tab feels instant rather than triggering a full server round-trip.
    staleTimes: {
      dynamic: 60,   // dynamic pages cached 60s (default: 30s)
      static: 300,   // static pages cached 5 min (default: 5 min)
    },
  },
  // pdfkit ships .afm fonts via fs.readFileSync in CJS; webpack can't
  // bundle them, so externalise the package and load it from node_modules
  // at runtime in /api/finance/export.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
