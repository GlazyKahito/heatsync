/**
 * EXP5 - Binary search tree with doubly linked nodes.
 *
 * Each node holds `key`, `value` and two child pointers (`left`, `right`).
 * Keys are ordered by a caller-supplied comparator; duplicates are rejected.
 * Two-children deletion relinks the in-order successor node into the deleted
 * node's place, so every id keeps its own key and value across snapshots.
 * Powers the HEATSYNC Hotspot Index (use a composite key such as
 * `[score, districtId]` when scores can tie).
 */
import { DEFAULT_MAX_STEPS, Tracer, deepClone, describeValue, type Traced } from './trace';

/** Node as it appears in a snapshot; children are ids. */
export interface BSTNodeView<K, V> {
  id: string;
  key: K;
  value: V;
  left: string | null;
  right: string | null;
}

/** Immutable view of a {@link BST}; `nodes` are in preorder (root first). */
export interface BSTSnapshot<K, V> {
  root: string | null;
  nodes: BSTNodeView<K, V>[];
}

export interface BSTEntry<K, V> {
  id: string;
  key: K;
  value: V;
}

/** Drawing coordinates: `x` = in-order index, `y` = depth (root 0). */
export interface BSTLayoutNode<K, V> extends BSTEntry<K, V> {
  x: number;
  y: number;
  parent: string | null;
}

export type BSTInsertResult = { ok: true; id: string } | { ok: false; reason: 'duplicate'; id: string };

export interface BSTSearchResult<V> {
  found: boolean;
  id: string | null;
  value?: V;
  /** Ids visited from the root. */
  path: string[];
}

export type BSTDeleteCase = 'leaf' | 'one-child' | 'two-children';

export type BSTDeleteResult<K, V> =
  | {
      ok: true;
      deleted: BSTEntry<K, V>;
      case: BSTDeleteCase;
      /** Node that took the deleted node's place (child or successor), or null for a leaf. */
      replacementId: string | null;
    }
  | { ok: false; reason: 'not-found' };

export interface BSTOptions<K> {
  /** Step cap per operation (default 5000, 0 disables recording). */
  maxSteps?: number;
  /** Label used for keys in step messages. */
  describeKey?: (key: K) => string;
}

interface TreeNode<K, V> {
  id: string;
  key: K;
  value: V;
  left: TreeNode<K, V> | null;
  right: TreeNode<K, V> | null;
}

type Order = 'in' | 'reverse' | 'pre' | 'post';

export class BST<K, V> {
  /** Step cap per operation; may be changed at any time (0 disables recording). */
  maxSteps: number;
  private root: TreeNode<K, V> | null = null;
  private count = 0;
  private nextId = 1;
  private readonly cmp: (a: K, b: K) => number;
  private readonly describeKey: (key: K) => string;

  constructor(compare: (a: K, b: K) => number, options: BSTOptions<K> = {}) {
    this.cmp = compare;
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    this.describeKey = options.describeKey ?? describeValue;
  }

  get size(): number {
    return this.count;
  }

  get rootId(): string | null {
    return this.root === null ? null : this.root.id;
  }

  isEmpty(): boolean {
    return this.root === null;
  }

  /** Number of levels: 0 for an empty tree, 1 for a single node. O(n). */
  height(): number {
    const h = (node: TreeNode<K, V> | null): number => {
      if (node === null) return 0;
      const l = h(node.left);
      const r = h(node.right);
      return 1 + (l > r ? l : r);
    };
    return h(this.root);
  }

