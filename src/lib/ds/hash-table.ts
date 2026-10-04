/**
 * EXP8 - Dictionary on a circular array with linear probing.
 *
 * Keys are strings, normalised by the table (trim, lowercase, collapse runs of
 * whitespace). The home slot is a polynomial rolling hash:
 *
 *     h = 0;  for each UTF-16 code unit c:  h = (h * 31 + c) mod capacity
 *
 * Collisions probe `(h + i) % capacity` for i = 0, 1, 2, ... wrapping around
 * the array. Deletion leaves a tombstone ('deleted') so later probe chains stay
 * intact; insertion reuses the first tombstone it passed. A prime capacity
 * (default 53) spreads keys well.
 * Powers the HEATSYNC Instant Lookup (district name, former name, HQ PIN).
 */
import { DEFAULT_MAX_STEPS, Tracer, deepClone, type Traced } from './trace';

export type SlotState = 'empty' | 'occupied' | 'deleted';

/** One slot as it appears in a snapshot. Only occupied slots carry key and value. */
export interface HashSlot<V> {
  state: SlotState;
  key?: string;
  value?: V;
}

/** The slot examined by the current step. */
export interface HashProbe {
  slot: number;
  /** i in (h + i) % capacity. */
  attempt: number;
  /** State of the slot when it was examined. */
  state: SlotState;
  /** Key found in the slot, if occupied. */
  key?: string;
}

/** Immutable view of a {@link HashTable}; `probe` is null outside probe steps. */
export interface HashSnapshot<V> {
  slots: HashSlot<V>[];
  probe: HashProbe | null;
}

export type HashInsertResult =
  | { ok: true; action: 'inserted' | 'updated'; slot: number; probes: number }
  | { ok: false; reason: 'full' | 'empty-key'; probes: number };

export interface HashSearchResult<V> {
  found: boolean;
  /** Slot holding the key, or -1. */
  slot: number;
  value?: V;
  probes: number;
}

export type HashDeleteResult<V> =
  | { ok: true; slot: number; value: V; probes: number }
  | { ok: false; reason: 'not-found' | 'empty-key'; probes: number };

export interface HashEntry<V> {
  key: string;
  value: V;
  slot: number;
}

export interface HashTableOptions {
  /** Step cap per operation (default 5000, 0 disables recording). */
  maxSteps?: number;
}

/** Trim, lowercase and collapse internal whitespace to single spaces. */
export function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Polynomial rolling hash of an already-normalised key: h = (h * 31 + code) mod capacity. */
export function polyHash(key: string, capacity: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % capacity;
  return h;
}

interface Cell<V> {
  state: SlotState;
  key: string;
  value: V | undefined;
}

export class HashTable<V> {
  static readonly DEFAULT_CAPACITY = 53;
  /** Step cap per operation; may be changed at any time (0 disables recording). */
  maxSteps: number;
  private readonly cells: Cell<V>[];
  private readonly cap: number;
  private used = 0;
  private tombs = 0;
  private probe: HashProbe | null = null;

