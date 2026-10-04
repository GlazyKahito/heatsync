import { describe, expect, it } from 'vitest';
import { CircularQueue, stats, statsTraced } from '../circular-queue';

describe('CircularQueue (counter method)', () => {
  it('rejects a bad capacity', () => {
    expect(() => new CircularQueue<number>(0)).toThrow(RangeError);
  });

  it('starts with front 0, rear -1, count 0', () => {
    const q = new CircularQueue<number>(4);
    expect([q.front, q.rear, q.count, q.capacity]).toEqual([0, -1, 0, 4]);
    expect(q.isEmpty()).toBe(true);
    expect(q.isFull()).toBe(false);
    expect(q.peek()).toBeUndefined();
  });

  it('enqueues with advance and enqueue steps', () => {
    const q = new CircularQueue<number>(4);
    const r = q.enqueue(10);
    expect(r.result).toEqual({ ok: true, index: 0 });
    expect(r.steps.map((s) => s.kind)).toEqual(['advance', 'enqueue']);
    expect(r.steps[0].snapshot).toEqual({ slots: [null, null, null, null], front: 0, rear: 0, count: 0, capacity: 4 });
    expect(r.steps[1].snapshot).toEqual({ slots: [10, null, null, null], front: 0, rear: 0, count: 1, capacity: 4 });
    expect(q.peek()).toBe(10);
  });

  it('reports overflow when count equals capacity', () => {
    const q = new CircularQueue<number>(3);
    [1, 2, 3].forEach((x) => q.enqueue(x));
    expect(q.isFull()).toBe(true);
    const r = q.enqueue(4);
    expect(r.result).toEqual({ ok: false, reason: 'overflow' });
    expect(r.steps.map((s) => s.kind)).toEqual(['error']);
    expect(q.toArray()).toEqual([1, 2, 3]);
  });

  it('dequeues in FIFO order and reports underflow', () => {
    const q = new CircularQueue<string>(3);
    q.enqueue('a');
    q.enqueue('b');
    const r = q.dequeue();
    expect(r.result).toEqual({ ok: true, index: 0, item: 'a' });
    expect(r.steps.map((s) => s.kind)).toEqual(['read', 'dequeue']);
    expect(r.steps[1].snapshot.slots).toEqual([null, 'b', null]);
    expect(r.steps[1].snapshot.front).toBe(1);
    expect(q.dequeue().result).toEqual({ ok: true, index: 1, item: 'b' });
    const e = q.dequeue();
    expect(e.result).toEqual({ ok: false, reason: 'underflow' });
    expect(e.steps[0].kind).toBe('error');
  });

  it('wraps rear and front around the end of the array', () => {
    const q = new CircularQueue<number>(4);
    [1, 2, 3, 4].forEach((x) => q.enqueue(x));
    q.dequeue();
    q.dequeue();
    const r5 = q.enqueue(5);
    expect(r5.result).toEqual({ ok: true, index: 0 });
    expect(r5.steps[0].message).toContain('(3 + 1) % 4 = 0');
    q.enqueue(6);
    expect([q.front, q.rear, q.count]).toEqual([2, 1, 4]);
    expect(q.snapshot().slots).toEqual([5, 6, 3, 4]);
    expect(q.toArray()).toEqual([3, 4, 5, 6]);
    expect(q.at(0)).toBe(3);
    expect(q.at(3)).toBe(6);
    expect(q.at(4)).toBeUndefined();
    expect(q.slotAt(1)).toBe(6);
    expect(q.slotAt(9)).toBeNull();
    q.dequeue();
    q.dequeue();
    q.dequeue();
    expect(q.front).toBe(1);
    expect(q.toArray()).toEqual([6]);
  });

  it('push overwrites the oldest item when full', () => {
    const q = new CircularQueue<number>(3);
    const first = q.push(1);
    expect(first.result).toEqual({ index: 0, evicted: false });
    q.push(2);
    q.push(3);
    const r = q.push(4);
    expect(r.result).toEqual({ index: 0, evicted: true, evictedItem: 1 });
    expect(r.steps.map((s) => s.kind)).toEqual(['full', 'read', 'dequeue', 'advance', 'enqueue']);
    expect(q.toArray()).toEqual([2, 3, 4]);
    expect([q.front, q.rear, q.count]).toEqual([1, 0, 3]);
  });

  it('keeps a rolling 24-hour window', () => {
    const q = new CircularQueue<number>(24);
    for (let h = 0; h < 30; h++) q.push(30 + h);
    expect(q.count).toBe(24);
    expect(q.toArray()[0]).toBe(36);
    expect(stats(q, (x) => x)).toEqual({ min: 36, max: 59, mean: 47.5, count: 24 });
  });

  it('stats walks from front, skips non-finite values and handles empty', () => {
    const q = new CircularQueue<{ t: number }>(4);
    [{ t: 40 }, { t: NaN }, { t: 42 }, { t: 38 }].forEach((x) => q.enqueue(x));
    q.dequeue();
    q.enqueue({ t: 45 });
    expect(stats(q, (x) => x.t)).toEqual({ min: 38, max: 45, mean: 125 / 3, count: 3 });
    const e = stats(new CircularQueue<number>(2), (x) => x);
    expect(e.count).toBe(0);
    expect(Number.isNaN(e.max)).toBe(true);
  });

  it('statsTraced records one step per slot with circular cursor', () => {
    const q = new CircularQueue<number>(3);
    [1, 2, 3].forEach((x) => q.enqueue(x));
    q.dequeue();
    q.enqueue(9);
    const r = statsTraced(q, (x) => x);
    expect(r.result).toEqual({ min: 2, max: 9, mean: 14 / 3, count: 3 });
    expect(r.steps.map((s) => s.focus)).toEqual([[1], [2], [0], undefined]);
    expect(r.steps[2].snapshot.max).toBe(9);
    expect(r.steps.at(-1)?.kind).toBe('done');
  });

  it('snapshots are deep copies', () => {
    const q = new CircularQueue<{ t: number }>(2);
    const item = { t: 1 };
    const r = q.enqueue(item);
    item.t = 2;
    expect(r.steps[1].snapshot.slots[0]).toEqual({ t: 1 });
  });
});
