import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_STEPS, Tracer, compareNumbers, compareStrings, deepClone, describeValue } from '../trace';

describe('deepClone', () => {
  it('copies nested arrays and objects independently', () => {
    const src = { a: [1, { b: 2 }], c: { d: 'x' } };
    const copy = deepClone(src);
    expect(copy).toEqual(src);
    (src.a[1] as { b: number }).b = 99;
    src.c.d = 'y';
    expect(copy).toEqual({ a: [1, { b: 2 }], c: { d: 'x' } });
  });

  it('copies Date, Map and Set and keeps primitives', () => {
    const date = new Date(2024, 4, 1);
    const src = { date, map: new Map([['k', { v: 1 }]]), set: new Set([1, 2]) };
    const copy = deepClone(src);
    expect(copy.date).not.toBe(date);
    expect(copy.date.getTime()).toBe(date.getTime());
    expect(copy.map.get('k')).toEqual({ v: 1 });
    expect(copy.map.get('k')).not.toBe(src.map.get('k'));
    expect([...copy.set]).toEqual([1, 2]);
    expect(deepClone(5)).toBe(5);
    expect(deepClone(null)).toBeNull();
    expect(deepClone('s')).toBe('s');
  });
});

describe('Tracer', () => {
  it('records steps with snapshots and focus', () => {
    let n = 0;
    const t = new Tracer(() => ({ n }));
    t.step('a', 'first', [1, 'x']);
    n = 5;
    t.step('b', 'second');
    const out = t.finish('done');
    expect(out.result).toBe('done');
    expect(out.steps.map((s) => s.kind)).toEqual(['a', 'b']);
    expect(out.steps[0].snapshot).toEqual({ n: 0 });
    expect(out.steps[0].focus).toEqual([1, 'x']);
    expect(out.steps[1].focus).toBeUndefined();
    expect(out.truncated).toBeUndefined();
  });

  it('caps steps at maxSteps and marks the trace truncated', () => {
    const t = new Tracer(() => 0, 3);
    for (let i = 0; i < 10; i++) t.step('s', `step ${i}`);
    const out = t.finish(null);
    expect(out.steps).toHaveLength(3);
    expect(out.steps[2].kind).toBe('truncated');
    expect(out.truncated).toBe(true);
    expect(t.recording).toBe(false);
  });

  it('records exactly maxSteps steps without truncating', () => {
    const t = new Tracer(() => 0, 2);
    t.step('a', 'a');
    t.step('b', 'b');
    expect(t.finish(1).truncated).toBeUndefined();
  });

  it('records nothing and never snapshots when maxSteps is 0', () => {
    let calls = 0;
    const t = new Tracer(() => ++calls, 0);
    t.step('a', 'a');
    expect(t.steps).toHaveLength(0);
    expect(calls).toBe(0);
    expect(t.recording).toBe(false);
  });

  it('uses the 5000 default', () => {
    expect(DEFAULT_MAX_STEPS).toBe(5000);
    const t = new Tracer(() => 0);
    for (let i = 0; i < 6000; i++) t.step('s', 's');
    expect(t.steps).toHaveLength(5000);
    expect(t.truncated).toBe(true);
  });
});

describe('helpers', () => {
  it('describeValue labels primitives and objects', () => {
    expect(describeValue(41.5)).toBe('41.5');
    expect(describeValue('Pune')).toBe('Pune');
    expect(describeValue(null)).toBe('null');
    expect(describeValue({ name: 'Nagpur', id: 3 })).toBe('Nagpur');
    expect(describeValue({ id: 7 })).toBe('7');
    expect(describeValue([1, 2])).toBe('[1,2]');
    expect(describeValue({ long: 'x'.repeat(100) }).endsWith('...')).toBe(true);
  });

  it('comparators order ascending', () => {
    expect(compareNumbers(1, 2)).toBeLessThan(0);
    expect(compareNumbers(2, 1)).toBeGreaterThan(0);
    expect(compareNumbers(2, 2)).toBe(0);
    expect(compareStrings('a', 'b')).toBeLessThan(0);
    expect(compareStrings('b', 'a')).toBeGreaterThan(0);
    expect(compareStrings('a', 'a')).toBe(0);
  });
});
