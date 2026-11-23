// Exact arbitrary-size 1D/2D FFT using radix-2 Cooley-Tukey and Bluestein chirp-z.

interface BluesteinPlan {
  n: number;
  m: number;
  cosTable: Float64Array;
  sinTable: Float64Array;
  bReFwd: Float64Array;
  bImFwd: Float64Array;
  bReInv: Float64Array;
  bImInv: Float64Array;
  aRe: Float64Array;
  aIm: Float64Array;
}

const MAX_CACHED_PLANS = 16;
const bluesteinPlanCache = new Map<number, BluesteinPlan>();

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function nextPowerOfTwo(n: number): number {
  let m = 1;
  while (m < n) m <<= 1;
  return m;
}

function fftRadix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n <= 1) return;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (sign * 2 * Math.PI) / len;
    const wStepRe = Math.cos(angle);
    const wStepIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j]!;
        const uIm = im[i + j]!;
        const vRe = re[i + j + half]! * wRe - im[i + j + half]! * wIm;
        const vIm = re[i + j + half]! * wIm + im[i + j + half]! * wRe;

        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;

        const nextWRe = wRe * wStepRe - wIm * wStepIm;
        wIm = wRe * wStepIm + wIm * wStepRe;
        wRe = nextWRe;
      }
    }
  }

  if (inverse) {
    const invN = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! * invN;
      im[i] = im[i]! * invN;
    }
  }
}

function getBluesteinPlan(n: number): BluesteinPlan {
  const existing = bluesteinPlanCache.get(n);
  if (existing) return existing;

  const m = nextPowerOfTwo(2 * n - 1);
  const cosTable = new Float64Array(n);
  const sinTable = new Float64Array(n);
  const twoN = 2 * n;

  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * ((i * i) % twoN)) / n;
    cosTable[i] = Math.cos(angle);
    sinTable[i] = Math.sin(angle);
  }

  // Forward uses chirp w_k = exp(-i*pi*k^2/n); kernel b[r] = conj(w_r) = exp(+i*pi*r^2/n).
  const bReFwd = new Float64Array(m);
  const bImFwd = new Float64Array(m);
  const bReInv = new Float64Array(m);
  const bImInv = new Float64Array(m);

  bReFwd[0] = cosTable[0]!;
  bImFwd[0] = sinTable[0]!;
  bReInv[0] = cosTable[0]!;
  bImInv[0] = -sinTable[0]!;

  for (let i = 1; i < n; i++) {
    const c = cosTable[i]!;
    const s = sinTable[i]!;
    bReFwd[i] = c;
    bImFwd[i] = s;
    bReFwd[m - i] = c;
    bImFwd[m - i] = s;

    bReInv[i] = c;
    bImInv[i] = -s;
    bReInv[m - i] = c;
    bImInv[m - i] = -s;
  }

  fftRadix2(bReFwd, bImFwd, false);
  fftRadix2(bReInv, bImInv, false);

  const plan: BluesteinPlan = {
    n,
    m,
    cosTable,
    sinTable,
    bReFwd,
    bImFwd,
    bReInv,
    bImInv,
    aRe: new Float64Array(m),
    aIm: new Float64Array(m),
  };

  if (bluesteinPlanCache.size >= MAX_CACHED_PLANS) {
    const firstKey = bluesteinPlanCache.keys().next().value;
    if (firstKey !== undefined) bluesteinPlanCache.delete(firstKey);
  }
  bluesteinPlanCache.set(n, plan);
  return plan;
}

