import { describe, expect, it } from 'vitest';
import { Graph, LinearQueue, pathTo, type Edge } from '../graph';

describe('LinearQueue', () => {
  it('starts with front = rear = -1', () => {
    const q = new LinearQueue<number>(3);
    expect([q.front, q.rear, q.capacity, q.size]).toEqual([-1, -1, 3, 0]);
    expect(q.isEmpty()).toBe(true);
    expect(q.peek()).toBeUndefined();
    expect(() => new LinearQueue(0)).toThrow(RangeError);
  });

  it('overflows when rear reaches capacity - 1', () => {
    const q = new LinearQueue<number>(3);
    expect(q.enqueue(1)).toEqual({ ok: true, index: 0 });
    q.enqueue(2);
    q.enqueue(3);
    expect(q.isFull()).toBe(true);
    expect(q.enqueue(4)).toEqual({ ok: false, reason: 'overflow' });
    expect(q.toArray()).toEqual([1, 2, 3]);
  });

  it('dequeues FIFO and underflows when front passes rear', () => {
    const q = new LinearQueue<string>(2);
    expect(q.dequeue()).toEqual({ ok: false, reason: 'underflow' });
    q.enqueue('a');
    q.enqueue('b');
    expect(q.dequeue()).toEqual({ ok: true, index: 0, item: 'a' });
    expect(q.peek()).toBe('b');
    expect(q.size).toBe(1);
    expect(q.dequeue()).toEqual({ ok: true, index: 1, item: 'b' });
    expect(q.isEmpty()).toBe(true);
    expect(q.dequeue()).toEqual({ ok: false, reason: 'underflow' });
  });

  it('does not reuse freed slots (classic linear queue limitation)', () => {
    const q = new LinearQueue<number>(2);
    q.enqueue(1);
    q.enqueue(2);
    q.dequeue();
    q.dequeue();
    expect(q.isEmpty()).toBe(true);
    expect(q.isFull()).toBe(true);
    expect(q.enqueue(3).ok).toBe(false);
    expect(q.snapshot()).toEqual({ slots: [1, 2], front: 2, rear: 1, capacity: 2 });
  });
});

//  0 - 1 - 2      5 - 6
//  |   |
//  3 - 4          7 (isolated)
const EDGES: Edge[] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [3, 4],
  [5, 6],
];

describe('Graph construction', () => {
  it('builds a symmetric adjacency matrix from edges', () => {
    const g = new Graph(8, EDGES);
    expect(g.n).toBe(8);
    expect(g.isSymmetric()).toBe(true);
    expect(g.hasEdge(0, 1) && g.hasEdge(1, 0)).toBe(true);
    expect(g.hasEdge(0, 2)).toBe(false);
    expect(g.neighbors(1)).toEqual([0, 2, 4]);
    expect(g.degree(7)).toBe(0);
    expect(g.edgeCount).toBe(6);
    const m = g.matrix();
    m[0][1] = 0;
    expect(g.hasEdge(0, 1)).toBe(true);
  });

  it('validates vertices', () => {
    expect(() => new Graph(3, [[0, 3]])).toThrow(RangeError);
    expect(() => new Graph(-1)).toThrow(RangeError);
    const g = new Graph(3);
    expect(g.addEdge(0, 5)).toBe(false);
    expect(g.hasEdge(-1, 0)).toBe(false);
    expect(g.neighbors(9)).toEqual([]);
    expect(g.addEdge(0, 2)).toBe(true);
    expect(g.removeEdge(0, 2)).toBe(true);
    expect(g.hasEdge(2, 0)).toBe(false);
  });

  it('supports directed edges', () => {
    const g = new Graph(2, [[0, 1]], { directed: true });
    expect(g.hasEdge(0, 1)).toBe(true);
    expect(g.hasEdge(1, 0)).toBe(false);
    expect(g.isSymmetric()).toBe(false);
  });

  it('fromNeighbors keeps the lists exactly and detects asymmetry', () => {
    const sym = Graph.fromNeighbors([[1], [0, 2], [1]]);
    expect(sym.isSymmetric()).toBe(true);
    expect(sym.neighbors(1)).toEqual([0, 2]);
    const asym = Graph.fromNeighbors([[1], [], []]);
    expect(asym.isSymmetric()).toBe(false);
    expect(() => Graph.fromNeighbors([[4]])).toThrow(RangeError);
  });
});

