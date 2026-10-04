/**
 * EXP7 - Sorting in service of binary search.
 *
 * Three comparison sorts (insertion, quick, merge) that never touch the input,
 * count comparisons and writes, and can optionally record steps. Binary search
 * and its bound/percentile helpers then rank a value against the sorted history.
 * Powers the HEATSYNC Climate Archive.
 *
 * Counting conventions: `comparisons` counts comparator calls; `writes` counts
 * element assignments into the array being sorted (a swap is 2 writes; merge
 * sort's copies into its temporary buffer are not counted).
 */
import { DEFAULT_MAX_STEPS, Tracer, compareNumbers, deepClone, describeValue, type Step, type Traced } from './trace';

export type Comparator<T> = (a: T, b: T) => number;

/** Frame of a traced sort. `lo..hi` is the active range (inclusive). */
export interface SortSnapshot<T> {
  array: T[];
  lo: number;
  hi: number;
  /** Quick sort only: the current pivot value. */
  pivot?: T;
}

export interface SortOptions {
  /** Record steps (off by default; use only for small arrays). */
  trace?: boolean;
  /** Step cap when tracing (default 5000). */
  maxSteps?: number;
}

export interface SortResult<T> {
  /** New sorted array; the input is never modified. */
  sorted: T[];
  comparisons: number;
  writes: number;
  /** Empty unless `trace: true`. `focus` holds the compared or written indices. */
  steps: Step<SortSnapshot<T>>[];
  truncated?: boolean;
}

interface SortRun<T> {
  a: T[];
  lo: number;
  hi: number;
  pivot: T | undefined;
  t: Tracer<SortSnapshot<T>>;
}

function startRun<T>(arr: readonly T[], options: SortOptions): SortRun<T> {
  const a: T[] = new Array<T>(arr.length);
  for (let i = 0; i < arr.length; i++) a[i] = arr[i];
  const view: Omit<SortRun<T>, 't'> = { a, lo: 0, hi: arr.length - 1, pivot: undefined };
  const t = new Tracer<SortSnapshot<T>>(
    () => {
      const snap: SortSnapshot<T> = { array: deepClone(view.a), lo: view.lo, hi: view.hi };
      if (view.pivot !== undefined) snap.pivot = deepClone(view.pivot);
      return snap;
    },
    options.trace === true ? (options.maxSteps ?? DEFAULT_MAX_STEPS) : 0,
  );
  return Object.assign(view, { t });
}

function endRun<T>(run: SortRun<T>, comparisons: number, writes: number): SortResult<T> {
  run.lo = 0;
  run.hi = run.a.length - 1;
  run.pivot = undefined;
  if (run.t.recording) run.t.step('done', `Sorted ${run.a.length} item(s): ${comparisons} comparisons, ${writes} writes.`);
  const out: SortResult<T> = { sorted: run.a, comparisons, writes, steps: run.t.steps };
  if (run.t.truncated) out.truncated = true;
  return out;
}

const d = describeValue;

/**
 * Insertion sort: grow a sorted prefix, shifting larger items right.
 * O(n^2) worst/average, O(n) on sorted input. Stable.
 */
export function insertionSort<T>(arr: readonly T[], cmp: Comparator<T>, options: SortOptions = {}): SortResult<T> {
  const run = startRun(arr, options);
  const { a, t } = run;
  let comparisons = 0;
  let writes = 0;
  for (let i = 1; i < a.length; i++) {
    const key = a[i];
    run.lo = 0;
    run.hi = i;
    if (t.recording) t.step('select', `Take key a[${i}] = ${d(key)} and insert it into the sorted prefix a[0..${i - 1}].`, [i]);
    let j = i - 1;
    while (j >= 0) {
      comparisons++;
      if (cmp(a[j], key) <= 0) {
        if (t.recording) t.step('compare', `a[${j}] = ${d(a[j])} <= ${d(key)}: stop shifting.`, [j]);
        break;
      }
      a[j + 1] = a[j];
      writes++;
      if (t.recording) t.step('shift', `a[${j}] = ${d(a[j])} > ${d(key)}: shift it right to a[${j + 1}].`, [j, j + 1]);
      j--;
    }
    a[j + 1] = key;
    writes++;
    if (t.recording) t.step('write', `Place key ${d(key)} at a[${j + 1}].`, [j + 1]);
  }
  return endRun(run, comparisons, writes);
}

/**
 * Quick sort with the Hoare partition scheme; the pivot is the value of the
 * middle element of each range. Recurses into the smaller part and loops over
 * the larger, so stack depth stays O(log n).
 * O(n log n) average, O(n^2) worst. Not stable.
 */
