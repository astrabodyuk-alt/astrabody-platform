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
      dynamic: 300,  // RSC payload cached 5 min — portal tabs stay instant
      static: 600,   // static pages cached 10 min
    },
  },
  // pdfkit ships .afm fonts via fs.readFileSync in CJS; webpack can't
  // bundle them, so externalise the package and load it from node_modules
  // at runtime in /api/finance/export.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
