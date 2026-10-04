/**
 * EXP6 - Graph as an adjacency matrix, traversed by BFS with a static linear queue.
 *
 * Vertices are 0..n-1; `adj[u][v] !== 0` means an edge u -> v. BFS scans a
 * full matrix row per dequeued vertex, so it costs O(V^2).
 * Powers the HEATSYNC Heat Spread Graph (districts sharing a border).
 */
import { DEFAULT_MAX_STEPS, Tracer, type Traced } from './trace';

// ---------------------------------------------------------------------------
// Static linear queue
// ---------------------------------------------------------------------------

export type LinearEnqueueResult = { ok: true; index: number } | { ok: false; reason: 'overflow' };
export type LinearDequeueResult<T> = { ok: true; index: number; item: T } | { ok: false; reason: 'underflow' };

/** Immutable view of a {@link LinearQueue}. */
export interface LinearQueueSnapshot<T> {
  slots: (T | null)[];
  front: number;
  rear: number;
  capacity: number;
}

/**
 * Classic static linear queue: front = rear = -1 initially, overflow when
 * `rear === capacity - 1`, underflow when `front === -1 || front > rear`.
 * Slots freed by dequeue are never reused (the textbook limitation).
 */
export class LinearQueue<T = number> {
  private readonly memory: (T | null)[];
  private readonly cap: number;
  private f = -1;
  private r = -1;

  /** @throws RangeError when `capacity` is not a positive integer. */
  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`LinearQueue capacity must be a positive integer, got ${capacity}`);
    }
    this.cap = capacity;
    this.memory = new Array<T | null>(capacity);
    for (let i = 0; i < capacity; i++) this.memory[i] = null;
  }

  get front(): number {
    return this.f;
  }

  get rear(): number {
    return this.r;
  }

  get capacity(): number {
    return this.cap;
  }

  /** Items currently waiting. */
  get size(): number {
    return this.isEmpty() ? 0 : this.r - this.f + 1;
  }

  isEmpty(): boolean {
    return this.f === -1 || this.f > this.r;
  }

  isFull(): boolean {
    return this.r === this.cap - 1;
  }

  /** O(1). */
  enqueue(item: T): LinearEnqueueResult {
    if (this.r === this.cap - 1) return { ok: false, reason: 'overflow' };
    if (this.f === -1) this.f = 0;
    this.r++;
    this.memory[this.r] = item;
    return { ok: true, index: this.r };
  }

  /** O(1). */
  dequeue(): LinearDequeueResult<T> {
    if (this.isEmpty()) return { ok: false, reason: 'underflow' };
    const index = this.f;
    const item = this.memory[index] as T;
    this.f++;
    return { ok: true, index, item };
  }

  peek(): T | undefined {
    return this.isEmpty() ? undefined : (this.memory[this.f] as T);
  }

  /** Waiting items from front to rear. */
  toArray(): T[] {
    const out: T[] = [];
    if (this.isEmpty()) return out;
    for (let i = this.f; i <= this.r; i++) out.push(this.memory[i] as T);
    return out;
  }

  snapshot(): LinearQueueSnapshot<T> {
    return { slots: this.memory.slice(), front: this.f, rear: this.r, capacity: this.cap };
  }
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export type Edge = readonly [number, number];

export interface BfsResult {
  /** Vertices in the order they were dequeued (visited). */
  order: number[];
  /** Hop distance from the start; -1 when unvisited. */
  level: number[];
  /** BFS-tree parent; -1 for the start and for unvisited vertices. */
  parent: number[];
}

/** Frame of a BFS. */
export interface BfsSnapshot {
  /** Waiting vertices, front first. */
  queue: number[];
  visited: boolean[];
  /** Vertex whose matrix row is being scanned. */
  current: number | null;
  level: number[];
  parent: number[];
}

export interface BfsOptions {
  /** Only vertices passing this filter may be enqueued. The start vertex is always visited. */
  allow?: (v: number) => boolean;
  /** Step cap (default 5000, 0 disables recording). */
  maxSteps?: number;
}

interface BfsState {
  visited: boolean[];
  level: number[];
  parent: number[];
  order: number[];
  queue: LinearQueue<number>;
  current: number | null;
}

const allowAll = (): boolean => true;

export class Graph {
  /** Number of vertices. */
  readonly n: number;
  private readonly adj: number[][];

