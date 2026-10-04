import { describe, expect, it } from 'vitest';
import districts from '@/data/districts.json';
import { BST, Graph, HashTable, StaticArray, compareNumbers } from '@/lib/ds';

describe('Maharashtra districts dataset', () => {
  it('has 36 districts with ids matching their index', () => {
    expect(districts).toHaveLength(36);
    districts.forEach((d, i) => expect(d.id).toBe(i));
  });

  it('forms a symmetric adjacency matrix', () => {
    const g = Graph.fromNeighbors(districts.map((d) => d.neighbors));
    expect(g.n).toBe(36);
    expect(g.isSymmetric()).toBe(true);
    for (let i = 0; i < 36; i++) expect(g.hasEdge(i, i)).toBe(false);
  });

  it('BFS from Nagpur reaches all 36 districts', () => {
    const g = Graph.fromNeighbors(districts.map((d) => d.neighbors));
    const nagpur = districts.findIndex((d) => d.name === 'Nagpur');
    expect(nagpur).toBeGreaterThanOrEqual(0);
    const r = g.bfs(nagpur);
    expect(r.result.order).toHaveLength(36);
    expect(new Set(r.result.order).size).toBe(36);
    expect(r.result.level.every((l) => l >= 0)).toBe(true);
    expect(r.truncated).toBeUndefined();
    expect(g.components()).toHaveLength(1);
    const mumbai = districts.findIndex((d) => d.name === 'Mumbai City');
    const path = g.nearest(nagpur, (v) => v === mumbai);
    expect(path?.[0]).toBe(nagpur);
    expect(path?.at(-1)).toBe(mumbai);
    expect(path?.length).toBe(r.result.level[mumbai] + 1);
  });

  it('every name, alias and HQ PIN resolves through the hash table', () => {
    const table = new HashTable<number>(211, { maxSteps: 0 });
    for (const d of districts) {
      for (const key of [d.name, ...d.aliases, d.hqPin]) {
        const r = table.insert(key, d.id);
        expect(r.result.ok).toBe(true);
      }
    }
    for (const d of districts) {
      expect(table.get(d.name.toUpperCase())).toBe(d.id);
      expect(table.get(d.hqPin)).toBe(d.id);
      for (const alias of d.aliases) expect(table.get(` ${alias} `)).toBe(d.id);
    }
    expect(table.loadFactor).toBeLessThan(0.7);
  });

  it('the station registry holds exactly 36 stations', () => {
    const registry = new StaticArray<{ id: number; name: string }>(36);
    for (const d of districts) expect(registry.insertLast({ id: d.id, name: d.name }).result.ok).toBe(true);
    expect(registry.insertLast({ id: 99, name: 'Extra' }).result).toEqual({ ok: false, reason: 'overflow' });
    expect(registry.search((s) => s.name === 'Pune').result.found).toBe(true);
  });

  it('the hotspot index ranks districts by area as a stand-in score', () => {
    const index = new BST<number, string>(compareNumbers, { maxSteps: 0 });
    for (const d of districts) index.insert(d.areaKm2 * 100 + d.id, d.name);
    const ranking = index.reverseInorder().result;
    expect(ranking).toHaveLength(36);
    for (let i = 1; i < ranking.length; i++) expect(ranking[i - 1].key).toBeGreaterThan(ranking[i].key);
  });
});