  /** Iterative insert from the root. O(h). A duplicate key records an 'error' step and inserts nothing. */
  insert(key: K, value: V): Traced<BSTInsertResult, BSTSnapshot<K, V>> {
    const t = this.tracer();
    const k = this.describeKey(key);
    if (this.root === null) {
      this.root = this.alloc(key, value);
      this.count++;
      t.step('insert', `The tree is empty: ${this.root.id} (${k}) becomes the root.`, [this.root.id]);
      return t.finish({ ok: true, id: this.root.id });
    }
    let curr: TreeNode<K, V> = this.root;
    for (;;) {
      const c = this.cmp(key, curr.key);
      if (c === 0) {
        t.step('error', `Key ${k} already exists at ${curr.id}; duplicates are not inserted.`, [curr.id]);
        return t.finish({ ok: false, reason: 'duplicate', id: curr.id });
      }
      const goLeft = c < 0;
      const next: TreeNode<K, V> | null = goLeft ? curr.left : curr.right;
      t.step('compare', `Compare ${k} with ${this.describeKey(curr.key)} at ${curr.id}: go ${goLeft ? 'left' : 'right'}.`, [curr.id]);
      if (next === null) {
        const node = this.alloc(key, value);
        if (goLeft) curr.left = node;
        else curr.right = node;
        this.count++;
        t.step('insert', `${curr.id}.${goLeft ? 'left' : 'right'} is NULL: attach ${node.id} (${k}) there.`, [node.id, curr.id]);
        return t.finish({ ok: true, id: node.id });
      }
      curr = next;
    }
  }

  /** Iterative search; every visited node is a step. O(h). */
  search(key: K): Traced<BSTSearchResult<V>, BSTSnapshot<K, V>> {
    const t = this.tracer(true);
    const k = this.describeKey(key);
    const path: string[] = [];
    let curr = this.root;
    while (curr !== null) {
      path.push(curr.id);
      const c = this.cmp(key, curr.key);
      if (c === 0) {
        t.step('found', `Compare ${k} with ${this.describeKey(curr.key)} at ${curr.id}: equal, found.`, [curr.id]);
        return t.finish({ found: true, id: curr.id, value: curr.value, path });
      }
      t.step('compare', `Compare ${k} with ${this.describeKey(curr.key)} at ${curr.id}: go ${c < 0 ? 'left' : 'right'}.`, [curr.id]);
      curr = c < 0 ? curr.left : curr.right;
    }
    t.step('not-found', this.root === null ? 'The tree is empty.' : `Reached NULL: ${k} is not in the tree.`);
    return t.finish({ found: false, id: null, path });
  }

  /**
   * Deletes `key`. O(h). Cases:
   * leaf (unlink), one child (splice the child up), two children (replace the
   * node with its in-order successor, the leftmost node of the right subtree).
   */
  delete(key: K): Traced<BSTDeleteResult<K, V>, BSTSnapshot<K, V>> {
    const t = this.tracer();
    const k = this.describeKey(key);
    let parent: TreeNode<K, V> | null = null;
    let curr = this.root;
    while (curr !== null) {
      const c = this.cmp(key, curr.key);
      if (c === 0) break;
      t.step('compare', `Compare ${k} with ${this.describeKey(curr.key)} at ${curr.id}: go ${c < 0 ? 'left' : 'right'}.`, [curr.id]);
      parent = curr;
      curr = c < 0 ? curr.left : curr.right;
    }
    if (curr === null) {
      t.step('error', `${k} is not in the tree; nothing deleted.`);
      return t.finish({ ok: false, reason: 'not-found' });
    }
    const target = curr;
    const deleted: BSTEntry<K, V> = { id: target.id, key: target.key, value: target.value };
    const where = parent === null ? 'the root' : `${parent.id}.${parent.left === target ? 'left' : 'right'}`;
    t.step('found', `Found ${k} at ${target.id} (${where}).`, [target.id]);

    if (target.left === null && target.right === null) {
      this.replaceChild(parent, target, null);
      this.count--;
      t.step(
        'delete',
        parent === null
          ? `Case leaf: ${target.id} was the only node, so the tree is now empty.`
          : `Case leaf: set ${where} = NULL and free ${target.id}.`,
        [target.id],
      );
      return t.finish({ ok: true, deleted, case: 'leaf', replacementId: null });
    }

    if (target.left === null || target.right === null) {
      const child = (target.left ?? target.right) as TreeNode<K, V>;
      this.replaceChild(parent, target, child);
      this.count--;
      t.step(
        'delete',
        parent === null
          ? `Case one child: ${child.id} becomes the new root; free ${target.id}.`
          : `Case one child: set ${where} = ${child.id} and free ${target.id}.`,
        [child.id],
      );
      return t.finish({ ok: true, deleted, case: 'one-child', replacementId: child.id });
    }

    t.step('successor', `Case two children: find the in-order successor, the smallest key in ${target.id}'s right subtree.`, [target.id]);
    let succParent = target;
    let succ = target.right;
    t.step('visit', `Go right to ${succ.id} (${this.describeKey(succ.key)}).`, [succ.id]);
    while (succ.left !== null) {
      succParent = succ;
      succ = succ.left;
      t.step('visit', `Go left to ${succ.id} (${this.describeKey(succ.key)}).`, [succ.id]);
    }
    t.step('found', `In-order successor is ${succ.id} (${this.describeKey(succ.key)}); it has no left child.`, [succ.id]);
    const detach = succParent !== target ? ` ${succParent.id}.left = ${succ.id}.right (${idOf(succ.right) ?? 'NULL'});` : '';
    if (succParent !== target) {
      succParent.left = succ.right;
      succ.right = target.right;
    }
    succ.left = target.left;
    this.replaceChild(parent, target, succ);
    this.count--;
    t.step(
      'delete',
      `Replace ${target.id} with ${succ.id}:${detach} ${succ.id} adopts ${target.id}'s children; free ${target.id}.`,
      [succ.id],
    );
    return t.finish({ ok: true, deleted, case: 'two-children', replacementId: succ.id });
  }

