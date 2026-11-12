"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Photo = { src: string; name: string };

/** Galerie fotek k zadání (#49): náhledy a zvětšení přes celou obrazovku. */
export function PortalGallery({ photos }: { photos: Photo[] }) {
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    if (idx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIdx(null);
      if (e.key === "ArrowRight") setIdx((i) => (i == null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setIdx((i) => (i == null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [idx, photos.length]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIdx(0)}
        className="group relative block aspect-[4/3] w-full overflow-hidden bg-stone-200 cursor-zoom-in"
        aria-label={`Zvětšit ${photos[0].name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[0].src} alt={photos[0].name} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        {photos.length > 1 && (
          <span className="absolute bottom-2 right-2 bg-stone-950/80 px-2 py-1 font-mono text-[11px] text-white">1 / {photos.length}</span>
        )}
      </button>
      {photos.length > 1 && (
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {photos.slice(1).map((p, k) => (
            <button
              key={p.src}
              type="button"
              onClick={() => setIdx(k + 1)}
              className="group relative aspect-square overflow-hidden bg-stone-200 cursor-zoom-in"
              aria-label={`Zvětšit ${p.name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
            </button>
          ))}
        </div>
      )}

      {idx != null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/95"
          onClick={() => setIdx(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[idx].src}
            alt={photos[idx].name}
            className="max-h-[90vh] max-w-[94vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setIdx(null)}
            className="absolute right-3 top-3 flex size-11 items-center justify-center text-white/80 hover:text-white cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="size-6" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx((idx - 1 + photos.length) % photos.length);
                }}
                className="absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-white/80 hover:text-white cursor-pointer"
                aria-label="Předchozí"
              >
                <ChevronLeft className="size-7" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx((idx + 1) % photos.length);
                }}
                className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-white/80 hover:text-white cursor-pointer"
                aria-label="Další"
              >
                <ChevronRight className="size-7" />
              </button>
              <p className="absolute bottom-4 left-0 right-0 text-center font-mono text-xs text-white/60">
                {idx + 1} / {photos.length}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
