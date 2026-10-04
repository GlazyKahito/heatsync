/**
 * Shared tracing primitives.
 *
 * Every data-structure operation returns a {@link Traced} value: the result of
 * the operation plus an ordered list of {@link Step}s. Each step carries a
 * deep-copied snapshot of the structure so the UI can replay the operation
 * frame by frame, even after the structure has been mutated again.
 */

/** One replayable frame of an operation. */
export interface Step<S> {
  /** Short machine label: 'compare' | 'visit' | 'enqueue' | 'probe' | 'push' | 'pop' | 'insert' | 'delete' | 'found' | 'error' | ... */
  kind: string;
  /** One human sentence describing what happened. */
  message: string;
  /**
   * Deep-copied view of the structure after this step. Treat it as immutable:
   * steps of read-only operations (search, traversal) may share one snapshot object.
   */
  snapshot: S;
  /** Indices or node ids to highlight. */
  focus?: (number | string)[];
}

/** Result of a traced operation. */
export interface Traced<R, S> {
  result: R;
  steps: Step<S>[];
  /** Present and true when the step log hit `maxSteps`; the last step is then a 'truncated' marker. */
  truncated?: boolean;
}

/** Default cap on recorded steps per operation. */
export const DEFAULT_MAX_STEPS = 5000;

/** Options accepted by traced free functions. */
export interface TraceOptions {
  /** Maximum steps to record (default 5000). `0` records nothing, which is the fast path for bulk work. */
  maxSteps?: number;
}

/**
 * Deep-copies plain data: primitives, arrays, plain objects, Date, Map and Set.
 * Functions are kept by reference. Cyclic values are not supported.
 */
export function deepClone<T>(value: T): T {
  return cloneValue(value) as T;
}

function cloneValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const out = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i++) out[i] = cloneValue(value[i]);
    return out;
  }
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof Map) {
    const src = value as Map<unknown, unknown>;
    const out = new Map<unknown, unknown>();
    src.forEach((v, k) => out.set(k, cloneValue(v)));
    return out;
  }
  if (value instanceof Set) {
    const src = value as Set<unknown>;
    const out = new Set<unknown>();
    src.forEach((v) => out.add(cloneValue(v)));
    return out;
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) out[key] = cloneValue(src[key]);
  return out;
}

/**
 * Collects steps for one operation. Snapshots are produced lazily by `snap`,
 * so nothing is copied when recording is disabled (`maxSteps` = 0).
 * When the cap is exceeded the final step is replaced by a 'truncated' marker
 * and further steps are dropped, so `steps.length` never exceeds `maxSteps`.
 */
export class Tracer<S> {
  readonly steps: Step<S>[] = [];
  private readonly snap: () => S;
  private readonly limit: number;
  private cut = false;

  constructor(snap: () => S, maxSteps: number = DEFAULT_MAX_STEPS) {
    this.snap = snap;
    this.limit = Number.isNaN(maxSteps) ? DEFAULT_MAX_STEPS : maxSteps > 0 ? Math.floor(maxSteps) : 0;
  }

  /** True while new steps are still being stored. Use it to skip building messages in hot loops. */
  get recording(): boolean {
    return this.limit > 0 && !this.cut;
  }

  /** True once the step cap has been exceeded. */
  get truncated(): boolean {
    return this.cut;
  }

  /** Records a step with a fresh snapshot. */
  step(kind: string, message: string, focus?: readonly (number | string)[]): void {
    if (!this.recording) return;
    if (this.steps.length >= this.limit) {
      this.cut = true;
      this.steps[this.limit - 1] = {
        kind: 'truncated',
        message: `Step limit of ${this.limit} reached; remaining steps were not recorded.`,
        snapshot: this.snap(),
      };
      return;
    }
    const s: Step<S> = { kind, message, snapshot: this.snap() };
    if (focus !== undefined && focus.length > 0) s.focus = focus.slice();
    this.steps.push(s);
  }

  /** Packages the result with the recorded steps. */
  finish<R>(result: R): Traced<R, S> {
    const out: Traced<R, S> = { result, steps: this.steps };
    if (this.cut) out.truncated = true;
    return out;
  }
}

/** Short human label for any value, used in step messages. */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
  if (type === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of ['label', 'name', 'title', 'code', 'key', 'id']) {
      const v = rec[key];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
    }
    let json: string;
    try {
      json = JSON.stringify(value) ?? String(value);
    } catch {
      json = '[object]';
    }
    return json.length > 48 ? `${json.slice(0, 45)}...` : json;
  }
  return String(value);
}

/** Ascending numeric comparator. */
export function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ascending string comparator by UTF-16 code units (locale independent). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