  /** Ascending order (left, node, right). O(n). */
  inorder(): Traced<BSTEntry<K, V>[], BSTSnapshot<K, V>> {
    return this.traverse('in');
  }

  /** Descending order (right, node, left): the live hotspot ranking. O(n). */
  reverseInorder(): Traced<BSTEntry<K, V>[], BSTSnapshot<K, V>> {
    return this.traverse('reverse');
  }

  /** Node, left, right. O(n). */
  preorder(): Traced<BSTEntry<K, V>[], BSTSnapshot<K, V>> {
    return this.traverse('pre');
  }

  /** Left, right, node. O(n). */
  postorder(): Traced<BSTEntry<K, V>[], BSTSnapshot<K, V>> {
    return this.traverse('post');
  }

  /** Ascending entries without steps. O(n). */
  toArray(): BSTEntry<K, V>[] {
    const out: BSTEntry<K, V>[] = [];
    const walk = (node: TreeNode<K, V> | null): void => {
      if (node === null) return;
      walk(node.left);
      out.push({ id: node.id, key: node.key, value: node.value });
      walk(node.right);
    };
    walk(this.root);
    return out;
  }

  /**
   * All entries with `lo <= key <= hi`, ascending. Subtrees that cannot
   * contain keys in range are pruned. O(h + k).
   */
  rangeQuery(lo: K, hi: K): Traced<BSTEntry<K, V>[], BSTSnapshot<K, V>> {
    const t = this.tracer(true);
    const out: BSTEntry<K, V>[] = [];
    const range = `[${this.describeKey(lo)}, ${this.describeKey(hi)}]`;
    if (this.cmp(lo, hi) > 0) {
      t.step('error', `Invalid range ${range}: lower bound exceeds upper bound.`);
      return t.finish(out);
    }
    const walk = (node: TreeNode<K, V> | null): void => {
      if (node === null) return;
      const k = this.describeKey(node.key);
      t.step('visit', `Visit ${node.id} (${k}) and compare with ${range}.`, [node.id]);
      if (this.cmp(lo, node.key) < 0) walk(node.left);
      else if (node.left !== null) t.step('prune', `${k} <= ${this.describeKey(lo)}: skip the left subtree of ${node.id}.`, [node.id]);
      if (this.cmp(lo, node.key) <= 0 && this.cmp(node.key, hi) <= 0) {
        out.push({ id: node.id, key: node.key, value: node.value });
        t.step('collect', `${k} is inside ${range}: collect ${node.id}.`, [node.id]);
      }
      if (this.cmp(node.key, hi) < 0) walk(node.right);
      else if (node.right !== null) t.step('prune', `${k} >= ${this.describeKey(hi)}: skip the right subtree of ${node.id}.`, [node.id]);
    };
    walk(this.root);
    t.step('done', `${out.length} node(s) in ${range}.`);
    return t.finish(out);
  }

