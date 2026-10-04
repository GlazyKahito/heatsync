/**
 * Samples points from the glyphs of a rendered text element, in viewport pixels. The text is redrawn on an offscreen
 * canvas with the element's own computed font, then stretched horizontally to the element's exact width so the
 * points sit on the visible letters even where canvas and CSS shaping differ slightly.
 */
export interface TextSample {
  /** x, y pairs in viewport pixels */
  points: Float32Array;
  count: number;
  rect: DOMRect;
  /** spacing between samples in px — a good particle size */
  step: number;
}

/** Small deterministic PRNG (mulberry32) so a layout always produces the same particle field. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleText(el: HTMLElement, opts: { max: number; density?: number; seed?: number }): TextSample | null {
  const rect = el.getBoundingClientRect();
  const text = (el.textContent ?? '').trim();
  if (!rect.width || !rect.height || !text) return null;
  const cs = getComputedStyle(el);
  const size = parseFloat(cs.fontSize) || 100;
  const pad = Math.ceil(size * 0.35);
  const w = Math.ceil(rect.width + pad * 2);
  const h = Math.ceil(rect.height + pad * 2);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  try {
    ctx.fontStretch = 'expanded';
    ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
  } catch {
    /* older engines: the horizontal stretch below still matches the width */
  }
  const m = ctx.measureText(text);
  const sx = rect.width / Math.max(1, m.width);
  const baseline = pad + rect.height / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.setTransform(sx, 0, 0, 1, pad, 0);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 0, baseline);

  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(1.6, size / (opts.density ?? 52));
  const rand = rng(opts.seed ?? 7);
  const found: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const jx = x + (rand() - 0.5) * step * 0.6;
      const jy = y + (rand() - 0.5) * step * 0.6;
      const ix = Math.min(w - 1, Math.max(0, Math.round(jx)));
      const iy = Math.min(h - 1, Math.max(0, Math.round(jy)));
      if (data[(iy * w + ix) * 4 + 3] > 128) found.push(jx - pad + rect.left, jy - pad + rect.top);
    }
  }
  // keep a random subset if there are too many (Fisher–Yates on pairs)
  let n = found.length / 2;
  if (n > opts.max) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const ax = found[2 * i];
      const ay = found[2 * i + 1];
      found[2 * i] = found[2 * j];
      found[2 * i + 1] = found[2 * j + 1];
      found[2 * j] = ax;
      found[2 * j + 1] = ay;
    }
    n = opts.max;
  }
  return { points: Float32Array.from(found.slice(0, n * 2)), count: n, rect, step };
}
