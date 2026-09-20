/**
 * Úprava fotky dokladu před uložením (běží v prohlížeči, nic se neposílá navíc).
 *
 * Najde papír na fotce (světlá plocha proti pozadí), ořízne ho, narovná
 * perspektivu a uloží jako JPEG v rozumném rozlišení. Ořezem zmizí pozadí,
 * takže soubor spadne z jednotek MB na ~100–250 kB.
 *
 * Záměrně se nepřebarvuje do šedé ani nedoostřuje: porovnání ukázalo, že
 * takové „vylepšení“ soubor naopak nafoukne (ostřením přibude zrno) a čtení
 * údajů je pak výrazně horší. Když se papír spolehlivě najít nedá, použije se
 * jen zmenšení a komprese; když by výsledek vyšel větší, zůstane originál.
 */

const MAX_DIM = 1800; // delší strana výsledku
const QUALITY = 0.8;
const MIN_BYTES = 250 * 1024; // menší soubory nemá smysl přepočítávat
const WORK = 600; // rozlišení, ve kterém se hledá papír

export type PhotoResult = {
  file: File;
  cropped: boolean;
  /** Náhled výsledku (data URL) – pro zobrazení před odesláním. */
  preview: string | null;
};

type Pt = { x: number; y: number };

/** Otsu: práh, který nejlíp odděluje papír od pozadí. */
function otsu(hist: Uint32Array, total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/** Najde rohy papíru; vrátí null, když si detekcí nejsme jistí. */
function findCorners(gray: Uint8ClampedArray, w: number, h: number): [Pt, Pt, Pt, Pt] | null {
  const n = w * h;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[gray[i]]++;
  const thr = otsu(hist, n);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = gray[i] > thr ? 1 : 0;

  // největší souvislá světlá oblast (od středu ven – papír bývá uprostřed)
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let bestSize = 0;
  let bestId = -1;
  let id = 0;
  for (let start = 0; start < n; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    let size = 0;
    while (top > 0) {
      const p = stack[--top];
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      const push = (q: number) => {
        label[q] = id;
        stack[top++] = q;
      };
      if (x > 0 && mask[p - 1] && label[p - 1] === -1) push(p - 1);
      if (x < w - 1 && mask[p + 1] && label[p + 1] === -1) push(p + 1);
      if (y > 0 && mask[p - w] && label[p - w] === -1) push(p - w);
      if (y < h - 1 && mask[p + w] && label[p + w] === -1) push(p + w);
    }
    if (size > bestSize) {
      bestSize = size;
      bestId = id;
    }
    id++;
  }
  // papír musí zabírat rozumnou část fotky (jinak nejspíš jen světlé pozadí)
  const ratio = bestSize / n;
  if (bestId < 0 || ratio < 0.2 || ratio > 0.97) return null;

  let tl = { x: 0, y: 0 };
  let br = { x: 0, y: 0 };
  let tr = { x: 0, y: 0 };
  let bl = { x: 0, y: 0 };
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] !== bestId) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const s = x + y;
    const d = x - y;
    if (s < minSum) {
      minSum = s;
      tl = { x, y };
    }
    if (s > maxSum) {
      maxSum = s;
      br = { x, y };
    }
    if (d > maxDiff) {
      maxDiff = d;
      tr = { x, y };
    }
    if (d < minDiff) {
      minDiff = d;
      bl = { x, y };
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // plocha čtyřúhelníku vs. plocha oblasti – papír má být opravdu čtyřúhelník
  const quadArea =
    Math.abs((tl.x * tr.y - tr.x * tl.y) + (tr.x * br.y - br.x * tr.y) + (br.x * bl.y - bl.x * br.y) + (bl.x * tl.y - tl.x * bl.y)) / 2;
  if (quadArea < bestSize * 0.75) return null;
  const side = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const minSide = Math.min(side(tl, tr), side(tr, br), side(br, bl), side(bl, tl));
  if (minSide < 0.15 * Math.min(w, h)) return null;
  // ať to není jen celá fotka (to už je ořízlý sken)
  const bboxRatio = ((maxX - minX) * (maxY - minY)) / n;
  if (bboxRatio > 0.985) return null;
  return [tl, tr, br, bl];
}