  /** Leftmost node. O(h). */
  min(): Traced<BSTEntry<K, V> | null, BSTSnapshot<K, V>> {
    return this.extreme('left');
  }

  /** Rightmost node. O(h). */
  max(): Traced<BSTEntry<K, V> | null, BSTSnapshot<K, V>> {
    return this.extreme('right');
  }

  /** Coordinates for drawing: x = in-order index, y = depth. Listed in order of x. */
  layout(): BSTLayoutNode<K, V>[] {
    const out: BSTLayoutNode<K, V>[] = [];
    const walk = (node: TreeNode<K, V> | null, depth: number, parent: string | null): void => {
      if (node === null) return;
      walk(node.left, depth + 1, node.id);
      out.push({ id: node.id, key: deepClone(node.key), value: deepClone(node.value), x: out.length, y: depth, parent });
      walk(node.right, depth + 1, node.id);
    };
    walk(this.root, 0, null);
    return out;
  }

  /** Removes every node. */
  clear(): void {
    this.root = null;
    this.count = 0;
  }

  /** Deep copy of the tree, nodes in preorder. */
  snapshot(): BSTSnapshot<K, V> {
    const nodes: BSTNodeView<K, V>[] = [];
    const walk = (node: TreeNode<K, V> | null): void => {
      if (node === null) return;
      nodes.push({
        id: node.id,
        key: deepClone(node.key),
        value: deepClone(node.value),
        left: idOf(node.left),
        right: idOf(node.right),
      });
      walk(node.left);
      walk(node.right);
    };
    walk(this.root);
    return { root: idOf(this.root), nodes };
  }

  private traverse(order: Order): Traced<BSTEntry<K, V>[], BSTSnapshot<K, V>> {
    const t = this.tracer(true);
    const out: BSTEntry<K, V>[] = [];
    const visit = (node: TreeNode<K, V>): void => {
      out.push({ id: node.id, key: node.key, value: node.value });
      t.step('visit', `Visit ${node.id} (${this.describeKey(node.key)}): output #${out.length}.`, [node.id]);
    };
    const walk = (node: TreeNode<K, V> | null): void => {
      if (node === null) return;
      if (order === 'pre') visit(node);
      walk(order === 'reverse' ? node.right : node.left);
      if (order === 'in' || order === 'reverse') visit(node);
      walk(order === 'reverse' ? node.left : node.right);
      if (order === 'post') visit(node);
    };
    walk(this.root);
    if (this.root === null) t.step('done', 'The tree is empty.');
    return t.finish(out);
  }

  private extreme(side: 'left' | 'right'): Traced<BSTEntry<K, V> | null, BSTSnapshot<K, V>> {
    const t = this.tracer(true);
    let curr = this.root;
    if (curr === null) {
      t.step('error', 'The tree is empty.');
      return t.finish(null);
    }
    for (let next = curr[side]; next !== null; next = curr[side]) {
      t.step('visit', `At ${curr.id} (${this.describeKey(curr.key)}): ${side} child exists, go ${side}.`, [curr.id]);
      curr = next;
    }
    t.step('found', `${curr.id} (${this.describeKey(curr.key)}) has no ${side} child: it is the ${side === 'left' ? 'minimum' : 'maximum'}.`, [curr.id]);
    return t.finish({ id: curr.id, key: curr.key, value: curr.value });
  }

  private replaceChild(parent: TreeNode<K, V> | null, old: TreeNode<K, V>, replacement: TreeNode<K, V> | null): void {
    if (parent === null) this.root = replacement;
    else if (parent.left === old) parent.left = replacement;
    else parent.right = replacement;
  }

  private alloc(key: K, value: V): TreeNode<K, V> {
    return { id: `n${this.nextId++}`, key, value, left: null, right: null };
  }

  private tracer(readOnly = false): Tracer<BSTSnapshot<K, V>> {
    if (!readOnly) return new Tracer(() => this.snapshot(), this.maxSteps);
    let cached: BSTSnapshot<K, V> | null = null;
    return new Tracer(() => (cached ??= this.snapshot()), this.maxSteps);
  }
}

function idOf<K, V>(node: TreeNode<K, V> | null): string | null {
  return node === null ? null : node.id;
}
