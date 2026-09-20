/**
 * Úprava fotky dokladu před uložením (běží v prohlížeči, nic se neposílá navíc).
 *
 * Fotka účtenky z telefonu má 3–8 MB, přitom je to papír s textem. Převedeme
 * ji do šedé, roztáhneme kontrast podle histogramu (papír zbělá, text zčerná),
 * lehce doostříme a uložíme jako JPEG v rozumném rozlišení. Výsledek bývá
 * desetina původní velikosti a čte se z něj líp než z originálu.
 *
 * Když by výsledek vyšel větší (nebo se něco nepovede), vrátí se původní soubor.
 */

const MAX_DIM = 1800; // delší strana – na text účtenky bohatě stačí
const QUALITY = 0.72;

/** Práh, pod kterým se čištění nevyplatí (malé obrázky, skeny). */
const MIN_BYTES = 250 * 1024;

export async function cleanDocumentPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < MIN_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const n = w * h;

    // 1) do šedé + histogram
    const gray = new Uint8ClampedArray(n);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      gray[j] = g;
      hist[g | 0]++;
    }

    // 2) roztažení kontrastu mezi 2. a 98. percentil (bez vypálení textu)
    const lowCut = n * 0.02;
    const highCut = n * 0.98;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= lowCut) {
        lo = v;
        break;
      }
    }
    acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= highCut) {
        hi = v;
        break;
      }
    }
    if (hi - lo < 25) {
      lo = 0;
      hi = 255;
    }
    const span = hi - lo;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const t = Math.min(1, Math.max(0, (v - lo) / span));
      // jemná S-křivka: papír dobělí, text ztmavne, půltóny zůstanou
      lut[v] = Math.round(255 * (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)));
    }
    const out = new Uint8ClampedArray(n);
    for (let j = 0; j < n; j++) out[j] = lut[gray[j]];

    // 3) mírné doostření (unsharp mask 3×3)
    const sharp = new Uint8ClampedArray(n);
    const amount = 0.6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          sharp[i] = out[i];
          continue;
        }
        const blur =
          (out[i - w - 1] + out[i - w] + out[i - w + 1] + out[i - 1] + out[i] + out[i + 1] + out[i + w - 1] + out[i + w] + out[i + w + 1]) / 9;
        sharp[i] = out[i] + amount * (out[i] - blur);
      }
    }

    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      px[i] = px[i + 1] = px[i + 2] = sharp[j];
      px[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
