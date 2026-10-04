import { describe, expect, it } from 'vitest';
import { BST, type BSTSnapshot } from '../bst';
import { compareNumbers } from '../trace';

function treeOf(keys: number[]): BST<number, string> {
  const t = new BST<number, string>(compareNumbers);
  for (const k of keys) t.insert(k, `v${k}`);
  return t;
}

const keysIn = (t: BST<number, string>): number[] => t.inorder().result.map((e) => e.key);

/** Verifies the BST ordering property and parent/child consistency of a snapshot. */
function expectValidBst(s: BSTSnapshot<number, string>): void {
  const byId: Record<string, { key: number; left: string | null; right: string | null }> = {};
  for (const n of s.nodes) byId[n.id] = n;
  let seen = 0;
  const check = (id: string | null, lo: number, hi: number): void => {
    if (id === null) return;
    const n = byId[id];
    expect(n).toBeDefined();
    seen++;
    expect(n.key).toBeGreaterThan(lo);
    expect(n.key).toBeLessThan(hi);
    check(n.left, lo, n.key);
    check(n.right, n.key, hi);
  };
  check(s.root, -Infinity, Infinity);
  expect(seen).toBe(s.nodes.length);
}

//          50
//       30     70
//     20  40  60  80
//            55  65
const BASE = [50, 30, 70, 20, 40, 60, 80, 55, 65];

describe('BST insert / search', () => {
  it('first insert creates the root', () => {
    const t = new BST<number, string>(compareNumbers);
    const r = t.insert(10, 'a');
    expect(r.result).toEqual({ ok: true, id: 'n1' });
    expect(r.steps.map((s) => s.kind)).toEqual(['insert']);
    expect(t.rootId).toBe('n1');
    expect(t.size).toBe(1);
  });

  it('insert compares down the tree and attaches a leaf', () => {
    const t = treeOf([50, 30, 70]);
    const r = t.insert(40, 'x');
    expect(r.steps.map((s) => s.kind)).toEqual(['compare', 'compare', 'insert']);
    expect(r.steps[0].message).toContain('go left');
    expect(r.steps[1].message).toContain('go right');
    const snap = r.steps[2].snapshot;
    const n30 = snap.nodes.find((n) => n.key === 30);
    expect(n30?.right).toBe(r.result.ok ? r.result.id : null);
    expectValidBst(snap);
  });

  it('rejects duplicate keys with an error step', () => {
    const t = treeOf([50, 30, 70]);
    const r = t.insert(30, 'dup');
    expect(r.result).toEqual({ ok: false, reason: 'duplicate', id: 'n2' });
    expect(r.steps.at(-1)?.kind).toBe('error');
    expect(t.size).toBe(3);
    expect(t.search(30).result.value).toBe('v30');
  });

  it('search records the visited path', () => {
    const t = treeOf(BASE);
    const r = t.search(65);
    expect(r.result.found).toBe(true);
    expect(r.result.value).toBe('v65');
    expect(r.result.path).toHaveLength(4);
    expect(r.steps.map((s) => s.kind)).toEqual(['compare', 'compare', 'compare', 'found']);
    expect(r.steps.map((s) => s.focus?.[0])).toEqual(r.result.path);
    const miss = t.search(66);
    expect(miss.result).toEqual({ found: false, id: null, path: miss.result.path });
    expect(miss.result.path).toHaveLength(4);
    expect(miss.steps.at(-1)?.kind).toBe('not-found');
    expect(new BST<number, string>(compareNumbers).search(1).result.found).toBe(false);
  });
});

