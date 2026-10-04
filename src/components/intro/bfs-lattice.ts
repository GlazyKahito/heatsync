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

/** Draws the lattice with the BFS frontier at fractional level `front` (and an optional fade-out wave). */
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

  for (let i = 0; i < count; i++) {
    const lv = level[i];
    if (fade >= 0 && lv < fade) continue;
    const d = front - lv; // >0 visited, ~0 frontier, <0 unvisited
    let r = 1.1;
    let a = 0.13;
    let col = '189,195,199';
    if (d >= 0 && d < 1.2) {
      const k = 1 - d / 1.2;
      r = 1.4 + k * 2.2;
      a = 0.5 + k * 0.5;
      col = '255,255,255';
      ctx.fillStyle = `rgba(236,240,241,${(0.12 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x[i], y[i], r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (d >= 1.2) {
      r = 1.35;
      a = 0.5;
    }
    ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x[i], y[i], r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
