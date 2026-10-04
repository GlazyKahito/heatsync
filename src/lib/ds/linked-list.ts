/**
 * EXP2 - Singly linked list.
 *
 * Nodes are `{ value, next }` records linked by explicit `next` pointers from a
 * `head` pointer, as in C. Each node gets a stable string id ('n1', 'n2', ...)
 * so the UI can track it across snapshots. Powers the HEATSYNC Alert Chain.
 */
import { DEFAULT_MAX_STEPS, Tracer, deepClone, describeValue, type Traced } from './trace';

/** Node as it appears in a snapshot; `next` is the id of the following node. */
export interface ListNodeView<T> {
  id: string;
  value: T;
  next: string | null;
}

/** Immutable view of a {@link SinglyLinkedList}. */
export interface LinkedListSnapshot<T> {
  head: string | null;
  /** Nodes reachable from `head`, in list order. */
  nodes: ListNodeView<T>[];
  /**
   * A node allocated but not yet reachable from head (during insertion) or
   * just unlinked and about to be freed (during deletion).
   */
  floating?: ListNodeView<T>;
}

/** A node id, or a predicate over `(value, id)` that selects the target node. */
export type NodeTarget<T> = string | ((value: T, id: string) => boolean);

export type ListInsertResult = { ok: true; id: string } | { ok: false; reason: 'empty' | 'not-found' };

export type ListDeleteBeforeResult<T> =
  /** `case`: 'head' when the target was the 2nd node (head deleted), else 'general'. */
  | { ok: true; id: string; value: T; case: 'head' | 'general' }
  | { ok: false; reason: 'empty' | 'no-predecessor' | 'not-found' };

export type ListDeleteFirstResult<T> = { ok: true; id: string; value: T } | { ok: false; reason: 'empty' };

export interface ListFindResult<T> {
  id: string;
  value: T;
  /** 0-based position from head. */
  index: number;
}

export interface LinkedListOptions<T> {
  /** Step cap per operation (default 5000, 0 disables recording). */
  maxSteps?: number;
  /** Label used for values in step messages. */
  describe?: (value: T) => string;
}

interface SllNode<T> {
  id: string;
  value: T;
  next: SllNode<T> | null;
}

export class SinglyLinkedList<T> {
  /** Step cap per operation; may be changed at any time (0 disables recording). */
  maxSteps: number;
  private head: SllNode<T> | null = null;
  private count = 0;
  private nextId = 1;
  private floating: SllNode<T> | null = null;
  private readonly describe: (value: T) => string;

  constructor(options: LinkedListOptions<T> = {}) {
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    this.describe = options.describe ?? describeValue;
  }

  get size(): number {
    return this.count;
  }

  /** Id of the first node, or null when empty. */
  get headId(): string | null {
    return this.head === null ? null : this.head.id;
  }

  isEmpty(): boolean {
    return this.head === null;
  }

  /** Value of the first node. */
  peekFirst(): T | undefined {
    return this.head === null ? undefined : this.head.value;
  }

  /** Value of the node with `id`. O(n). */
  get(id: string): T | undefined {
    for (let p = this.head; p !== null; p = p.next) if (p.id === id) return p.value;
    return undefined;
  }

  /** New node becomes the head. O(1). */
  insertAtBegin(value: T): Traced<{ id: string }, LinkedListSnapshot<T>> {
    const t = this.tracer();
    const node = this.alloc(value);
    node.next = this.head;
    this.floating = node;
    t.step('alloc', `Allocate ${this.label(node)} and set its next to head (${this.ref(this.head)}).`, [node.id]);
    this.head = node;
    this.floating = null;
    this.count++;
    t.step('insert', `head = ${node.id}: ${this.describe(value)} is now the first node.`, [node.id]);
    return t.finish({ id: node.id });
  }

