import { describe, expect, it } from 'vitest';
import {
  binarySearch,
  insertionSort,
  isSorted,
  lowerBound,
  mergeSort,
  percentileRank,
  quantile,
  quickSort,
  upperBound,
  type Comparator,
  type SortOptions,
  type SortResult,
} from '../sort-search';
import { compareNumbers, compareStrings } from '../trace';

type Sorter = <T>(arr: readonly T[], cmp: Comparator<T>, options?: SortOptions) => SortResult<T>;

const SORTS: [string, Sorter][] = [
  ['insertionSort', insertionSort],
  ['quickSort', quickSort],
  ['mergeSort', mergeSort],
];

function pseudoRandom(n: number, seed: number, mod: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    out.push((s % mod) / 10);
  }
  return out;
}

const reference = (arr: number[]): number[] => [...arr].sort((a, b) => a - b);

describe.each(SORTS)('%s', (_name, sort) => {
  it('sorts numbers into a new array without touching the input', () => {
    const input = [41.2, 38.5, 44.1, 36, 44.1, 39.9, 40];
    const frozen = Object.freeze(input.slice());
    const r = sort(frozen, compareNumbers);
    expect(r.sorted).toEqual([36, 38.5, 39.9, 40, 41.2, 44.1, 44.1]);
    expect(r.sorted).not.toBe(frozen);
    expect(frozen).toEqual(input);
    expect(r.comparisons).toBeGreaterThan(0);
    expect(r.writes).toBeGreaterThan(0);
    expect(r.steps).toEqual([]);
  });

  it('handles empty, single and all-equal arrays', () => {
    expect(sort([], compareNumbers).sorted).toEqual([]);
    expect(sort([5], compareNumbers).sorted).toEqual([5]);
    expect(sort([5], compareNumbers).comparisons).toBe(0);
    expect(sort([2, 2, 2, 2], compareNumbers).sorted).toEqual([2, 2, 2, 2]);
  });

  it('matches a reference sort on random data with many duplicates', () => {
    for (const seed of [1, 42, 2024]) {
      const data = pseudoRandom(300, seed, 200);
      expect(sort(data, compareNumbers).sorted).toEqual(reference(data));
    }
  });

  it('sorts already sorted and reversed input', () => {
    const asc = Array.from({ length: 200 }, (_, i) => i);
    const desc = asc.slice().reverse();
    expect(sort(asc, compareNumbers).sorted).toEqual(asc);
    expect(sort(desc, compareNumbers).sorted).toEqual(asc);
  });

  it('sorts objects with a custom comparator (descending)', () => {
    const days = [{ t: 40 }, { t: 45 }, { t: 38 }];
    expect(sort(days, (a, b) => b.t - a.t).sorted.map((d) => d.t)).toEqual([45, 40, 38]);
    expect(sort(['pune', 'akola', 'nagpur'], compareStrings).sorted).toEqual(['akola', 'nagpur', 'pune']);
  });

  it('records capped steps with array snapshots when tracing', () => {
    const r = sort([3, 1, 2], compareNumbers, { trace: true });
    expect(r.steps.length).toBeGreaterThan(1);
    expect(r.steps.at(-1)?.kind).toBe('done');
    expect(r.steps.at(-1)?.snapshot.array).toEqual([1, 2, 3]);
    expect(r.steps.some((s) => s.focus !== undefined && s.focus.length > 0)).toBe(true);
    expect(r.steps[0].snapshot.array).not.toBe(r.steps.at(-1)?.snapshot.array);
    const capped = sort(pseudoRandom(100, 3, 100), compareNumbers, { trace: true, maxSteps: 50 });
    expect(capped.steps).toHaveLength(50);
    expect(capped.truncated).toBe(true);
    expect(isSorted(capped.sorted, compareNumbers)).toBe(true);
  });
});

