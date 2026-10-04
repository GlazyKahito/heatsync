/**
 * EXP4 - Static circular queue, counter method.
 *
 * Fixed array with `front`, `rear` and `count`. Indices wrap with
 * `(i + 1) % capacity`, so no element is ever shifted. Fullness is decided by
 * `count === capacity`, emptiness by `count === 0`. Initial state follows the
 * C lab: front = 0, rear = -1, count = 0.
 * Powers the HEATSYNC Sensor Ring (24 hourly readings per station).
 */
import { DEFAULT_MAX_STEPS, Tracer, deepClone, describeValue, type Traced } from './trace';

/**
 * Immutable view of a {@link CircularQueue}. Slots outside the live window
 * are `null` (cleared on dequeue for display; occupancy is defined by the counter).
 */
export interface CircularQueueSnapshot<T> {
  slots: (T | null)[];
  front: number;
  rear: number;
  count: number;
  capacity: number;
}

export type EnqueueResult = { ok: true; index: number } | { ok: false; reason: 'overflow' };
export type DequeueResult<T> = { ok: true; index: number; item: T } | { ok: false; reason: 'underflow' };

export interface RingPushResult<T> {
  /** Slot the new item was written to. */
  index: number;
  /** True when the queue was full and the oldest item was dropped first. */
  evicted: boolean;
  evictedItem?: T;
}

export interface CircularQueueOptions<T> {
  /** Step cap per operation (default 5000, 0 disables recording). */
  maxSteps?: number;
  /** Label used for items in step messages. */
  describe?: (item: T) => string;
}

export class CircularQueue<T> {
  /** Step cap per operation; may be changed at any time (0 disables recording). */
  maxSteps: number;
  private readonly memory: (T | null)[];
  private readonly cap: number;
  private f = 0;
  private r = -1;
  private n = 0;
  private readonly describe: (item: T) => string;

  /** @throws RangeError when `capacity` is not a positive integer. */
  constructor(capacity: number, options: CircularQueueOptions<T> = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`CircularQueue capacity must be a positive integer, got ${capacity}`);
    }
    this.cap = capacity;
    this.memory = new Array<T | null>(capacity);
    for (let i = 0; i < capacity; i++) this.memory[i] = null;
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    this.describe = options.describe ?? describeValue;
  }

  /** Index of the oldest item. */
  get front(): number {
    return this.f;
  }

  /** Index of the newest item (-1 before the first enqueue). */
  get rear(): number {
    return this.r;
  }

  /** Number of stored items. */
  get count(): number {
    return this.n;
  }

  /** Alias of `count`. */
  get size(): number {
    return this.n;
  }

  get capacity(): number {
    return this.cap;
  }

  isFull(): boolean {
    return this.n === this.cap;
  }

  isEmpty(): boolean {
    return this.n === 0;
  }

  /** Oldest item without removing it. */
  peek(): T | undefined {
    return this.n === 0 ? undefined : (this.memory[this.f] as T);
  }

  /** The k-th item counted from front (0 = oldest), or undefined. */
  at(k: number): T | undefined {
    if (!Number.isInteger(k) || k < 0 || k >= this.n) return undefined;
    return this.memory[(this.f + k) % this.cap] as T;
  }

  /** Raw content of physical slot `i`. */
  slotAt(i: number): T | null {
    if (!Number.isInteger(i) || i < 0 || i >= this.cap) return null;
    return this.memory[i];
  }

  /** rear = (rear + 1) % capacity, write, count++. O(1). Reports overflow. */
  enqueue(item: T): Traced<EnqueueResult, CircularQueueSnapshot<T>> {
    const t = this.tracer();
    return t.finish(this.doEnqueue(item, t));
  }

  /** Read slots[front], front = (front + 1) % capacity, count--. O(1). Reports underflow. */
  dequeue(): Traced<DequeueResult<T>, CircularQueueSnapshot<T>> {
    const t = this.tracer();
    return t.finish(this.doDequeue(t));
  }

  /**
   * Ring-buffer write: when full, dequeue the oldest item first, then enqueue.
   * Both phases appear as steps. O(1).
   */
  push(item: T): Traced<RingPushResult<T>, CircularQueueSnapshot<T>> {
    const t = this.tracer();
    let evicted = false;
    let evictedItem: T | undefined;
    if (this.n === this.cap) {
      t.step('full', `The ring is full (count ${this.n} = capacity ${this.cap}): drop the oldest reading first.`, [this.f]);
      const d = this.doDequeue(t);
      if (d.ok) {
        evicted = true;
        evictedItem = d.item;
      }
    }
    const e = this.doEnqueue(item, t);
    const index = e.ok ? e.index : -1;
    const result: RingPushResult<T> = { index, evicted };
    if (evicted) result.evictedItem = evictedItem;
    return t.finish(result);
  }

  /** Items from front to rear. */
  toArray(): T[] {
    const out: T[] = [];
    let i = this.f;
    for (let k = 0; k < this.n; k++) {
      out.push(this.memory[i] as T);
      i = (i + 1) % this.cap;
    }
    return out;
  }

  /** Deep copy of the physical array and pointers. */
  snapshot(): CircularQueueSnapshot<T> {
    return { slots: deepClone(this.memory), front: this.f, rear: this.r, count: this.n, capacity: this.cap };
  }

  private doEnqueue(item: T, t: Tracer<CircularQueueSnapshot<T>>): EnqueueResult {
    const label = this.describe(item);
    if (this.n === this.cap) {
      t.step('error', `Overflow: count ${this.n} equals capacity ${this.cap}, so ${label} cannot be enqueued.`);
      return { ok: false, reason: 'overflow' };
    }
    const old = this.r;
    this.r = (this.r + 1) % this.cap;
    t.step('advance', `rear = (${old} + 1) % ${this.cap} = ${this.r}.`, [this.r]);
    this.memory[this.r] = item;
    this.n++;
    t.step('enqueue', `Write ${label} into slots[${this.r}]; count = ${this.n}.`, [this.r]);
    return { ok: true, index: this.r };
  }

  private doDequeue(t: Tracer<CircularQueueSnapshot<T>>): DequeueResult<T> {
    if (this.n === 0) {
      t.step('error', 'Underflow: count is 0, so there is nothing to dequeue.');
      return { ok: false, reason: 'underflow' };
    }
    const index = this.f;
    const item = this.memory[index] as T;
    t.step('read', `Read slots[${index}] = ${this.describe(item)} at front.`, [index]);
    this.memory[index] = null;
    this.f = (this.f + 1) % this.cap;
    this.n--;
    t.step('dequeue', `front = (${index} + 1) % ${this.cap} = ${this.f}; count = ${this.n}.`, [this.f]);
    return { ok: true, index, item };
  }

  private tracer(): Tracer<CircularQueueSnapshot<T>> {
    return new Tracer(() => this.snapshot(), this.maxSteps);
  }
}