  /** Inserts a new node right after the target node. O(n) to find the target. */
  insertAfter(target: NodeTarget<T>, value: T): Traced<ListInsertResult, LinkedListSnapshot<T>> {
    const t = this.tracer();
    const isTarget = this.matcher(target);
    if (this.head === null) {
      t.step('error', 'The list is empty, so there is no node to insert after.');
      return t.finish({ ok: false, reason: 'empty' });
    }
    let ptr: SllNode<T> | null = this.head;
    while (ptr !== null && !isTarget(ptr)) {
      t.step('visit', `Visit ${this.label(ptr)}: not the target, move to next (${this.ref(ptr.next)}).`, [ptr.id]);
      ptr = ptr.next;
    }
    if (ptr === null) {
      t.step('error', `Reached NULL: ${this.targetLabel(target)} is not in the list.`);
      return t.finish({ ok: false, reason: 'not-found' });
    }
    t.step('found', `Visit ${this.label(ptr)}: this is the target.`, [ptr.id]);
    const node = this.alloc(value);
    node.next = ptr.next;
    this.floating = node;
    t.step('alloc', `Allocate ${this.label(node)} and set its next to ${ptr.id}.next (${this.ref(ptr.next)}).`, [node.id, ptr.id]);
    ptr.next = node;
    this.floating = null;
    this.count++;
    t.step('insert', `${ptr.id}.next = ${node.id}: inserted after ${this.label(ptr)}.`, [node.id]);
    return t.finish({ ok: true, id: node.id });
  }

  /**
   * Deletes the node immediately before the target. O(n).
   * Cases: target is head (error: no predecessor), target is 2nd (delete head), general.
   */
  deleteBefore(target: NodeTarget<T>): Traced<ListDeleteBeforeResult<T>, LinkedListSnapshot<T>> {
    const t = this.tracer();
    const isTarget = this.matcher(target);
    const head = this.head;
    if (head === null) {
      t.step('error', 'The list is empty, so there is nothing to delete.');
      return t.finish({ ok: false, reason: 'empty' });
    }
    if (isTarget(head)) {
      t.step('error', `The target ${this.label(head)} is the head: no node exists before it.`, [head.id]);
      return t.finish({ ok: false, reason: 'no-predecessor' });
    }
    const second = head.next;
    if (second === null) {
      t.step('error', `Only ${this.label(head)} exists and it is not the target: ${this.targetLabel(target)} not found.`, [head.id]);
      return t.finish({ ok: false, reason: 'not-found' });
    }
    if (isTarget(second)) {
      t.step('found', `The target ${this.label(second)} is the 2nd node, so the node before it is the head ${head.id}.`, [second.id, head.id]);
      this.head = second;
      this.floating = head;
      t.step('unlink', `head = ${head.id}.next (${second.id}); ${head.id} is unlinked.`, [head.id]);
      this.release(t, head);
      return t.finish({ ok: true, id: head.id, value: head.value, case: 'head' });
    }
    let prev: SllNode<T> = head;
    let curr: SllNode<T> = second;
    t.step('visit', `ptr at ${this.label(curr)} with prev at ${head.id}; check whether ${curr.id}.next is the target.`, [curr.id]);
    while (curr.next !== null && !isTarget(curr.next)) {
      prev = curr;
      curr = curr.next;
      t.step('visit', `Advance: prev = ${prev.id}, ptr = ${this.label(curr)}; check ${curr.id}.next (${this.ref(curr.next)}).`, [curr.id]);
    }
    if (curr.next === null) {
      t.step('error', `Reached the tail: ${this.targetLabel(target)} not found, nothing deleted.`);
      return t.finish({ ok: false, reason: 'not-found' });
    }
    t.step('found', `${curr.id}.next is the target ${this.label(curr.next)}, so delete ${curr.id}.`, [curr.next.id, curr.id]);
    prev.next = curr.next;
    this.floating = curr;
    t.step('unlink', `${prev.id}.next = ${curr.id}.next (${curr.next.id}); ${curr.id} is unlinked.`, [curr.id, prev.id]);
    this.release(t, curr);
    return t.finish({ ok: true, id: curr.id, value: curr.value, case: 'general' });
  }