  /**
   * Builds an n-vertex graph from an edge list (undirected unless `directed`).
   * @throws RangeError on a bad vertex count or an out-of-range edge endpoint.
   */
  constructor(n: number, edges: readonly Edge[] = [], options: { directed?: boolean } = {}) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`Vertex count must be a non-negative integer, got ${n}`);
    this.n = n;
    this.adj = new Array<number[]>(n);
    for (let i = 0; i < n; i++) {
      const row = new Array<number>(n);
      for (let j = 0; j < n; j++) row[j] = 0;
      this.adj[i] = row;
    }
    for (const [u, v] of edges) {
      if (!this.addEdge(u, v, options.directed === true)) throw new RangeError(`Edge (${u}, ${v}) is outside 0..${n - 1}`);
    }
  }

  /**
   * Builds the matrix from adjacency lists exactly as given: `adj[i][j] = 1`
   * for every j in `neighbors[i]`. Use {@link Graph.isSymmetric} to verify an undirected input.
   * @throws RangeError on an out-of-range neighbour.
   */
  static fromNeighbors(neighbors: readonly (readonly number[])[]): Graph {
    const g = new Graph(neighbors.length);
    for (let i = 0; i < neighbors.length; i++) {
      for (const j of neighbors[i]) {
        if (!g.addEdge(i, j, true)) throw new RangeError(`Neighbour ${j} of vertex ${i} is outside 0..${neighbors.length - 1}`);
      }
    }
    return g;
  }

  isValidVertex(v: number): boolean {
    return Number.isInteger(v) && v >= 0 && v < this.n;
  }

  /** Sets `adj[u][v]` (and `adj[v][u]` unless directed). Returns false for invalid vertices. O(1). */
  addEdge(u: number, v: number, directed = false): boolean {
    if (!this.isValidVertex(u) || !this.isValidVertex(v)) return false;
    this.adj[u][v] = 1;
    if (!directed) this.adj[v][u] = 1;
    return true;
  }

  /** Clears `adj[u][v]` (and `adj[v][u]` unless directed). Returns false for invalid vertices. O(1). */
  removeEdge(u: number, v: number, directed = false): boolean {
    if (!this.isValidVertex(u) || !this.isValidVertex(v)) return false;
    this.adj[u][v] = 0;
    if (!directed) this.adj[v][u] = 0;
    return true;
  }

  /** O(1). */
  hasEdge(u: number, v: number): boolean {
    return this.isValidVertex(u) && this.isValidVertex(v) && this.adj[u][v] !== 0;
  }

  /** Neighbours of v in ascending order, by scanning row v. O(V). */
  neighbors(v: number): number[] {
    const out: number[] = [];
    if (!this.isValidVertex(v)) return out;
    for (let j = 0; j < this.n; j++) if (this.adj[v][j] !== 0) out.push(j);
    return out;
  }

  /** Out-degree of v. O(V). */
  degree(v: number): number {
    return this.neighbors(v).length;
  }

  /** Number of unordered vertex pairs joined in at least one direction. O(V^2). */
  get edgeCount(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) if (this.adj[i][j] !== 0 || this.adj[j][i] !== 0) c++;
    }
    return c;
  }

  /** Copy of the adjacency matrix. */
  matrix(): number[][] {
    return this.adj.map((row) => row.slice());
  }

  /** True when `adj[i][j] === adj[j][i]` for all pairs. O(V^2). */
  isSymmetric(): boolean {
    for (let i = 0; i < this.n; i++) {
      for (let j = i + 1; j < this.n; j++) if (this.adj[i][j] !== this.adj[j][i]) return false;
    }
    return true;
  }

  /**
   * Breadth-first search from `start` using a {@link LinearQueue} of capacity n.
   * Steps: 'enqueue' (start / newly discovered vertex), 'dequeue', 'scan'
   * (row scan), 'skip' (already visited), 'blocked' (filtered by `allow`), 'done'.
   * An out-of-range start yields a single 'error' step. O(V^2).
   */
  bfs(start: number, options: BfsOptions = {}): Traced<BfsResult, BfsSnapshot> {
    const state = this.newState();
    const t = this.tracer(state, options.maxSteps);
    const result = (): BfsResult => ({ order: state.order, level: state.level, parent: state.parent });
    if (!this.isValidVertex(start)) {
      t.step('error', `Start vertex ${start} is outside 0..${this.n - 1}.`);
      return t.finish(result());
    }
    this.runBfs(start, options.allow ?? allowAll, state, t, null);
    return t.finish(result());
  }

  /**
   * Connected clusters of allowed vertices, found by repeated BFS that shares
   * one visited array. Largest cluster first (ties keep discovery order);
   * vertices inside a cluster are in BFS order. O(V^2).
   */
  components(allow: (v: number) => boolean = allowAll): number[][] {
    const shared = this.newState();
    const clusters: number[][] = [];
    const silent = new Tracer<BfsSnapshot>(() => this.view(shared), 0);
    for (let v = 0; v < this.n; v++) {
      if (shared.visited[v] || !allow(v)) continue;
      const state: BfsState = { ...shared, order: [], queue: new LinearQueue<number>(Math.max(1, this.n)), current: null };
      this.runBfs(v, allow, state, silent, null);
      clusters.push(state.order);
    }
    for (let i = 1; i < clusters.length; i++) {
      const key = clusters[i];
      let j = i - 1;
      while (j >= 0 && clusters[j].length < key.length) {
        clusters[j + 1] = clusters[j];
        j--;
      }
      clusters[j + 1] = key;
    }
    return clusters;
  }

  /**
   * Shortest-hop path from `start` to the nearest vertex satisfying `isTarget`
   * (start itself counts), or null. Only vertices passing `allow` may be entered. O(V^2).
   */
  nearest(start: number, isTarget: (v: number) => boolean, allow?: (v: number) => boolean): number[] | null {
    return this.nearestTraced(start, isTarget, { allow, maxSteps: 0 }).result;
  }

  /** {@link Graph.nearest} with BFS steps; stops as soon as a target is discovered. */
  nearestTraced(start: number, isTarget: (v: number) => boolean, options: BfsOptions = {}): Traced<number[] | null, BfsSnapshot> {
    const state = this.newState();
    const t = this.tracer(state, options.maxSteps);
    if (!this.isValidVertex(start)) {
      t.step('error', `Start vertex ${start} is outside 0..${this.n - 1}.`);
      return t.finish(null);
    }
    const found = this.runBfs(start, options.allow ?? allowAll, state, t, isTarget);
    if (found === -1) return t.finish(null);
    return t.finish(pathTo(state.parent, found, start));
  }

  /** See {@link pathTo}. */
  pathTo(parent: readonly number[], target: number, start?: number): number[] {
    return pathTo(parent, target, start);
  }

  /** Core BFS. Returns the first vertex satisfying `stopAt`, or -1. */
  private runBfs(
    start: number,
    allow: (v: number) => boolean,
    s: BfsState,
    t: Tracer<BfsSnapshot>,
    stopAt: ((v: number) => boolean) | null,
  ): number {
    s.visited[start] = true;
    s.level[start] = 0;
    s.parent[start] = -1;
    s.queue.enqueue(start);
    t.step('enqueue', `Mark start ${start} visited (level 0) and enqueue it.`, [start]);
    if (stopAt !== null && stopAt(start)) {
      t.step('found', `Start ${start} already satisfies the target.`, [start]);
      return start;
    }
    for (let d = s.queue.dequeue(); d.ok; d = s.queue.dequeue()) {
      const u = d.item;
      s.current = u;
      s.order.push(u);
      t.step('dequeue', `Dequeue ${u} (level ${s.level[u]}).`, [u]);
      t.step('scan', `Scan row ${u} of the adjacency matrix for unvisited neighbours.`, [u]);
      const row = this.adj[u];
      for (let v = 0; v < this.n; v++) {
        if (row[v] === 0) continue;
        if (s.visited[v]) {
          if (t.recording) t.step('skip', `adj[${u}][${v}] = 1 but ${v} is already visited.`, [u, v]);
          continue;
        }
        if (!allow(v)) {
          if (t.recording) t.step('blocked', `adj[${u}][${v}] = 1 but ${v} is excluded by the filter.`, [u, v]);
          continue;
        }
        s.visited[v] = true;
        s.level[v] = s.level[u] + 1;
        s.parent[v] = u;
        s.queue.enqueue(v);
        if (t.recording) t.step('enqueue', `adj[${u}][${v}] = 1 and ${v} is unvisited: mark it, level ${s.level[v]}, parent ${u}, enqueue.`, [u, v]);
        if (stopAt !== null && stopAt(v)) {
          t.step('found', `${v} satisfies the target at ${s.level[v]} hop(s) from ${start}.`, [v]);
          return v;
        }
      }
    }
    s.current = null;
    t.step(stopAt === null ? 'done' : 'not-found', stopAt === null
      ? `Queue empty: BFS visited ${s.order.length} vertex(es).`
      : `Queue empty: no reachable vertex satisfies the target.`);
    return -1;
  }

  private newState(): BfsState {
    const visited = new Array<boolean>(this.n);
    const level = new Array<number>(this.n);
    const parent = new Array<number>(this.n);
    for (let i = 0; i < this.n; i++) {
      visited[i] = false;
      level[i] = -1;
      parent[i] = -1;
    }
    return { visited, level, parent, order: [], queue: new LinearQueue<number>(Math.max(1, this.n)), current: null };
  }

  private view(s: BfsState): BfsSnapshot {
    return { queue: s.queue.toArray(), visited: s.visited.slice(), current: s.current, level: s.level.slice(), parent: s.parent.slice() };
  }

  private tracer(s: BfsState, maxSteps: number | undefined): Tracer<BfsSnapshot> {
    return new Tracer(() => this.view(s), maxSteps ?? DEFAULT_MAX_STEPS);
  }
}

/**
 * Follows parent pointers from `target` back to the root and returns the path
 * root-first. Returns [] for an out-of-range target, a parent cycle, or when
 * `start` is given and the path does not begin there (target unreachable).
 */
export function pathTo(parent: readonly number[], target: number, start?: number): number[] {
  if (!Number.isInteger(target) || target < 0 || target >= parent.length) return [];
  const reversed: number[] = [];
  let cur = target;
  let hops = 0;
  while (cur !== -1 && hops <= parent.length) {
    if (!Number.isInteger(cur) || cur < 0 || cur >= parent.length) return [];
    reversed.push(cur);
    cur = parent[cur];
    hops++;
  }
  if (cur !== -1) return [];
  const path: number[] = [];
  for (let i = reversed.length - 1; i >= 0; i--) path.push(reversed[i]);
  if (start !== undefined && path[0] !== start) return [];
  return path;
}
