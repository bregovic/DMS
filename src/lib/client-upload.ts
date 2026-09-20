export const MAX_UPLOAD = 14 * 1024 * 1024; // 14 MB (strop server actions je 15 MB)

/** Zmenší a zkomprimuje obrázek (JPEG), ať je menší ale čitelný. PDF/jiné nechá být. */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.7),
    );
    if (!blob || blob.size >= file.size) return file; // nezhoršuj
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

/**
 * Připraví soubor k nahrání a ohlídá limit.
 * `doc: true` = fotka dokladu: vyčistí se (šedá, kontrast, doostření) a je
 * výrazně menší; když by to nepomohlo, použije se běžná komprese.
 */
export async function prepareUpload(file: File, opts?: { doc?: boolean; crop?: boolean }): Promise<File> {
  let out = file;
  if (opts?.doc) {
    const { processDocumentPhoto } = await import("@/lib/image-clean");
    out = (await processDocumentPhoto(file, { crop: opts.crop !== false })).file;
  }
  if (out === file) out = await compressImage(file);
  if (out.size > MAX_UPLOAD) {
    throw new Error("Soubor je větší než 14 MB (i po kompresi).");
  }
  return out;
}