  /** Removes the head node. O(1). */
  deleteFirst(): Traced<ListDeleteFirstResult<T>, LinkedListSnapshot<T>> {
    const t = this.tracer();
    const head = this.head;
    if (head === null) {
      t.step('error', 'Underflow: head is NULL, so there is nothing to delete.');
      return t.finish({ ok: false, reason: 'empty' });
    }
    this.head = head.next;
    this.floating = head;
    t.step('unlink', `head = ${head.id}.next (${this.ref(head.next)}); ${head.id} is unlinked.`, [head.id]);
    this.release(t, head);
    return t.finish({ ok: true, id: head.id, value: head.value });
  }

  /** Walks from head and returns the first node satisfying `pred`. O(n). */
  find(pred: (value: T, id: string) => boolean): Traced<ListFindResult<T> | null, LinkedListSnapshot<T>> {
    let cached: LinkedListSnapshot<T> | null = null;
    const t = new Tracer<LinkedListSnapshot<T>>(() => (cached ??= this.snapshot()), this.maxSteps);
    let index = 0;
    for (let p = this.head; p !== null; p = p.next, index++) {
      if (pred(p.value, p.id)) {
        t.step('found', `Visit ${this.label(p)}: match at position ${index}.`, [p.id]);
        return t.finish({ id: p.id, value: p.value, index });
      }
      t.step('visit', `Visit ${this.label(p)}: no match, move to next (${this.ref(p.next)}).`, [p.id]);
    }
    t.step('not-found', 'Reached NULL: no node matches.');
    return t.finish(null);
  }

  /** Values from head to tail. */
  toArray(): T[] {
    const out: T[] = [];
    for (let p = this.head; p !== null; p = p.next) out.push(p.value);
    return out;
  }

  /** `{ id, value }` pairs from head to tail (tabular display). */
  entries(): { id: string; value: T }[] {
    const out: { id: string; value: T }[] = [];
    for (let p = this.head; p !== null; p = p.next) out.push({ id: p.id, value: p.value });
    return out;
  }

  /** Deep copy of the list in head-to-tail order. */
  snapshot(): LinkedListSnapshot<T> {
    const nodes: ListNodeView<T>[] = [];
    for (let p = this.head; p !== null; p = p.next) nodes.push(this.view(p));
    const snap: LinkedListSnapshot<T> = { head: this.idOf(this.head), nodes };
    if (this.floating !== null) snap.floating = this.view(this.floating);
    return snap;
  }

  private view(node: SllNode<T>): ListNodeView<T> {
    return { id: node.id, value: deepClone(node.value), next: this.idOf(node.next) };
  }

  /** Frees an already-unlinked node and records the 'delete' step. */
  private release(t: Tracer<LinkedListSnapshot<T>>, node: SllNode<T>): void {
    node.next = null;
    this.floating = null;
    this.count--;
    t.step('delete', `Free ${this.label(node)}.`, [node.id]);
  }

  private alloc(value: T): SllNode<T> {
    return { id: `n${this.nextId++}`, value, next: null };
  }

  private matcher(target: NodeTarget<T>): (node: SllNode<T>) => boolean {
    if (typeof target === 'string') return (node) => node.id === target;
    return (node) => target(node.value, node.id);
  }

  private targetLabel(target: NodeTarget<T>): string {
    return typeof target === 'string' ? `node ${target}` : 'the target';
  }

  private label(node: SllNode<T>): string {
    return `${node.id} (${this.describe(node.value)})`;
  }

  private idOf(node: SllNode<T> | null): string | null {
    return node === null ? null : node.id;
  }

  /** Pointer label for messages: the node id, or NULL. */
  private ref(node: SllNode<T> | null): string {
    return node === null ? 'NULL' : node.id;
  }

  private tracer(): Tracer<LinkedListSnapshot<T>> {
    return new Tracer(() => this.snapshot(), this.maxSteps);
  }
}
