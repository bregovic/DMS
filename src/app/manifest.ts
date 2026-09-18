import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DMS – Výdaje & dokumenty",
    short_name: "DMS",
    description: "Evidence projektů, výdajů a dokumentů.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f3f0",
    theme_color: "#0a0a0a",
    lang: "cs",
    // Zkratky po podržení ikony (Android) – nejčastější cesty bez proklikávání.
    shortcuts: [
      { name: "Moje úkoly", short_name: "Úkoly", url: "/ukoly" },
      { name: "Platby k úhradě", short_name: "Platby", url: "/payments" },
      { name: "Přehled", short_name: "Přehled", url: "/dashboard" },
    ],
    icons: [
      {
        src: "/api/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