describe('BST traversals and queries', () => {
  it('in-order, reverse in-order, preorder and postorder', () => {
    const t = treeOf(BASE);
    expect(keysIn(t)).toEqual([20, 30, 40, 50, 55, 60, 65, 70, 80]);
    expect(t.reverseInorder().result.map((e) => e.key)).toEqual([80, 70, 65, 60, 55, 50, 40, 30, 20]);
    expect(t.preorder().result.map((e) => e.key)).toEqual([50, 30, 20, 40, 70, 60, 55, 65, 80]);
    expect(t.postorder().result.map((e) => e.key)).toEqual([20, 40, 30, 55, 65, 60, 80, 70, 50]);
    const r = t.inorder();
    expect(r.steps).toHaveLength(9);
    expect(r.steps.every((s) => s.kind === 'visit')).toBe(true);
    expect(t.toArray().map((e) => e.key)).toEqual(keysIn(t));
  });

  it('min, max and height', () => {
    const t = treeOf(BASE);
    const mn = t.min();
    expect(mn.result?.key).toBe(20);
    expect(mn.steps.map((s) => s.kind)).toEqual(['visit', 'visit', 'found']);
    expect(t.max().result?.key).toBe(80);
    expect(t.height()).toBe(4);
    const empty = new BST<number, string>(compareNumbers);
    expect(empty.min().result).toBeNull();
    expect(empty.max().steps[0].kind).toBe('error');
    expect(empty.height()).toBe(0);
    expect(treeOf([1]).height()).toBe(1);
    expect(treeOf([1, 2, 3, 4]).height()).toBe(4);
  });

  it('rangeQuery is inclusive and prunes subtrees', () => {
    const t = treeOf(BASE);
    const r = t.rangeQuery(55, 70);
    expect(r.result.map((e) => e.key)).toEqual([55, 60, 65, 70]);
    const kinds = r.steps.map((s) => s.kind);
    expect(kinds).toContain('prune');
    expect(kinds.filter((k) => k === 'collect')).toHaveLength(4);
    const visited = r.steps.filter((s) => s.kind === 'visit').length;
    expect(visited).toBeLessThan(t.size);
    expect(t.rangeQuery(0, 100).result).toHaveLength(9);
    expect(t.rangeQuery(41, 49).result).toEqual([]);
    expect(t.rangeQuery(50, 50).result.map((e) => e.key)).toEqual([50]);
  });

  it('rangeQuery rejects an inverted range', () => {
    const r = treeOf(BASE).rangeQuery(70, 10);
    expect(r.result).toEqual([]);
    expect(r.steps[0].kind).toBe('error');
  });

  it('layout gives x = in-order index and y = depth', () => {
    const t = treeOf([50, 30, 70, 40]);
    const lay = t.layout();
    expect(lay.map((n) => [n.key, n.x, n.y])).toEqual([
      [30, 0, 1],
      [40, 1, 2],
      [50, 2, 0],
      [70, 3, 1],
    ]);
    const byKey = (k: number) => lay.find((n) => n.key === k);
    expect(byKey(50)?.parent).toBeNull();
    expect(byKey(40)?.parent).toBe(byKey(30)?.id);
  });

  it('snapshot lists nodes in preorder with child ids', () => {
    const t = treeOf([2, 1, 3]);
    expect(t.snapshot()).toEqual({
      root: 'n1',
      nodes: [
        { id: 'n1', key: 2, value: 'v2', left: 'n2', right: 'n3' },
        { id: 'n2', key: 1, value: 'v1', left: null, right: null },
        { id: 'n3', key: 3, value: 'v3', left: null, right: null },
      ],
    });
  });
});

