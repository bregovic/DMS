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
    <div className="mt-5">
      <p className="kicker">Fotografie · {photos.length}</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {photos.map((p, i) => (
          <button
            key={p.src}
            type="button"
            onClick={() => setIdx(i)}
            className="group relative aspect-[4/3] overflow-hidden bg-stone-100 cursor-zoom-in"
            aria-label={`Zvětšit ${p.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.src}
              alt={p.name}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

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