/** Vykreslí obsah čtyřúhelníku narovnaný do obdélníku (bilineární mapování). */
function warp(src: ImageData, corners: [Pt, Pt, Pt, Pt], scale: number, outW: number, outH: number) {
  const [tl, tr, br, bl] = corners.map((p) => ({ x: p.x * scale, y: p.y * scale })) as [Pt, Pt, Pt, Pt];
  const out = new ImageData(outW, outH);
  const s = src.data;
  const o = out.data;
  const sw = src.width;
  const sh = src.height;
  for (let j = 0; j < outH; j++) {
    const v = j / (outH - 1 || 1);
    for (let i = 0; i < outW; i++) {
      const u = i / (outW - 1 || 1);
      const x = (1 - v) * ((1 - u) * tl.x + u * tr.x) + v * ((1 - u) * bl.x + u * br.x);
      const y = (1 - v) * ((1 - u) * tl.y + u * tr.y) + v * ((1 - u) * bl.y + u * br.y);
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(x)));
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(y)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = x - x0;
      const fy = y - y0;
      const idx = (j * outW + i) * 4;
      for (let c = 0; c < 3; c++) {
        const p00 = s[(y0 * sw + x0) * 4 + c];
        const p10 = s[(y0 * sw + x1) * 4 + c];
        const p01 = s[(y1 * sw + x0) * 4 + c];
        const p11 = s[(y1 * sw + x1) * 4 + c];
        o[idx + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
      }
      o[idx + 3] = 255;
    }
  }
  return out;
}

/**
 * Zpracuje fotku dokladu: ořez a narovnání papíru (dá-li se spolehlivě najít)
 * + vyčištění. `crop: false` ořez vynechá.
 */
export async function processDocumentPhoto(file: File, opts?: { crop?: boolean }): Promise<PhotoResult> {
  if (!file.type.startsWith("image/") || file.size < MIN_BYTES) return { file, cropped: false, preview: null };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { file, cropped: false, preview: null };
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const full = ctx.getImageData(0, 0, w, h);

    let work: ImageData = full;
    let cropped = false;
    if (opts?.crop !== false) {
      // hledání papíru v malém rozlišení (rychlé a odolnější vůči šumu)
      const ws = Math.min(1, WORK / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * ws));
      const ch = Math.max(1, Math.round(h * ws));
      const c2 = document.createElement("canvas");
      c2.width = cw;
      c2.height = ch;
      const x2 = c2.getContext("2d", { willReadFrequently: true });
      if (x2) {
        x2.drawImage(canvas, 0, 0, cw, ch);
        const small = x2.getImageData(0, 0, cw, ch);
        const g = new Uint8ClampedArray(cw * ch);
        for (let i = 0, j = 0; i < small.data.length; i += 4, j++)
          g[j] = (small.data[i] * 299 + small.data[i + 1] * 587 + small.data[i + 2] * 114) / 1000;
        const corners = findCorners(g, cw, ch);
        if (corners) {
          const back = w / cw; // zpět do rozlišení výřezu
          const side = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) * back;
          const outW = Math.round(Math.max(side(corners[0], corners[1]), side(corners[3], corners[2])));
          const outH = Math.round(Math.max(side(corners[0], corners[3]), side(corners[1], corners[2])));
          if (outW > 200 && outH > 200) {
            work = warp(full, corners, back, Math.min(outW, MAX_DIM), Math.min(outH, MAX_DIM));
            cropped = true;
          }
        }
      }
    }

    canvas.width = work.width;
    canvas.height = work.height;
    ctx.putImageData(work, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return { file, cropped: false, preview: null };
    const out = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
    return { file: out, cropped, preview: canvas.toDataURL("image/jpeg", 0.5) };
  } catch {
    return { file, cropped: false, preview: null };
  }
}

/** Jen zmenšení a komprese (bez hledání papíru). */
export async function cleanDocumentPhoto(file: File): Promise<File> {
  return (await processDocumentPhoto(file, { crop: false })).file;
}
