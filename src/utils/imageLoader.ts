import { normalizeGrayscaleFromRGBA } from '../dsp/notch';
import type { GrayscaleImage } from '../dsp/types';

export interface LoadedImageResult extends GrayscaleImage {
  name: string;
  originalWidth: number;
  originalHeight: number;
  wasResized: boolean;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_DIMENSION = 1024;
export const MAX_DECODE_DIMENSION = 8192;
export const MAX_DECODE_PIXELS = 33_554_432;
export const MAX_PROCESS_DIMENSION = 2048;

const sampleCache = new Map<string, LoadedImageResult>();

function sanitizeDisplayName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim();
  return cleaned.slice(0, 120) || 'gambar';
}

// Parse Netpbm PGM header (P2 ASCII or P5 binary) and return dimensions + pixel data offset.
function parsePgmHeader(bytes: Uint8Array): {
  magic: 'P2' | 'P5';
  width: number;
  height: number;
  maxVal: number;
  dataOffset: number;
} {
  let pos = 0;
  const tokens: string[] = [];

  const isWs = (b: number) => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;

  while (tokens.length < 4 && pos < bytes.length) {
    while (pos < bytes.length && isWs(bytes[pos]!)) pos++;
    if (pos >= bytes.length) break;
    if (bytes[pos] === 0x23) {
      while (pos < bytes.length && bytes[pos] !== 0x0a) pos++;
      continue;
    }
    const start = pos;
    while (pos < bytes.length && !isWs(bytes[pos]!) && bytes[pos] !== 0x23) pos++;
    tokens.push(String.fromCharCode(...bytes.subarray(start, pos)));
  }

  if (tokens.length < 4) {
    throw new Error('Header berkas PGM tidak lengkap.');
  }
  const magic = tokens[0];
  if (magic !== 'P2' && magic !== 'P5') {
    throw new Error('Hanya format PGM P2 atau P5 yang didukung.');
  }
  const width = Number.parseInt(tokens[1]!, 10);
  const height = Number.parseInt(tokens[2]!, 10);
  const maxVal = Number.parseInt(tokens[3]!, 10);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !Number.isInteger(maxVal) ||
    width < 1 ||
    height < 1 ||
    maxVal < 1 ||
    maxVal > 65535
  ) {
    throw new Error('Dimensi atau maxval pada berkas PGM tidak valid.');
  }
  if (pos < bytes.length && isWs(bytes[pos]!)) pos++;
  return { magic, width, height, maxVal, dataOffset: pos };
}

function decodePgmBytes(
  bytes: Uint8Array,
  name: string,
  maxDimension: number | null,
): LoadedImageResult {
  const { magic, width, height, maxVal, dataOffset } = parsePgmHeader(bytes);
  if (width < 4 || height < 4) {
    throw new Error('Ukuran gambar terlalu kecil (minimal 4 x 4 piksel).');
  }
  if (
    width > MAX_DECODE_DIMENSION ||
    height > MAX_DECODE_DIMENSION ||
    width * height > MAX_DECODE_PIXELS
  ) {
    throw new Error(`Dimensi gambar (${width} x ${height} px) melebihi batas aman pemrosesan.`);
  }

  const total = width * height;
  const raw = new Float64Array(total);
  const invMax = 1.0 / maxVal;

  if (magic === 'P5') {
    if (maxVal < 256) {
      if (dataOffset + total > bytes.length) {
        throw new Error('Data piksel PGM P5 terpotong.');
      }
      for (let i = 0; i < total; i++) {
        raw[i] = bytes[dataOffset + i]! * invMax;
      }
    } else {
      if (dataOffset + total * 2 > bytes.length) {
        throw new Error('Data piksel PGM P5 16-bit terpotong.');
      }
      for (let i = 0; i < total; i++) {
        const hi = bytes[dataOffset + i * 2]!;
        const lo = bytes[dataOffset + i * 2 + 1]!;
        raw[i] = ((hi << 8) | lo) * invMax;
      }
    }
  } else {
    const ascii = new TextDecoder().decode(bytes.subarray(dataOffset));
    const parts = ascii.trim().split(/\s+/);
    if (parts.length < total) {
      throw new Error('Data piksel PGM P2 terpotong.');
    }
    for (let i = 0; i < total; i++) {
      const val = Number.parseInt(parts[i]!, 10);
      raw[i] = Number.isFinite(val) ? Math.min(1, Math.max(0, val * invMax)) : 0;
    }
  }

  const effectiveCap =
    maxDimension === null
      ? MAX_PROCESS_DIMENSION
      : Math.min(maxDimension, MAX_PROCESS_DIMENSION);

  if (width <= effectiveCap && height <= effectiveCap) {
    return {
      width,
      height,
      data: raw,
      name: sanitizeDisplayName(name),
      originalWidth: width,
      originalHeight: height,
      wasResized: false,
    };
  }

  const scale = effectiveCap / Math.max(width, height);
  const targetWidth = Math.max(4, Math.round(width * scale));
  const targetHeight = Math.max(4, Math.round(height * scale));
  const resized = new Float64Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / targetHeight));
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / targetWidth));
      resized[y * targetWidth + x] = raw[sy * width + sx]!;
    }
  }

  return {
    width: targetWidth,
    height: targetHeight,
    data: resized,
    name: sanitizeDisplayName(name),
    originalWidth: width,
    originalHeight: height,
    wasResized: true,
  };
}

