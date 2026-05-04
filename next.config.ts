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
  },
  // pdfkit ships .afm fonts via fs.readFileSync in CJS; webpack can't
  // bundle them, so externalise the package and load it from node_modules
  // at runtime in /api/finance/export.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