export function quickSort<T>(arr: readonly T[], cmp: Comparator<T>, options: SortOptions = {}): SortResult<T> {
  const run = startRun(arr, options);
  const { a, t } = run;
  let comparisons = 0;
  let writes = 0;

  const partition = (lo: number, hi: number): number => {
    const mid = lo + Math.floor((hi - lo) / 2);
    const pivot = a[mid];
    run.lo = lo;
    run.hi = hi;
    run.pivot = pivot;
    if (t.recording) t.step('pivot', `Partition a[${lo}..${hi}] around pivot a[${mid}] = ${d(pivot)}.`, [mid]);
    let i = lo - 1;
    let j = hi + 1;
    for (;;) {
      let c: number;
      do {
        i++;
        comparisons++;
        c = cmp(a[i], pivot);
        if (t.recording) t.step('compare', `i = ${i}: a[${i}] = ${d(a[i])} ${c < 0 ? '< pivot, move right' : '>= pivot, stop'}.`, [i]);
      } while (c < 0);
      do {
        j--;
        comparisons++;
        c = cmp(a[j], pivot);
        if (t.recording) t.step('compare', `j = ${j}: a[${j}] = ${d(a[j])} ${c > 0 ? '> pivot, move left' : '<= pivot, stop'}.`, [j]);
      } while (c > 0);
      if (i >= j) {
        if (t.recording) t.step('split', `i >= j: split at ${j} into a[${lo}..${j}] and a[${j + 1}..${hi}].`, [j]);
        return j;
      }
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
      writes += 2;
      if (t.recording) t.step('swap', `Swap a[${i}] and a[${j}].`, [i, j]);
    }
  };

  const sortRange = (lo: number, hi: number): void => {
    while (lo < hi) {
      const p = partition(lo, hi);
      if (p - lo < hi - p) {
        sortRange(lo, p);
        lo = p + 1;
      } else {
        sortRange(p + 1, hi);
        hi = p;
      }
    }
  };

  sortRange(0, a.length - 1);
  return endRun(run, comparisons, writes);
}

/**
 * Top-down merge sort with one temporary buffer. O(n log n) in all cases,
 * O(n) extra space. Stable.
 */
export function mergeSort<T>(arr: readonly T[], cmp: Comparator<T>, options: SortOptions = {}): SortResult<T> {
  const run = startRun(arr, options);
  const { a, t } = run;
  const aux: T[] = new Array<T>(a.length);
  let comparisons = 0;
  let writes = 0;

  const merge = (lo: number, mid: number, hi: number): void => {
    run.lo = lo;
    run.hi = hi;
    if (t.recording) t.step('merge', `Merge a[${lo}..${mid}] and a[${mid + 1}..${hi}].`, [lo, hi]);
    for (let k = lo; k <= hi; k++) aux[k] = a[k];
    let i = lo;
    let j = mid + 1;
    for (let k = lo; k <= hi; k++) {
      let why: string;
      if (i > mid) {
        a[k] = aux[j++];
        why = 'left half used up';
      } else if (j > hi) {
        a[k] = aux[i++];
        why = 'right half used up';
      } else {
        comparisons++;
        if (cmp(aux[j], aux[i]) < 0) {
          why = `${d(aux[j])} < ${d(aux[i])}`;
          a[k] = aux[j++];
        } else {
          why = `${d(aux[i])} <= ${d(aux[j])}`;
          a[k] = aux[i++];
        }
      }
      writes++;
      if (t.recording) t.step('write', `${why}: a[${k}] = ${d(a[k])}.`, [k]);
    }
  };

  const sortRange = (lo: number, hi: number): void => {
    if (lo >= hi) return;
    const mid = lo + Math.floor((hi - lo) / 2);
    sortRange(lo, mid);
    sortRange(mid + 1, hi);
    merge(lo, mid, hi);
  };

  sortRange(0, a.length - 1);
  return endRun(run, comparisons, writes);
}

/** True when `arr` is in non-decreasing order under `cmp`. O(n). */
export function isSorted<T>(arr: readonly T[], cmp: Comparator<T>): boolean {
  for (let i = 1; i < arr.length; i++) if (cmp(arr[i - 1], arr[i]) > 0) return false;
  return true;
}

/** Frame of a binary search: current bounds and probe (-1 before the first probe). */
export interface BinarySearchSnapshot {
  lo: number;
  mid: number;
  hi: number;
}

export interface BinarySearchResult {
  /** Index of a matching element, or -1. */
  index: number;
  found: boolean;
  /** Where `target` would be inserted to keep the array sorted (-1 on error). */
  insertAt: number;
  comparisons: number;
  error?: 'not-sorted';
}