// Inspect PNG, JPEG, WebP, or PGM magic bytes and header dimensions before browser image decode.
export function inspectImageHeader(bytes: Uint8Array): {
  format: 'png' | 'jpeg' | 'webp' | 'pgm';
  width: number;
  height: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      format: 'png',
      width: view.getUint32(16, false),
      height: view.getUint32(20, false),
    };
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let off = 2;
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) {
        off++;
        continue;
      }
      while (off < bytes.length && bytes[off] === 0xff) off++;
      if (off >= bytes.length) break;
      const marker = bytes[off]!;
      off++;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (off + 2 > bytes.length) break;
      const segLen = view.getUint16(off, false);
      if (segLen < 2 || off + segLen > bytes.length) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (off + 7 <= bytes.length) {
          return {
            format: 'jpeg',
            height: view.getUint16(off + 3, false),
            width: view.getUint16(off + 5, false),
          };
        }
      }
      off += segLen;
    }
    throw new Error('Header dimensi JPEG tidak valid atau terpotong.');
  }

  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
    if (chunk === 'VP8X') {
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      return { format: 'webp', width, height };
    }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return {
        format: 'webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === 'VP8 ') {
      return {
        format: 'webp',
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
  }

  if (
    bytes.length >= 7 &&
    bytes[0] === 0x50 &&
    (bytes[1] === 0x32 || bytes[1] === 0x35) &&
    (bytes[2] === 0x0a || bytes[2] === 0x0d || bytes[2] === 0x20 || bytes[2] === 0x09)
  ) {
    const pgm = parsePgmHeader(bytes);
    return { format: 'pgm', width: pgm.width, height: pgm.height };
  }

  throw new Error('Format tidak didukung. Unggah berkas PNG, JPG, WebP, atau PGM yang valid.');
}

function decodeImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Gagal membaca berkas gambar. Pastikan format PNG, JPG, WebP, atau PGM valid.'));
    img.src = src;
  });
}

export function rasterizeCanvasSource(
  source: CanvasImageSource,
  originalWidth: number,
  originalHeight: number,
  name: string,
  maxDimension: number | null,
): LoadedImageResult {
  if (originalWidth < 4 || originalHeight < 4) {
    throw new Error('Ukuran gambar terlalu kecil (minimal 4 x 4 piksel).');
  }
  if (
    originalWidth > MAX_DECODE_DIMENSION ||
    originalHeight > MAX_DECODE_DIMENSION ||
    originalWidth * originalHeight > MAX_DECODE_PIXELS
  ) {
    throw new Error(
      `Dimensi gambar (${originalWidth} x ${originalHeight} px) melebihi batas aman pemrosesan browser.`,
    );
  }

  const effectiveCap =
    maxDimension === null
      ? MAX_PROCESS_DIMENSION
      : Math.min(maxDimension, MAX_PROCESS_DIMENSION);

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;
  let wasResized = false;

  if (originalWidth > effectiveCap || originalHeight > effectiveCap) {
    const scale = effectiveCap / Math.max(originalWidth, originalHeight);
    targetWidth = Math.max(4, Math.round(originalWidth * scale));
    targetHeight = Math.max(4, Math.round(originalHeight * scale));
    wasResized = true;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D tidak tersedia pada browser ini.');
    }
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    } catch {
      throw new Error('Gagal membaca piksel gambar dari kanvas. Coba ukuran gambar lebih kecil.');
    }
    const gray = normalizeGrayscaleFromRGBA(imageData.data, targetWidth, targetHeight);
    return {
      ...gray,
      name: sanitizeDisplayName(name),
      originalWidth,
      originalHeight,
      wasResized,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function loadImageFromFile(
  file: File,
  maxDimension: number | null = DEFAULT_MAX_DIMENSION,
): Promise<LoadedImageResult> {
  if (file.size === 0) {
    throw new Error('Berkas gambar kosong.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Ukuran berkas melebihi batas 20 MB.');
  }

  const headerSlice = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  const header = inspectImageHeader(headerSlice);
  if (header.width < 4 || header.height < 4) {
    throw new Error('Ukuran gambar terlalu kecil (minimal 4 x 4 piksel).');
  }
  if (
    header.width > MAX_DECODE_DIMENSION ||
    header.height > MAX_DECODE_DIMENSION ||
    header.width * header.height > MAX_DECODE_PIXELS
  ) {
    throw new Error(
      `Dimensi gambar (${header.width} x ${header.height} px) melebihi batas aman pemrosesan (${MAX_DECODE_DIMENSION} px).`,
    );
  }

  if (header.format === 'pgm') {
    const fullBytes = new Uint8Array(await file.arrayBuffer());
    return decodePgmBytes(fullBytes, file.name, maxDimension);
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await decodeImageElement(url);
    return rasterizeCanvasSource(img, img.naturalWidth, img.naturalHeight, file.name, maxDimension);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadImageFromUrl(
  url: string,
  label: string,
  maxDimension: number | null = null,
): Promise<LoadedImageResult> {
  if (!url.startsWith('/') || url.startsWith('//')) {
    throw new Error('Hanya jalur gambar lokal relatif yang diizinkan.');
  }
  const cacheKey = `${url}|${maxDimension ?? 'native'}`;
  const cached = sampleCache.get(cacheKey);
  if (cached) {
    return { ...cached, data: new Float64Array(cached.data) };
  }

  let result: LoadedImageResult;
  if (url.toLowerCase().endsWith('.pgm')) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Gagal mengunduh sampel PGM (${res.status}).`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    result = decodePgmBytes(bytes, label, maxDimension);
  } else {
    const img = await decodeImageElement(url);
    result = rasterizeCanvasSource(img, img.naturalWidth, img.naturalHeight, label, maxDimension);
  }

  sampleCache.set(cacheKey, { ...result, data: new Float64Array(result.data) });
  return result;
}