  /** @throws RangeError when `capacity` is not a positive integer. */
  constructor(capacity: number = HashTable.DEFAULT_CAPACITY, options: HashTableOptions = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`HashTable capacity must be a positive integer, got ${capacity}`);
    }
    this.cap = capacity;
    this.cells = new Array<Cell<V>>(capacity);
    for (let i = 0; i < capacity; i++) this.cells[i] = { state: 'empty', key: '', value: undefined };
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  }

  get capacity(): number {
    return this.cap;
  }

  /** Number of occupied slots. */
  get size(): number {
    return this.used;
  }

  /** Number of tombstones. */
  get tombstones(): number {
    return this.tombs;
  }

  /** Occupied slots / capacity (tombstones excluded). */
  get loadFactor(): number {
    return this.used / this.cap;
  }

  /** Home slot of `key` after normalisation. */
  hash(key: string): number {
    return polyHash(normalizeKey(key), this.cap);
  }

  /**
   * Inserts or updates. Probes until an empty slot or the key itself; the first
   * tombstone passed is reused. After a full cycle with no free slot: 'full'.
   * O(1) average, O(n) worst.
   */
  insert(key: string, value: V): Traced<HashInsertResult, HashSnapshot<V>> {
    const t = this.tracer();
    const k = normalizeKey(key);
    if (k === '') {
      t.step('error', 'The key is empty after normalisation.');
      return this.done(t, { ok: false, reason: 'empty-key', probes: 0 });
    }
    const home = polyHash(k, this.cap);
    t.step('hash', `h("${k}") = ${home} (rolling hash, base 31, mod ${this.cap}).`, [home]);
    let tomb = -1;
    for (let i = 0; i < this.cap; i++) {
      const slot = (home + i) % this.cap;
      const cell = this.cells[slot];
      this.setProbe(slot, i, cell);
      if (cell.state === 'empty') {
        t.step('probe', `Probe i = ${i}: slot ${slot} is empty, so "${k}" is not in the table.`, [slot]);
        return this.place(t, tomb === -1 ? slot : tomb, k, value, i + 1, tomb !== -1);
      }
      if (cell.state === 'deleted') {
        if (tomb === -1) tomb = slot;
        t.step('probe', `Probe i = ${i}: slot ${slot} is a tombstone${tomb === slot ? '; remember it for reuse' : ''}, keep probing.`, [slot]);
        continue;
      }
      if (cell.key === k) {
        t.step('probe', `Probe i = ${i}: slot ${slot} holds "${k}", so the key already exists.`, [slot]);
        cell.value = value;
        this.probe = null;
        t.step('update', `Update the value stored in slot ${slot}.`, [slot]);
        return this.done(t, { ok: true, action: 'updated', slot, probes: i + 1 });
      }
      t.step('probe', `Probe i = ${i}: slot ${slot} holds "${cell.key}", a collision; try (${home} + ${i + 1}) % ${this.cap}.`, [slot]);
    }
    if (tomb !== -1) return this.place(t, tomb, k, value, this.cap, true);
    t.step('error', `The table is full: all ${this.cap} slots probed without finding room.`);
    return this.done(t, { ok: false, reason: 'full', probes: this.cap });
  }

  /** Probes from the home slot, skipping tombstones, until the key or an empty slot. O(1) average, O(n) worst. */
  search(key: string): Traced<HashSearchResult<V>, HashSnapshot<V>> {
    const t = this.tracer();
    const k = normalizeKey(key);
    const found = this.locate(k, t);
    if (found.slot === -1) return this.done(t, { found: false, slot: -1, probes: found.probes });
    return this.done(t, { found: true, slot: found.slot, value: this.cells[found.slot].value as V, probes: found.probes });
  }

  /** Finds the key and turns its slot into a tombstone. O(1) average, O(n) worst. */
  delete(key: string): Traced<HashDeleteResult<V>, HashSnapshot<V>> {
    const t = this.tracer();
    const k = normalizeKey(key);
    if (k === '') {
      t.step('error', 'The key is empty after normalisation.');
      return this.done(t, { ok: false, reason: 'empty-key', probes: 0 });
    }
    const found = this.locate(k, t);
    if (found.slot === -1) return this.done(t, { ok: false, reason: 'not-found', probes: found.probes });
    const cell = this.cells[found.slot];
    const value = cell.value as V;
    cell.state = 'deleted';
    cell.key = '';
    cell.value = undefined;
    this.used--;
    this.tombs++;
    this.probe = null;
    t.step('delete', `Mark slot ${found.slot} as deleted (tombstone) so later probe chains still pass through it.`, [found.slot]);
    return this.done(t, { ok: true, slot: found.slot, value, probes: found.probes });
  }

  /** True when `key` is present (no steps). */
  has(key: string): boolean {
    return this.locate(normalizeKey(key), null).slot !== -1;
  }

  /** Value for `key` without steps, or undefined. */
  get(key: string): V | undefined {
    const slot = this.locate(normalizeKey(key), null).slot;
    return slot === -1 ? undefined : this.cells[slot].value;
  }

  /** Occupied entries in slot order. */
  entries(): HashEntry<V>[] {
    const out: HashEntry<V>[] = [];
    for (let i = 0; i < this.cap; i++) {
      const c = this.cells[i];
      if (c.state === 'occupied') out.push({ key: c.key, value: c.value as V, slot: i });
    }
    return out;
  }

  /** Deep copy of every slot. */
  snapshot(): HashSnapshot<V> {
    const slots: HashSlot<V>[] = new Array<HashSlot<V>>(this.cap);
    for (let i = 0; i < this.cap; i++) {
      const c = this.cells[i];
      slots[i] = c.state === 'occupied' ? { state: 'occupied', key: c.key, value: deepClone(c.value) } : { state: c.state };
    }
    return { slots, probe: this.probe === null ? null : { ...this.probe } };
  }

  /** Shared probe loop for search and delete. `t` may be null for silent lookups. */
  private locate(k: string, t: Tracer<HashSnapshot<V>> | null): { slot: number; probes: number } {
    if (k === '') {
      if (t !== null) t.step('error', 'The key is empty after normalisation.');
      return { slot: -1, probes: 0 };
    }
    const home = polyHash(k, this.cap);
    if (t !== null) t.step('hash', `h("${k}") = ${home} (rolling hash, base 31, mod ${this.cap}).`, [home]);
    for (let i = 0; i < this.cap; i++) {
      const slot = (home + i) % this.cap;
      const cell = this.cells[slot];
      if (t !== null) this.setProbe(slot, i, cell);
      if (cell.state === 'empty') {
        if (t !== null) t.step('not-found', `Probe i = ${i}: slot ${slot} is empty, so "${k}" is not in the table.`, [slot]);
        return { slot: -1, probes: i + 1 };
      }
      if (cell.state === 'occupied' && cell.key === k) {
        if (t !== null) t.step('found', `Probe i = ${i}: slot ${slot} holds "${k}". Found.`, [slot]);
        return { slot, probes: i + 1 };
      }
      if (t !== null) {
        t.step(
          'probe',
          cell.state === 'deleted'
            ? `Probe i = ${i}: slot ${slot} is a tombstone, keep probing.`
            : `Probe i = ${i}: slot ${slot} holds "${cell.key}", a collision; keep probing.`,
          [slot],
        );
      }
    }
    if (t !== null) t.step('not-found', `Probed all ${this.cap} slots: "${k}" is not in the table.`);
    return { slot: -1, probes: this.cap };
  }

  private place(t: Tracer<HashSnapshot<V>>, slot: number, k: string, value: V, probes: number, reuse: boolean): Traced<HashInsertResult, HashSnapshot<V>> {
    const cell = this.cells[slot];
    if (cell.state === 'deleted') this.tombs--;
    cell.state = 'occupied';
    cell.key = k;
    cell.value = value;
    this.used++;
    this.probe = null;
    t.step('insert', reuse ? `Store "${k}" in tombstone slot ${slot}, reusing it.` : `Store "${k}" in slot ${slot}.`, [slot]);
    return this.done(t, { ok: true, action: 'inserted', slot, probes });
  }

  private setProbe(slot: number, attempt: number, cell: Cell<V>): void {
    this.probe = cell.state === 'occupied' ? { slot, attempt, state: cell.state, key: cell.key } : { slot, attempt, state: cell.state };
  }

  private done<R>(t: Tracer<HashSnapshot<V>>, result: R): Traced<R, HashSnapshot<V>> {
    this.probe = null;
    return t.finish(result);
  }

  private tracer(): Tracer<HashSnapshot<V>> {
    return new Tracer(() => this.snapshot(), this.maxSteps);
  }
}