export interface BinarySearchOptions<T> {
  /**
   * Pre-check: `true` runs {@link isSorted} with `cmp`; a function runs that check instead.
   * When the check fails the search is refused with an 'error' step. Default: no check.
   */
  checkSorted?: boolean | ((arr: readonly T[]) => boolean);
  /** Step cap (default 5000, 0 disables recording). */
  maxSteps?: number;
}

/**
 * Iterative binary search on `lo..hi` with `mid = lo + floor((hi - lo) / 2)`. O(log n).
 * Each step's snapshot is `{ lo, mid, hi }` and `focus` is `[mid]`.
 */
export function binarySearch<T>(
  sorted: readonly T[],
  target: T,
  cmp: Comparator<T>,
  options: BinarySearchOptions<T> = {},
): Traced<BinarySearchResult, BinarySearchSnapshot> {
  let lo = 0;
  let hi = sorted.length - 1;
  let mid = -1;
  const t = new Tracer<BinarySearchSnapshot>(() => ({ lo, mid, hi }), options.maxSteps ?? DEFAULT_MAX_STEPS);
  const check = options.checkSorted;
  if (check !== undefined && check !== false) {
    const ok = check === true ? isSorted(sorted, cmp) : check(sorted);
    if (!ok) {
      t.step('error', 'The array is not sorted, so binary search would give wrong answers. Sort it first.');
      return t.finish({ index: -1, found: false, insertAt: -1, comparisons: 0, error: 'not-sorted' });
    }
  }
  let comparisons = 0;
  const x = d(target);
  while (lo <= hi) {
    mid = lo + Math.floor((hi - lo) / 2);
    comparisons++;
    const c = cmp(sorted[mid], target);
    const v = d(sorted[mid]);
    if (c === 0) {
      t.step('found', `lo = ${lo}, hi = ${hi}, mid = ${mid}: a[${mid}] = ${v} equals ${x}. Found.`, [mid]);
      return t.finish({ index: mid, found: true, insertAt: mid, comparisons });
    }
    if (c < 0) {
      t.step('compare', `lo = ${lo}, hi = ${hi}, mid = ${mid}: a[${mid}] = ${v} < ${x}, so lo = ${mid + 1}.`, [mid]);
      lo = mid + 1;
    } else {
      t.step('compare', `lo = ${lo}, hi = ${hi}, mid = ${mid}: a[${mid}] = ${v} > ${x}, so hi = ${mid - 1}.`, [mid]);
      hi = mid - 1;
    }
  }
  t.step('not-found', `lo = ${lo} > hi = ${hi}: ${x} is not present; it would be inserted at index ${lo}.`);
  return t.finish({ index: -1, found: false, insertAt: lo, comparisons });
}

/** Number of elements strictly less than `x` (first index with a[i] >= x). O(log n). */
export function lowerBound(sorted: readonly number[], x: number): number;
export function lowerBound<T>(sorted: readonly T[], x: T, cmp: Comparator<T>): number;
export function lowerBound<T>(sorted: readonly T[], x: T, cmp?: Comparator<T>): number {
  const c = cmp ?? (compareNumbers as unknown as Comparator<T>);
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (c(sorted[mid], x) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Number of elements less than or equal to `x` (first index with a[i] > x). O(log n). */
export function upperBound(sorted: readonly number[], x: number): number;
export function upperBound<T>(sorted: readonly T[], x: T, cmp: Comparator<T>): number;
export function upperBound<T>(sorted: readonly T[], x: T, cmp?: Comparator<T>): number {
  const c = cmp ?? (compareNumbers as unknown as Comparator<T>);
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (c(sorted[mid], x) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Percentage (0..100) of values strictly below `x`. NaN for an empty array. O(log n). */
export function percentileRank(sortedNums: readonly number[], x: number): number {
  if (sortedNums.length === 0) return NaN;
  return (100 * lowerBound(sortedNums, x)) / sortedNums.length;
}

/**
 * Value at fraction `p` (0..1, clamped) with linear interpolation between
 * closest ranks: h = (n - 1) * p. NaN for an empty array or NaN `p`. O(1).
 */
export function quantile(sortedNums: readonly number[], p: number): number {
  const n = sortedNums.length;
  if (n === 0 || Number.isNaN(p)) return NaN;
  const q = p < 0 ? 0 : p > 1 ? 1 : p;
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  const hi = lo + 1 < n ? lo + 1 : lo;
  return sortedNums[lo] + (h - lo) * (sortedNums[hi] - sortedNums[lo]);
}
