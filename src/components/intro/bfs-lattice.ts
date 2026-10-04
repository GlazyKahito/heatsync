/**
 * The loader's lattice: a hex grid of nodes traversed breadth-first from the centre. BFS levels are computed once with
 * a plain array-backed queue; the loader then reveals nodes level by level as real loading progresses.
 */
export interface Lattice {
  x: Float32Array;
  y: Float32Array;
  level: Int16Array;
  parent: Int32Array;
  maxLevel: number;
  count: number;
  /** node ids sorted by BFS level (visit order) */
  order: Int32Array;
}

export function buildLattice(width: number, height: number, spacing: number): Lattice {
  const cols = Math.ceil(width / spacing) + 2;
  const rows = Math.ceil(height / (spacing * 0.866)) + 2;
  const count = cols * rows;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const ox = (width - (cols - 1) * spacing) / 2;
  const oy = (height - (rows - 1) * spacing * 0.866) / 2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      x[i] = ox + c * spacing + (r % 2 ? spacing / 2 : 0);
      y[i] = oy + r * spacing * 0.866;
    }

  const neighbors = (i: number) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const odd = r % 2 === 1;
    const cand: [number, number][] = [
      [r, c - 1], [r, c + 1],
      [r - 1, odd ? c : c - 1], [r - 1, odd ? c + 1 : c],
      [r + 1, odd ? c : c - 1], [r + 1, odd ? c + 1 : c],
    ];
    return cand.filter(([rr, cc]) => rr >= 0 && rr < rows && cc >= 0 && cc < cols).map(([rr, cc]) => rr * cols + cc);
  };

  const level = new Int16Array(count).fill(-1);
  const parent = new Int32Array(count).fill(-1);
  const order = new Int32Array(count);
  // start from the node nearest the centre
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    const d = (x[i] - width / 2) ** 2 + (y[i] - height / 2) ** 2;
    if (d < best) {
      best = d;
      start = i;
    }
  }
  // array-backed queue: front / rear indices, never shifted
  const queue = new Int32Array(count);
  let front = 0;
  let rear = 0;
  queue[rear++] = start;
  level[start] = 0;
  let k = 0;
  while (front < rear) {
    const u = queue[front++];
    order[k++] = u;
    for (const v of neighbors(u))
      if (level[v] === -1) {
        level[v] = level[u] + 1;
        parent[v] = u;
        queue[rear++] = v;
      }
  }
  let maxLevel = 0;
  for (let i = 0; i < count; i++) if (level[i] > maxLevel) maxLevel = level[i];
  return { x, y, level, parent, maxLevel, count, order };
}

/** Frontier glow is quantised into a few brightness buckets so each bucket is a single path + fill. */
const BUCKETS = 5;

/**
 * Draws the lattice with the BFS frontier at fractional level `front` (and an optional fade-out wave).
 * Nodes are batched by state into one path per style — about a dozen fills per frame instead of one per node.
 */
export function drawLattice(ctx: CanvasRenderingContext2D, L: Lattice, front: number, dpr: number, fade = -1) {
  const { x, y, level, parent, count } = L;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  // BFS tree edges for visited nodes
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const p = parent[i];
    if (p < 0 || level[i] > front || (fade >= 0 && level[i] < fade)) continue;
    ctx.moveTo(x[p], y[p]);
    ctx.lineTo(x[i], y[i]);
  }
  ctx.strokeStyle = 'rgba(189,195,199,0.16)';
  ctx.stroke();

  const unvisited = new Path2D();
  const visited = new Path2D();
  const glow: Path2D[] = [];
  const core: Path2D[] = [];
  for (let b = 0; b < BUCKETS; b++) {
    glow.push(new Path2D());
    core.push(new Path2D());
  }
  const dot = (path: Path2D, cx: number, cy: number, r: number) => {
    path.moveTo(cx + r, cy);
    path.arc(cx, cy, r, 0, Math.PI * 2);
  };
  for (let i = 0; i < count; i++) {
    const lv = level[i];
    if (fade >= 0 && lv < fade) continue;
    const d = front - lv; // >0 visited, ~0 frontier, <0 unvisited
    if (d < 0) dot(unvisited, x[i], y[i], 1.1);
    else if (d >= 1.2) dot(visited, x[i], y[i], 1.35);
    else {
      const k = 1 - d / 1.2;
      const b = Math.min(BUCKETS - 1, Math.floor(k * BUCKETS));
      const r = 1.4 + ((b + 0.5) / BUCKETS) * 2.2;
      dot(glow[b], x[i], y[i], r * 3.2);
      dot(core[b], x[i], y[i], r);
    }
  }
  ctx.fillStyle = 'rgba(189,195,199,0.13)';
  ctx.fill(unvisited);
  ctx.fillStyle = 'rgba(189,195,199,0.5)';
  ctx.fill(visited);
  for (let b = 0; b < BUCKETS; b++) {
    const k = (b + 0.5) / BUCKETS;
    ctx.fillStyle = `rgba(236,240,241,${(0.12 * k).toFixed(3)})`;
    ctx.fill(glow[b]);
    ctx.fillStyle = `rgba(255,255,255,${(0.5 + k * 0.5).toFixed(3)})`;
    ctx.fill(core[b]);
  }
  ctx.restore();
}

/** Dots flying from the lattice into the wordmark's letterforms. */
export interface Assembly {
  /** 0..1 progress of the whole assembly */
  t: number;
  /** overall opacity (fades once the crisp wordmark has taken over) */
  alpha: number;
  src: Float32Array;
  dst: Float32Array;
  delay: Float32Array;
  n: number;
  size: number;
}

/** Lattice fading out underneath while the sampled dots converge onto the glyphs — one path, one fill. */
export function drawAssembly(ctx: CanvasRenderingContext2D, L: Lattice, front: number, a: Assembly, dpr: number) {
  drawLattice(ctx, L, front, dpr);
  ctx.save();
  // fade the lattice already drawn, then paint the flying dots on top
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a.t * 1.6).toFixed(3)})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.scale(dpr, dpr);
  const path = new Path2D();
  for (let i = 0; i < a.n; i++) {
    const k = Math.min(1, Math.max(0, (a.t - a.delay[i]) / 0.5));
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const sx = a.src[2 * i];
    const sy = a.src[2 * i + 1];
    const dx = a.dst[2 * i];
    const dy = a.dst[2 * i + 1];
    // a gentle arc towards the word
    const lift = Math.sin(Math.PI * e) * 40;
    const x = sx + (dx - sx) * e;
    const y = sy + (dy - sy) * e - lift;
    const s = 1.6 + (a.size - 1.6) * e;
    path.rect(x - s / 2, y - s / 2, s, s);
  }
  ctx.fillStyle = `rgba(236,240,241,${(0.9 * a.alpha).toFixed(3)})`;
  ctx.fill(path);
  ctx.restore();
}