function fftBluestein(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  const plan = getBluesteinPlan(n);
  const { m, cosTable, sinTable, aRe, aIm } = plan;
  const bRe = inverse ? plan.bReInv : plan.bReFwd;
  const bIm = inverse ? plan.bImInv : plan.bImFwd;

  aRe.fill(0);
  aIm.fill(0);

  if (!inverse) {
    for (let i = 0; i < n; i++) {
      const c = cosTable[i]!;
      const s = sinTable[i]!;
      const xr = re[i]!;
      const xi = im[i]!;
      // Multiply by exp(-i*pi*i^2/n) = c - i*s.
      aRe[i] = xr * c + xi * s;
      aIm[i] = xi * c - xr * s;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const c = cosTable[i]!;
      const s = sinTable[i]!;
      const xr = re[i]!;
      const xi = im[i]!;
      // Multiply by exp(+i*pi*i^2/n) = c + i*s.
      aRe[i] = xr * c - xi * s;
      aIm[i] = xi * c + xr * s;
    }
  }

  fftRadix2(aRe, aIm, false);

  for (let i = 0; i < m; i++) {
    const ar = aRe[i]!;
    const ai = aIm[i]!;
    const br = bRe[i]!;
    const bi = bIm[i]!;
    aRe[i] = ar * br - ai * bi;
    aIm[i] = ar * bi + ai * br;
  }

  fftRadix2(aRe, aIm, true);

  if (!inverse) {
    for (let i = 0; i < n; i++) {
      const c = cosTable[i]!;
      const s = sinTable[i]!;
      const cr = aRe[i]!;
      const ci = aIm[i]!;
      re[i] = cr * c + ci * s;
      im[i] = ci * c - cr * s;
    }
  } else {
    const invN = 1 / n;
    for (let i = 0; i < n; i++) {
      const c = cosTable[i]!;
      const s = sinTable[i]!;
      const cr = aRe[i]!;
      const ci = aIm[i]!;
      re[i] = (cr * c - ci * s) * invN;
      im[i] = (ci * c + cr * s) * invN;
    }
  }
}

export function fft1d(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length) {
    throw new Error('Panjang buffer real dan imajiner harus sama.');
  }
  if (n <= 1) return;
  if (isPowerOfTwo(n)) {
    fftRadix2(re, im, inverse);
  } else {
    fftBluestein(re, im, inverse);
  }
}

export function fft2d(
  re: Float64Array,
  im: Float64Array,
  width: number,
  height: number,
  inverse = false,
): void {
  if (width < 1 || height < 1 || re.length !== width * height || im.length !== width * height) {
    throw new Error('Dimensi buffer FFT 2D tidak valid.');
  }

  const rowRe = new Float64Array(width);
  const rowIm = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    rowRe.set(re.subarray(offset, offset + width));
    rowIm.set(im.subarray(offset, offset + width));
    fft1d(rowRe, rowIm, inverse);
    re.set(rowRe, offset);
    im.set(rowIm, offset);
  }

  const colRe = new Float64Array(height);
  const colIm = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const idx = y * width + x;
      colRe[y] = re[idx]!;
      colIm[y] = im[idx]!;
    }
    fft1d(colRe, colIm, inverse);
    for (let y = 0; y < height; y++) {
      const idx = y * width + x;
      re[idx] = colRe[y]!;
      im[idx] = colIm[y]!;
    }
  }
}

export function fftShift2D(
  input: Float64Array,
  width: number,
  height: number,
): Float64Array {
  const out = new Float64Array(width * height);
  const shiftY = Math.floor(height / 2);
  const shiftX = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    const dstY = (y + shiftY) % height;
    const srcRow = y * width;
    const dstRow = dstY * width;
    for (let x = 0; x < width; x++) {
      const dstX = (x + shiftX) % width;
      out[dstRow + dstX] = input[srcRow + x]!;
    }
  }
  return out;
}

export function ifftShift2D(
  input: Float64Array,
  width: number,
  height: number,
): Float64Array {
  const out = new Float64Array(width * height);
  const shiftY = Math.floor(height / 2);
  const shiftX = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    const srcY = (y + shiftY) % height;
    const srcRow = srcY * width;
    const dstRow = y * width;
    for (let x = 0; x < width; x++) {
      const srcX = (x + shiftX) % width;
      out[dstRow + x] = input[srcRow + srcX]!;
    }
  }
  return out;
}