/** Summary of the values currently in a queue. All NaN with count 0 when nothing is usable. */
export interface QueueStats {
  min: number;
  max: number;
  mean: number;
  /** Number of finite values included. */
  count: number;
}

/**
 * Min / max / mean over the live window, walking from `front` with circular
 * increments `(i + 1) % capacity`. Non-finite values (missing readings) are skipped. O(n).
 */
export function stats<T>(q: CircularQueue<T>, valueOf: (item: T) => number): QueueStats {
  return statsTraced(q, valueOf, { maxSteps: 0 }).result;
}

/** Frame of {@link statsTraced}: the queue (shared, read-only) plus running totals. */
export interface QueueStatsSnapshot<T> {
  queue: CircularQueueSnapshot<T>;
  /** Physical slot being read. */
  cursor: number;
  min: number;
  max: number;
  mean: number;
  count: number;
}

/** {@link stats} with one 'visit' step per slot walked. */
export function statsTraced<T>(
  q: CircularQueue<T>,
  valueOf: (item: T) => number,
  options: { maxSteps?: number } = {},
): Traced<QueueStats, QueueStatsSnapshot<T>> {
  let queue: CircularQueueSnapshot<T> | null = null;
  let cursor = q.front;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let used = 0;
  const current = (): QueueStats =>
    used === 0 ? { min: NaN, max: NaN, mean: NaN, count: 0 } : { min, max, mean: sum / used, count: used };
  const t = new Tracer<QueueStatsSnapshot<T>>(
    () => ({ queue: (queue ??= q.snapshot()), cursor, ...current() }),
    options.maxSteps ?? DEFAULT_MAX_STEPS,
  );
  for (let k = 0; k < q.count; k++) {
    const item = q.slotAt(cursor);
    const v = item === null ? NaN : valueOf(item);
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      used++;
      t.step('visit', `slots[${cursor}] = ${v}: max ${max}, min ${min}.`, [cursor]);
    } else {
      t.step('skip', `slots[${cursor}] has no usable value; skip it.`, [cursor]);
    }
    cursor = (cursor + 1) % q.capacity;
  }
  const result = current();
  t.step('done', used === 0 ? 'No usable values in the queue.' : `Walked ${q.count} slot(s): max ${result.max}, min ${result.min}, mean ${result.mean.toFixed(2)}.`);
  return t.finish(result);
}
