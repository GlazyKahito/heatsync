/**
 * EXP1 - Array of structures.
 *
 * A fixed-capacity array, as in C: `T slots[CAPACITY]` plus a `size` counter.
 * Insertion and deletion happen only at the end; search is a linear scan.
 * Powers the HEATSYNC Station Registry.
 */
import { DEFAULT_MAX_STEPS, Tracer, deepClone, describeValue, type Traced } from './trace';

/** Immutable view of a {@link StaticArray}. Unused slots are `null`. */
export interface StaticArraySnapshot<T> {
  slots: (T | null)[];
  size: number;
  capacity: number;
}

export type StaticArrayInsertResult = { ok: true; index: number } | { ok: false; reason: 'overflow' };
export type StaticArrayDeleteResult<T> = { ok: true; index: number; item: T } | { ok: false; reason: 'underflow' };

export interface LinearSearchResult<T> {
  found: boolean;
  /** Index of the first match, or -1. */
  index: number;
  item: T | null;
  /** Number of element comparisons performed. */
  comparisons: number;
}

export interface StaticArrayOptions<T> {
  /** Step cap per operation (default 5000, 0 disables recording). */
  maxSteps?: number;
  /** Label used for items in step messages. */
  describe?: (item: T) => string;
}

export class StaticArray<T> {
  /** Step cap per operation; may be changed at any time (0 disables recording). */
  maxSteps: number;
  private readonly memory: (T | null)[];
  private readonly cap: number;
  private count = 0;
  private readonly describe: (item: T) => string;

  /** @throws RangeError when `capacity` is not a positive integer. */
  constructor(capacity: number, options: StaticArrayOptions<T> = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`StaticArray capacity must be a positive integer, got ${capacity}`);
    }
    this.cap = capacity;
    this.memory = new Array<T | null>(capacity);
    for (let i = 0; i < capacity; i++) this.memory[i] = null;
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    this.describe = options.describe ?? describeValue;
  }

  /** Number of stored items. */
  get size(): number {
    return this.count;
  }

  /** Fixed number of slots. */
  get capacity(): number {
    return this.cap;
  }

  isEmpty(): boolean {
    return this.count === 0;
  }

  isFull(): boolean {
    return this.count === this.cap;
  }

  /** Item at `index`, or null when the index is outside `0..size-1`. */
  get(index: number): T | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) return null;
    return this.memory[index];
  }

  /** Appends at `slots[size]`. O(1). Reports overflow instead of throwing. */
  insertLast(item: T): Traced<StaticArrayInsertResult, StaticArraySnapshot<T>> {
    const t = this.tracer();
    const label = this.describe(item);
    if (this.count === this.cap) {
      t.step('error', `Overflow: size ${this.count} equals capacity ${this.cap}, so ${label} cannot be inserted.`);
      return t.finish({ ok: false, reason: 'overflow' });
    }
    const index = this.count;
    t.step('check', `size ${this.count} < capacity ${this.cap}, so slots[${index}] is free.`, [index]);
    this.memory[index] = item;
    this.count++;
    t.step('insert', `Write ${label} into slots[${index}] and increase size to ${this.count}.`, [index]);
    return t.finish({ ok: true, index });
  }

  /** Removes `slots[size-1]`. O(1). Reports underflow instead of throwing. */
  deleteLast(): Traced<StaticArrayDeleteResult<T>, StaticArraySnapshot<T>> {
    const t = this.tracer();
    if (this.count === 0) {
      t.step('error', 'Underflow: size is 0, so there is nothing to delete.');
      return t.finish({ ok: false, reason: 'underflow' });
    }
    const index = this.count - 1;
    const item = this.memory[index] as T;
    t.step('check', `size ${this.count} > 0, so the last item is slots[${index}] = ${this.describe(item)}.`, [index]);
    this.memory[index] = null;
    this.count--;
    t.step('delete', `Remove ${this.describe(item)} from slots[${index}] and decrease size to ${this.count}.`, [index]);
    return t.finish({ ok: true, index, item });
  }

  /**
   * Linear search from slot 0 for the first item satisfying `pred`. O(n).
   * @param label what is being searched for, used in messages (e.g. "code = PUN").
   */
  search(pred: (item: T) => boolean, label = 'the search condition'): Traced<LinearSearchResult<T>, StaticArraySnapshot<T>> {
    const t = this.tracer(true);
    let comparisons = 0;
    for (let i = 0; i < this.count; i++) {
      const item = this.memory[i] as T;
      comparisons++;
      if (pred(item)) {
        t.step('found', `slots[${i}] = ${this.describe(item)} matches ${label} after ${comparisons} comparison(s).`, [i]);
        return t.finish({ found: true, index: i, item, comparisons });
      }
      t.step('compare', `slots[${i}] = ${this.describe(item)} does not match ${label}.`, [i]);
    }
    t.step(
      'not-found',
      this.count === 0 ? 'The array is empty, so nothing matches.' : `Scanned all ${this.count} items: nothing matches ${label}.`,
    );
    return t.finish({ found: false, index: -1, item: null, comparisons });
  }

  /** Items in slot order (`slots[0..size-1]`). */
  display(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.memory[i] as T);
    return out;
  }

  /** Deep copy of the full memory, including empty slots. */
  snapshot(): StaticArraySnapshot<T> {
    return { slots: deepClone(this.memory), size: this.count, capacity: this.cap };
  }

  private tracer(readOnly = false): Tracer<StaticArraySnapshot<T>> {
    if (!readOnly) return new Tracer(() => this.snapshot(), this.maxSteps);
    let cached: StaticArraySnapshot<T> | null = null;
    return new Tracer(() => (cached ??= this.snapshot()), this.maxSteps);
  }
}
