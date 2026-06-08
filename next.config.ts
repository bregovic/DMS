import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Povolit větší upload souborů přes Server Actions (scany, účtenky).
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