describe('sort specifics', () => {
  it('insertion sort counts n-1 comparisons on sorted input and n(n-1)/2 on reversed', () => {
    const n = 20;
    const asc = Array.from({ length: n }, (_, i) => i);
    const best = insertionSort(asc, compareNumbers);
    expect(best.comparisons).toBe(n - 1);
    expect(best.writes).toBe(n - 1);
    const worst = insertionSort(asc.slice().reverse(), compareNumbers);
    expect(worst.comparisons).toBe((n * (n - 1)) / 2);
  });

  it('insertion and merge sort are stable', () => {
    const items = [
      { k: 2, tag: 'a' },
      { k: 1, tag: 'b' },
      { k: 2, tag: 'c' },
      { k: 1, tag: 'd' },
    ];
    const cmp = (x: { k: number }, y: { k: number }) => x.k - y.k;
    expect(insertionSort(items, cmp).sorted.map((x) => x.tag)).toEqual(['b', 'd', 'a', 'c']);
    expect(mergeSort(items, cmp).sorted.map((x) => x.tag)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('quick sort records pivot, compare, swap and split steps', () => {
    const r = quickSort([5, 1, 4, 2, 3], compareNumbers, { trace: true });
    const kinds = new Set(r.steps.map((s) => s.kind));
    for (const k of ['pivot', 'compare', 'swap', 'split', 'done']) expect(kinds.has(k)).toBe(true);
    expect(r.steps.find((s) => s.kind === 'pivot')?.snapshot.pivot).toBe(4);
  });

  it('merge sort records merge and write steps and handles large input', () => {
    const r = mergeSort([4, 3, 2, 1], compareNumbers, { trace: true });
    expect(r.steps.filter((s) => s.kind === 'merge')).toHaveLength(3);
    expect(r.steps.filter((s) => s.kind === 'write')).toHaveLength(8);
    expect(r.writes).toBe(8);
    const big = pseudoRandom(5000, 9, 300);
    expect(mergeSort(big, compareNumbers).sorted).toEqual(reference(big));
    expect(quickSort(big, compareNumbers).sorted).toEqual(reference(big));
  });

  it('isSorted', () => {
    expect(isSorted([1, 2, 2, 3], compareNumbers)).toBe(true);
    expect(isSorted([2, 1], compareNumbers)).toBe(false);
    expect(isSorted([], compareNumbers)).toBe(true);
  });
});

describe('binarySearch', () => {
  const A = [30, 32.5, 35, 37, 39, 40, 41.5, 43, 45, 47.2];

  it('finds a present value with lo/mid/hi snapshots', () => {
    const r = binarySearch(A, 43, compareNumbers);
    expect(r.result).toEqual({ index: 7, found: true, insertAt: 7, comparisons: 2 });
    expect(r.steps.map((s) => s.snapshot)).toEqual([
      { lo: 0, mid: 4, hi: 9 },
      { lo: 5, mid: 7, hi: 9 },
    ]);
    expect(r.steps.map((s) => s.kind)).toEqual(['compare', 'found']);
    expect(r.steps.map((s) => s.focus)).toEqual([[4], [7]]);
  });

  it('reports not found with the insertion point', () => {
    const mid = binarySearch(A, 42, compareNumbers);
    expect(mid.result).toMatchObject({ index: -1, found: false, insertAt: 7 });
    expect(mid.steps.at(-1)?.kind).toBe('not-found');
    const last = mid.steps.at(-1)?.snapshot;
    expect(last && last.lo > last.hi).toBe(true);
    expect(binarySearch(A, 10, compareNumbers).result.insertAt).toBe(0);
    expect(binarySearch(A, 50, compareNumbers).result.insertAt).toBe(10);
    const empty = binarySearch([], 5, compareNumbers);
    expect(empty.result).toEqual({ index: -1, found: false, insertAt: 0, comparisons: 0 });
    expect(empty.steps).toHaveLength(1);
  });

  it('finds every element and stays within log2(n) + 1 comparisons', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i * 2);
    for (let i = 0; i < arr.length; i += 37) {
      const r = binarySearch(arr, arr[i], compareNumbers, { maxSteps: 0 });
      expect(r.result.index).toBe(i);
      expect(r.result.comparisons).toBeLessThanOrEqual(10);
      expect(r.steps).toHaveLength(0);
    }
  });

  it('refuses unsorted input when asked to check', () => {
    const r = binarySearch([3, 1, 2], 1, compareNumbers, { checkSorted: true });
    expect(r.result).toEqual({ index: -1, found: false, insertAt: -1, comparisons: 0, error: 'not-sorted' });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].kind).toBe('error');
    const custom = binarySearch([1, 2, 3], 2, compareNumbers, { checkSorted: () => false });
    expect(custom.result.error).toBe('not-sorted');
    const ok = binarySearch([1, 2, 3], 2, compareNumbers, { checkSorted: true });
    expect(ok.result.found).toBe(true);
    const unchecked = binarySearch([3, 1, 2], 3, compareNumbers);
    expect(unchecked.result.error).toBeUndefined();
  });

  it('works after sorting (the point of the experiment)', () => {
    const history = pseudoRandom(400, 77, 150);
    const sorted = quickSort(history, compareNumbers).sorted;
    const target = history[123];
    const r = binarySearch(sorted, target, compareNumbers, { checkSorted: true });
    expect(r.result.found).toBe(true);
    expect(sorted[r.result.index]).toBe(target);
  });
});

describe('bounds, percentile and quantile', () => {
  const S = [1, 2, 2, 2, 3, 5];

  it('lowerBound counts elements < x and upperBound counts elements <= x', () => {
    expect(lowerBound(S, 2)).toBe(1);
    expect(upperBound(S, 2)).toBe(4);
    expect(lowerBound(S, 0)).toBe(0);
    expect(upperBound(S, 0)).toBe(0);
    expect(lowerBound(S, 4)).toBe(5);
    expect(upperBound(S, 4)).toBe(5);
    expect(lowerBound(S, 9)).toBe(6);
    expect(upperBound(S, 5)).toBe(6);
    expect(lowerBound([], 1)).toBe(0);
    expect(upperBound([], 1)).toBe(0);
  });

  it('bounds accept a comparator', () => {
    const words = ['a', 'b', 'b', 'c'];
    expect(lowerBound(words, 'b', compareStrings)).toBe(1);
    expect(upperBound(words, 'b', compareStrings)).toBe(3);
  });

  it('percentileRank is the percentage strictly below x', () => {
    expect(percentileRank(S, 2)).toBeCloseTo((100 * 1) / 6);
    expect(percentileRank(S, 6)).toBe(100);
    expect(percentileRank(S, 1)).toBe(0);
    expect(percentileRank([10, 20, 30, 40], 35)).toBe(75);
    expect(Number.isNaN(percentileRank([], 3))).toBe(true);
  });

  it('quantile interpolates linearly and clamps p', () => {
    const q = [10, 20, 30, 40];
    expect(quantile(q, 0)).toBe(10);
    expect(quantile(q, 1)).toBe(40);
    expect(quantile(q, 0.5)).toBe(25);
    expect(quantile(q, 0.9)).toBeCloseTo(37);
    expect(quantile(q, -1)).toBe(10);
    expect(quantile(q, 2)).toBe(40);
    expect(quantile([7], 0.3)).toBe(7);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
    expect(Number.isNaN(quantile(q, NaN))).toBe(true);
  });
});
