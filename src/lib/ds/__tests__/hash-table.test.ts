import { describe, expect, it } from 'vitest';
import { HashTable, normalizeKey, polyHash } from '../hash-table';

// With capacity 7: 'a' = 97, 'h' = 104, 'o' = 111, 'v' = 118 all hash to 6,
// so they collide and their probe chain wraps around to slots 0, 1, 2.

describe('hashing helpers', () => {
  it('normalizes keys', () => {
    expect(normalizeKey('  Navi   Mumbai \t')).toBe('navi mumbai');
    expect(normalizeKey('PUNE')).toBe('pune');
  });

  it('computes the polynomial rolling hash', () => {
    expect(polyHash('a', 7)).toBe(6);
    expect(polyHash('h', 7)).toBe(6);
    expect(polyHash('ab', 53)).toBe(31);
    expect(polyHash('', 53)).toBe(0);
    const t = new HashTable<number>();
    expect(t.capacity).toBe(53);
    expect(t.hash('  AB ')).toBe(31);
  });
});

describe('HashTable', () => {
  it('rejects a bad capacity', () => {
    expect(() => new HashTable<number>(0)).toThrow(RangeError);
  });

  it('inserts at the home slot and finds the key again', () => {
    const t = new HashTable<number>(7);
    const r = t.insert('a', 1);
    expect(r.result).toEqual({ ok: true, action: 'inserted', slot: 6, probes: 1 });
    expect(r.steps.map((s) => s.kind)).toEqual(['hash', 'probe', 'insert']);
    expect(r.steps[1].snapshot.probe).toEqual({ slot: 6, attempt: 0, state: 'empty' });
    expect(r.steps[2].snapshot.probe).toBeNull();
    expect(r.steps[2].snapshot.slots[6]).toEqual({ state: 'occupied', key: 'a', value: 1 });
    const s = t.search('A');
    expect(s.result).toEqual({ found: true, slot: 6, value: 1, probes: 1 });
    expect(s.steps.map((x) => x.kind)).toEqual(['hash', 'found']);
  });

  it('resolves collisions by linear probing with wrap-around', () => {
    const t = new HashTable<number>(7);
    t.insert('a', 1);
    const h = t.insert('h', 2);
    expect(h.result).toEqual({ ok: true, action: 'inserted', slot: 0, probes: 2 });
    expect(h.steps.map((s) => s.kind)).toEqual(['hash', 'probe', 'probe', 'insert']);
    expect(h.steps[1].snapshot.probe).toEqual({ slot: 6, attempt: 0, state: 'occupied', key: 'a' });
    expect(h.steps[1].focus).toEqual([6]);
    const o = t.insert('o', 3);
    expect(o.result).toMatchObject({ slot: 1, probes: 3 });
    const s = t.search('o');
    expect(s.result).toEqual({ found: true, slot: 1, value: 3, probes: 3 });
    expect(s.steps.map((x) => x.snapshot.probe?.slot)).toEqual([undefined, 6, 0, 1]);
  });

  it('updates an existing key instead of inserting a duplicate', () => {
    const t = new HashTable<string>(7);
    t.insert('Pune', 'old');
    const r = t.insert('  pune ', 'new');
    expect(r.result).toEqual({ ok: true, action: 'updated', slot: t.hash('pune'), probes: 1 });
    expect(r.steps.at(-1)?.kind).toBe('update');
    expect(t.size).toBe(1);
    expect(t.get('PUNE')).toBe('new');
  });

  it('delete leaves a tombstone that search probes past', () => {
    const t = new HashTable<number>(7);
    t.insert('a', 1);
    t.insert('h', 2);
    t.insert('o', 3);
    const d = t.delete('h');
    expect(d.result).toEqual({ ok: true, slot: 0, value: 2, probes: 2 });
    expect(d.steps.at(-1)?.kind).toBe('delete');
    expect(d.steps.at(-1)?.snapshot.slots[0]).toEqual({ state: 'deleted' });
    expect(t.size).toBe(2);
    expect(t.tombstones).toBe(1);
    const s = t.search('o');
    expect(s.result.found).toBe(true);
    expect(s.steps.map((x) => x.snapshot.probe?.state)).toEqual([undefined, 'occupied', 'deleted', 'occupied']);
    expect(t.search('h').result.found).toBe(false);
    expect(t.delete('h').result).toEqual({ ok: false, reason: 'not-found', probes: 4 });
  });

  it('insert reuses the first tombstone on its probe path', () => {
    const t = new HashTable<number>(7);
    t.insert('a', 1);
    t.insert('h', 2);
    t.insert('o', 3);
    t.delete('h');
    const r = t.insert('v', 4);
    expect(r.result).toEqual({ ok: true, action: 'inserted', slot: 0, probes: 4 });
    expect(r.steps.at(-1)?.message).toMatch(/tombstone/);
    expect(t.tombstones).toBe(0);
    expect(t.entries().map((e) => [e.slot, e.key])).toEqual([
      [0, 'v'],
      [1, 'o'],
      [6, 'a'],
    ]);
  });

  it('a key beyond a tombstone is updated, not duplicated into the tombstone', () => {
    const t = new HashTable<number>(7);
    t.insert('a', 1);
    t.insert('h', 2);
    t.delete('a');
    const r = t.insert('h', 20);
    expect(r.result).toEqual({ ok: true, action: 'updated', slot: 0, probes: 2 });
    expect(t.size).toBe(1);
    expect(t.tombstones).toBe(1);
  });

  it('reports a full table after a full probe cycle', () => {
    const t = new HashTable<number>(3);
    expect(t.insert('a', 1).result.ok).toBe(true);
    expect(t.insert('b', 2).result.ok).toBe(true);
    expect(t.insert('c', 3).result.ok).toBe(true);
    expect(t.loadFactor).toBe(1);
    const r = t.insert('d', 4);
    expect(r.result).toEqual({ ok: false, reason: 'full', probes: 3 });
    expect(r.steps.at(-1)?.kind).toBe('error');
    expect(r.steps.filter((s) => s.kind === 'probe')).toHaveLength(3);
    const miss = t.search('zz');
    expect(miss.result).toEqual({ found: false, slot: -1, probes: 3 });
    expect(miss.steps.at(-1)?.kind).toBe('not-found');
  });

  it('a full table with a tombstone reuses it after the full cycle', () => {
    const t = new HashTable<number>(3);
    t.insert('a', 1);
    t.insert('b', 2);
    t.insert('c', 3);
    t.delete('b');
    const r = t.insert('d', 4);
    expect(r.result).toEqual({ ok: true, action: 'inserted', slot: 2, probes: 3 });
    expect(t.get('d')).toBe(4);
    expect(t.size).toBe(3);
    expect(t.tombstones).toBe(0);
  });

  it('rejects empty keys', () => {
    const t = new HashTable<number>(5);
    expect(t.insert('   ', 1).result).toEqual({ ok: false, reason: 'empty-key', probes: 0 });
    expect(t.delete('').result).toEqual({ ok: false, reason: 'empty-key', probes: 0 });
    expect(t.search(' ').result.found).toBe(false);
    expect(t.has('')).toBe(false);
  });

  it('has / get / loadFactor / snapshot', () => {
    const t = new HashTable<{ id: number }>(11);
    t.insert('Nagpur', { id: 3 });
    t.insert('440001', { id: 3 });
    expect(t.has('nagpur')).toBe(true);
    expect(t.get('440001')).toEqual({ id: 3 });
    expect(t.get('akola')).toBeUndefined();
    expect(t.loadFactor).toBeCloseTo(2 / 11);
    const snap = t.snapshot();
    expect(snap.slots).toHaveLength(11);
    expect(snap.slots.filter((s) => s.state === 'occupied')).toHaveLength(2);
    expect(snap.probe).toBeNull();
  });

  it('step snapshots are deep copies', () => {
    const t = new HashTable<{ id: number }>(7);
    const v = { id: 1 };
    const r = t.insert('x', v);
    v.id = 99;
    t.insert('y', { id: 2 });
    const slot = r.result.ok ? r.result.slot : -1;
    expect(r.steps.at(-1)?.snapshot.slots[slot].value).toEqual({ id: 1 });
  });
});
