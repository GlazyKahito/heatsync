import { describe, expect, it } from 'vitest';
import { StaticArray } from '../static-array';

interface Station {
  code: string;
  name: string;
}

const st = (code: string, name: string): Station => ({ code, name });

describe('StaticArray', () => {
  it('rejects a non-positive or fractional capacity', () => {
    expect(() => new StaticArray<number>(0)).toThrow(RangeError);
    expect(() => new StaticArray<number>(2.5)).toThrow(RangeError);
  });

  it('starts empty with all slots null', () => {
    const a = new StaticArray<number>(3);
    expect(a.size).toBe(0);
    expect(a.capacity).toBe(3);
    expect(a.isEmpty()).toBe(true);
    expect(a.snapshot()).toEqual({ slots: [null, null, null], size: 0, capacity: 3 });
  });

  it('inserts at the end with check and insert steps', () => {
    const a = new StaticArray<number>(3);
    const r = a.insertLast(10);
    expect(r.result).toEqual({ ok: true, index: 0 });
    expect(r.steps.map((s) => s.kind)).toEqual(['check', 'insert']);
    expect(r.steps[1].focus).toEqual([0]);
    expect(r.steps[1].snapshot).toEqual({ slots: [10, null, null], size: 1, capacity: 3 });
    a.insertLast(20);
    expect(a.display()).toEqual([10, 20]);
    expect(a.get(1)).toBe(20);
    expect(a.get(2)).toBeNull();
    expect(a.get(-1)).toBeNull();
  });

  it('reports overflow without throwing', () => {
    const a = new StaticArray<number>(2);
    a.insertLast(1);
    a.insertLast(2);
    expect(a.isFull()).toBe(true);
    const r = a.insertLast(3);
    expect(r.result).toEqual({ ok: false, reason: 'overflow' });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].kind).toBe('error');
    expect(r.steps[0].message).toMatch(/Overflow/);
    expect(a.display()).toEqual([1, 2]);
  });

  it('deletes from the end and reports underflow', () => {
    const a = new StaticArray<number>(3);
    const empty = a.deleteLast();
    expect(empty.result).toEqual({ ok: false, reason: 'underflow' });
    expect(empty.steps[0].kind).toBe('error');
    a.insertLast(1);
    a.insertLast(2);
    const r = a.deleteLast();
    expect(r.result).toEqual({ ok: true, index: 1, item: 2 });
    expect(r.steps.map((s) => s.kind)).toEqual(['check', 'delete']);
    expect(r.steps[1].snapshot.slots).toEqual([1, null, null]);
    expect(a.size).toBe(1);
    a.deleteLast();
    expect(a.deleteLast().result.ok).toBe(false);
  });

  it('linear search counts comparisons and steps each slot', () => {
    const a = new StaticArray<Station>(36, { describe: (s) => s.name });
    a.insertLast(st('MUM', 'Mumbai'));
    a.insertLast(st('THN', 'Thane'));
    a.insertLast(st('PUN', 'Pune'));
    const r = a.search((s) => s.code === 'PUN', 'code = PUN');
    expect(r.result).toEqual({ found: true, index: 2, item: st('PUN', 'Pune'), comparisons: 3 });
    expect(r.steps.map((s) => s.kind)).toEqual(['compare', 'compare', 'found']);
    expect(r.steps.map((s) => s.focus)).toEqual([[0], [1], [2]]);
    expect(r.steps[0].message).toContain('Mumbai');
    expect(r.steps[2].message).toContain('code = PUN');
  });

  it('linear search reports not found after scanning everything', () => {
    const a = new StaticArray<number>(5);
    [4, 8, 15].forEach((x) => a.insertLast(x));
    const r = a.search((x) => x === 16);
    expect(r.result).toEqual({ found: false, index: -1, item: null, comparisons: 3 });
    expect(r.steps.at(-1)?.kind).toBe('not-found');
    const e = new StaticArray<number>(2).search(() => true);
    expect(e.result.comparisons).toBe(0);
    expect(e.steps).toHaveLength(1);
  });

  it('keeps earlier snapshots unchanged after later mutations', () => {
    const a = new StaticArray<Station>(3);
    const item = st('NAG', 'Nagpur');
    const r = a.insertLast(item);
    item.name = 'changed';
    a.insertLast(st('AKL', 'Akola'));
    expect(r.steps[1].snapshot.slots[0]).toEqual(st('NAG', 'Nagpur'));
    expect(r.steps[1].snapshot.slots[1]).toBeNull();
    expect(r.steps[1].snapshot.size).toBe(1);
  });

  it('records no steps when maxSteps is 0', () => {
    const a = new StaticArray<number>(2, { maxSteps: 0 });
    expect(a.insertLast(1).steps).toHaveLength(0);
    a.maxSteps = 10;
    expect(a.insertLast(2).steps).toHaveLength(2);
  });
});