describe('BST delete', () => {
  it('case leaf', () => {
    const t = treeOf(BASE);
    const r = t.delete(20);
    expect(r.result.ok && r.result.case).toBe('leaf');
    expect(r.result.ok && r.result.replacementId).toBeNull();
    expect(keysIn(t)).toEqual([30, 40, 50, 55, 60, 65, 70, 80]);
    expect(t.size).toBe(8);
    expect(r.steps.at(-1)?.kind).toBe('delete');
    expectValidBst(t.snapshot());
  });

  it('case one child (right child only and left child only)', () => {
    const t = treeOf(BASE);
    t.delete(20);
    const r = t.delete(30);
    expect(r.result.ok && r.result.case).toBe('one-child');
    const n40 = t.search(40).result.id;
    expect(r.result.ok && r.result.replacementId).toBe(n40);
    expect(t.snapshot().nodes.find((n) => n.key === 50)?.left).toBe(n40);
    expectValidBst(t.snapshot());

    const u = treeOf([50, 30, 20]);
    const r2 = u.delete(30);
    expect(r2.result.ok && r2.result.case).toBe('one-child');
    expect(keysIn(u)).toEqual([20, 50]);
    expectValidBst(u.snapshot());
  });

  it('case two children where the successor is the right child', () => {
    const t = treeOf([50, 30, 70, 20, 40, 60, 80]);
    const succ = t.search(80).result.id;
    const r = t.delete(70);
    expect(r.result.ok && r.result.case).toBe('two-children');
    expect(keysIn(t)).toEqual([20, 30, 40, 50, 60, 80]);
    expect(t.snapshot().nodes.find((n) => n.key === 80)?.left).toBe(t.search(60).result.id);
    expect(r.result.ok && r.result.replacementId).toBe(succ);
    expectValidBst(t.snapshot());
  });

  it('case two children with a deep successor keeps ids attached to keys', () => {
    const t = treeOf(BASE);
    t.insert(57, 'v57');
    const id55 = t.search(55).result.id;
    const id70 = t.search(70).result.id;
    const r = t.delete(50);
    expect(r.result.ok && r.result.case).toBe('two-children');
    expect(r.result.ok && r.result.deleted).toEqual({ id: 'n1', key: 50, value: 'v50' });
    expect(r.result.ok && r.result.replacementId).toBe(id55);
    expect(t.rootId).toBe(id55);
    const snap = t.snapshot();
    expect(snap.nodes.find((n) => n.id === id55)?.key).toBe(55);
    expect(snap.nodes.find((n) => n.key === 60)?.left).toBe(t.search(57).result.id);
    expect(snap.nodes.find((n) => n.id === id55)?.right).toBe(id70);
    expect(snap.nodes.some((n) => n.id === 'n1')).toBe(false);
    expect(keysIn(t)).toEqual([20, 30, 40, 55, 57, 60, 65, 70, 80]);
    expect(r.steps.map((s) => s.kind)).toEqual(['found', 'successor', 'visit', 'visit', 'visit', 'found', 'delete']);
    expectValidBst(snap);
  });

  it('deletes the root in every shape', () => {
    const only = treeOf([5]);
    expect(only.delete(5).result.ok).toBe(true);
    expect(only.rootId).toBeNull();
    expect(only.size).toBe(0);

    const oneChild = treeOf([5, 8, 9]);
    const r = oneChild.delete(5);
    expect(r.result.ok && r.result.case).toBe('one-child');
    expect(oneChild.snapshot().nodes[0].key).toBe(8);

    const two = treeOf([5, 3, 8]);
    two.delete(5);
    expect(two.snapshot().nodes[0].key).toBe(8);
    expect(keysIn(two)).toEqual([3, 8]);
  });

  it('reports a missing key', () => {
    const t = treeOf(BASE);
    const r = t.delete(99);
    expect(r.result).toEqual({ ok: false, reason: 'not-found' });
    expect(r.steps.at(-1)?.kind).toBe('error');
    expect(t.size).toBe(9);
    expect(new BST<number, string>(compareNumbers).delete(1).result.ok).toBe(false);
  });

  it('stays valid through a long random insert/delete sequence', () => {
    const t = new BST<number, number>(compareNumbers, { maxSteps: 0 });
    const present = new Set<number>();
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) % 200;
    for (let i = 0; i < 600; i++) {
      const k = rand();
      if (i % 3 === 2) {
        expect(t.delete(k).result.ok).toBe(present.delete(k));
      } else {
        expect(t.insert(k, k).result.ok).toBe(!present.has(k));
        present.add(k);
      }
      expect(t.size).toBe(present.size);
    }
    const keys = t.toArray().map((e) => e.key);
    expect(keys).toEqual([...present].sort((a, b) => a - b));
  });
});

describe('BST with composite keys', () => {
  it('ranks districts by score with id tie-break', () => {
    type Key = [number, number];
    const cmp = (a: Key, b: Key) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
    const t = new BST<Key, string>(cmp, { describeKey: (k) => `${k[0]}` });
    t.insert([72, 3], 'Nagpur');
    t.insert([72, 1], 'Akola');
    t.insert([65, 9], 'Pune');
    t.insert([80, 2], 'Chandrapur');
    expect(t.reverseInorder().result.map((e) => e.value)).toEqual(['Chandrapur', 'Nagpur', 'Akola', 'Pune']);
    expect(t.rangeQuery([70, -Infinity], [75, Infinity]).result.map((e) => e.value)).toEqual(['Akola', 'Nagpur']);
  });

  it('step snapshots are not affected by later mutations', () => {
    const t = treeOf([2, 1]);
    const r = t.insert(3, 'v3');
    t.delete(2);
    expect(r.steps.at(-1)?.snapshot.nodes.map((n) => n.key)).toEqual([2, 1, 3]);
  });
});