describe('Graph.bfs', () => {
  it('visits in BFS order with levels and parents', () => {
    const g = new Graph(8, EDGES);
    const r = g.bfs(0);
    expect(r.result.order).toEqual([0, 1, 3, 2, 4]);
    expect(r.result.level).toEqual([0, 1, 2, 1, 2, -1, -1, -1]);
    expect(r.result.parent).toEqual([-1, 0, 1, 0, 1, -1, -1, -1]);
  });

  it('records dequeue, scan, enqueue and skip steps with snapshots', () => {
    const g = new Graph(8, EDGES);
    const r = g.bfs(0);
    const kinds = r.steps.map((s) => s.kind);
    expect(kinds[0]).toBe('enqueue');
    expect(kinds.slice(1, 3)).toEqual(['dequeue', 'scan']);
    expect(kinds).toContain('skip');
    expect(kinds.at(-1)).toBe('done');
    expect(kinds.filter((k) => k === 'dequeue')).toHaveLength(5);
    expect(kinds.filter((k) => k === 'enqueue')).toHaveLength(5);
    const firstEnqueue = r.steps[3];
    expect(firstEnqueue.focus).toEqual([0, 1]);
    expect(firstEnqueue.snapshot.queue).toEqual([1]);
    expect(firstEnqueue.snapshot.current).toBe(0);
    expect(firstEnqueue.snapshot.visited.slice(0, 2)).toEqual([true, true]);
    expect(firstEnqueue.snapshot.level[1]).toBe(1);
    expect(r.steps.at(-1)?.snapshot.current).toBeNull();
    expect(r.steps.at(-1)?.snapshot.queue).toEqual([]);
  });

  it('leaves a disconnected part unvisited', () => {
    const g = new Graph(8, EDGES);
    const r = g.bfs(5);
    expect(r.result.order).toEqual([5, 6]);
    expect(r.result.level.filter((l) => l === -1)).toHaveLength(6);
    expect(g.bfs(7).result.order).toEqual([7]);
  });

  it('respects the allow filter with blocked steps', () => {
    const g = new Graph(8, EDGES);
    const r = g.bfs(0, { allow: (v) => v !== 1 });
    expect(r.result.order).toEqual([0, 3, 4]);
    expect(r.steps.some((s) => s.kind === 'blocked')).toBe(true);
    expect(r.result.level[2]).toBe(-1);
  });

  it('reports an out-of-range start', () => {
    const g = new Graph(3);
    for (const bad of [-1, 3, 1.5]) {
      const r = g.bfs(bad);
      expect(r.result.order).toEqual([]);
      expect(r.steps).toHaveLength(1);
      expect(r.steps[0].kind).toBe('error');
    }
  });

  it('honours maxSteps', () => {
    const g = new Graph(8, EDGES);
    expect(g.bfs(0, { maxSteps: 0 }).steps).toHaveLength(0);
    const capped = g.bfs(0, { maxSteps: 4 });
    expect(capped.steps).toHaveLength(4);
    expect(capped.truncated).toBe(true);
    expect(capped.result.order).toEqual([0, 1, 3, 2, 4]);
  });
});

describe('Graph.components / nearest / pathTo', () => {
  it('finds clusters largest first', () => {
    const g = new Graph(8, EDGES);
    expect(g.components()).toEqual([[0, 1, 3, 2, 4], [5, 6], [7]]);
  });

  it('finds clusters among allowed vertices only', () => {
    const g = new Graph(8, EDGES);
    const hot = new Set([0, 3, 2, 5, 6, 7]);
    expect(g.components((v) => hot.has(v))).toEqual([
      [0, 3],
      [5, 6],
      [2],
      [7],
    ]);
    expect(g.components(() => false)).toEqual([]);
  });

  it('nearest returns the shortest-hop path to a target', () => {
    const g = new Graph(8, EDGES);
    expect(g.nearest(0, (v) => v === 4)).toEqual([0, 1, 4]);
    expect(g.nearest(2, (v) => v === 3)).toEqual([2, 1, 0, 3]);
    expect(g.nearest(3, (v) => v === 3)).toEqual([3]);
    expect(g.nearest(0, (v) => v === 2 || v === 4)).toEqual([0, 1, 2]);
  });

  it('nearest returns null when no target is reachable or start is invalid', () => {
    const g = new Graph(8, EDGES);
    expect(g.nearest(0, (v) => v === 6)).toBeNull();
    expect(g.nearest(0, (v) => v === 4, (v) => v !== 1 && v !== 3)).toBeNull();
    expect(g.nearest(0, (v) => v === 4, (v) => v !== 1)).toEqual([0, 3, 4]);
    expect(g.nearest(42, () => true)).toBeNull();
  });

  it('nearestTraced stops at the first discovered target', () => {
    const g = new Graph(8, EDGES);
    const r = g.nearestTraced(0, (v) => v === 1);
    expect(r.result).toEqual([0, 1]);
    expect(r.steps.at(-1)?.kind).toBe('found');
    expect(r.steps.filter((s) => s.kind === 'dequeue')).toHaveLength(1);
    const miss = g.nearestTraced(5, (v) => v === 0);
    expect(miss.result).toBeNull();
    expect(miss.steps.at(-1)?.kind).toBe('not-found');
    expect(g.nearestTraced(-3, () => true).steps[0].kind).toBe('error');
  });

  it('pathTo follows parent pointers', () => {
    const g = new Graph(8, EDGES);
    const { parent } = g.bfs(0).result;
    expect(pathTo(parent, 4)).toEqual([0, 1, 4]);
    expect(g.pathTo(parent, 0)).toEqual([0]);
    expect(pathTo(parent, 6, 0)).toEqual([]);
    expect(pathTo(parent, 6)).toEqual([6]);
    expect(pathTo(parent, 99)).toEqual([]);
    expect(pathTo([1, 0], 0)).toEqual([]);
    expect(pathTo([5], 0)).toEqual([]);
  });
});
