import { describe, expect, it } from 'vitest';
import { SinglyLinkedList, type LinkedListSnapshot } from '../linked-list';

/** Builds a list whose order is `values` (head first). */
function listOf(values: string[]): SinglyLinkedList<string> {
  const l = new SinglyLinkedList<string>();
  for (let i = values.length - 1; i >= 0; i--) l.insertAtBegin(values[i]);
  return l;
}

/** Checks that snapshot nodes form a proper chain from head. */
function expectChain<T>(s: LinkedListSnapshot<T>): void {
  expect(s.head).toBe(s.nodes.length === 0 ? null : s.nodes[0].id);
  s.nodes.forEach((n, i) => expect(n.next).toBe(i + 1 < s.nodes.length ? s.nodes[i + 1].id : null));
}

describe('SinglyLinkedList', () => {
  it('insertAtBegin puts the newest node first with stable ids', () => {
    const l = new SinglyLinkedList<string>();
    const a = l.insertAtBegin('A');
    const b = l.insertAtBegin('B');
    expect(a.result.id).toBe('n1');
    expect(b.result.id).toBe('n2');
    expect(l.toArray()).toEqual(['B', 'A']);
    expect(l.headId).toBe('n2');
    expect(l.size).toBe(2);
    expect(b.steps.map((s) => s.kind)).toEqual(['alloc', 'insert']);
    expect(b.steps[0].snapshot.floating).toEqual({ id: 'n2', value: 'B', next: 'n1' });
    expect(b.steps[0].snapshot.head).toBe('n1');
    expect(b.steps[1].snapshot.floating).toBeUndefined();
    expectChain(l.snapshot());
  });

  it('insertAfter by id inserts in the middle with a step per hop', () => {
    const l = listOf(['A', 'B', 'C']);
    const ids = l.entries().map((e) => e.id);
    const r = l.insertAfter(ids[1], 'X');
    expect(r.result.ok).toBe(true);
    expect(l.toArray()).toEqual(['A', 'B', 'X', 'C']);
    expect(r.steps.map((s) => s.kind)).toEqual(['visit', 'found', 'alloc', 'insert']);
    expect(r.steps[0].focus).toEqual([ids[0]]);
    expectChain(l.snapshot());
  });

  it('insertAfter by predicate works at the tail', () => {
    const l = listOf(['A', 'B']);
    const r = l.insertAfter((v) => v === 'B', 'Z');
    expect(r.result.ok).toBe(true);
    expect(l.toArray()).toEqual(['A', 'B', 'Z']);
    expectChain(l.snapshot());
  });

  it('insertAfter reports empty list and missing target', () => {
    const empty = new SinglyLinkedList<string>().insertAfter('n1', 'X');
    expect(empty.result).toEqual({ ok: false, reason: 'empty' });
    expect(empty.steps[0].kind).toBe('error');
    const l = listOf(['A', 'B']);
    const r = l.insertAfter('n99', 'X');
    expect(r.result).toEqual({ ok: false, reason: 'not-found' });
    expect(r.steps.map((s) => s.kind)).toEqual(['visit', 'visit', 'error']);
    expect(l.size).toBe(2);
  });

  it('deleteBefore: empty list', () => {
    const r = new SinglyLinkedList<string>().deleteBefore('n1');
    expect(r.result).toEqual({ ok: false, reason: 'empty' });
  });

  it('deleteBefore: target is head is an error', () => {
    const l = listOf(['A', 'B', 'C']);
    const head = l.headId as string;
    const r = l.deleteBefore(head);
    expect(r.result).toEqual({ ok: false, reason: 'no-predecessor' });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].kind).toBe('error');
    expect(r.steps[0].focus).toEqual([head]);
    expect(l.toArray()).toEqual(['A', 'B', 'C']);
  });

  it('deleteBefore: target is the 2nd node deletes the head', () => {
    const l = listOf(['A', 'B', 'C']);
    const [a, b] = l.entries();
    const r = l.deleteBefore(b.id);
    expect(r.result).toEqual({ ok: true, id: a.id, value: 'A', case: 'head' });
    expect(l.toArray()).toEqual(['B', 'C']);
    expect(l.headId).toBe(b.id);
    expect(r.steps.map((s) => s.kind)).toEqual(['found', 'unlink', 'delete']);
    expect(r.steps[1].snapshot.floating?.id).toBe(a.id);
    expect(r.steps[1].snapshot.head).toBe(b.id);
    expect(r.steps[2].snapshot.floating).toBeUndefined();
    expect(l.size).toBe(2);
  });

  it('deleteBefore: general case walks to the predecessor', () => {
    const l = listOf(['A', 'B', 'C', 'D', 'E']);
    const ids = l.entries().map((e) => e.id);
    const r = l.deleteBefore((v) => v === 'E');
    expect(r.result).toEqual({ ok: true, id: ids[3], value: 'D', case: 'general' });
    expect(l.toArray()).toEqual(['A', 'B', 'C', 'E']);
    expect(r.steps.filter((s) => s.kind === 'visit')).toHaveLength(3);
    expect(r.steps.slice(-3).map((s) => s.kind)).toEqual(['found', 'unlink', 'delete']);
    expectChain(l.snapshot());
    const r2 = l.deleteBefore(ids[2]);
    expect(r2.result.ok && r2.result.value).toBe('B');
    expect(l.toArray()).toEqual(['A', 'C', 'E']);
  });

  it('deleteBefore: target not found', () => {
    const single = listOf(['A']);
    expect(single.deleteBefore('n42').result).toEqual({ ok: false, reason: 'not-found' });
    const l = listOf(['A', 'B', 'C']);
    const r = l.deleteBefore((v) => v === 'Q');
    expect(r.result).toEqual({ ok: false, reason: 'not-found' });
    expect(r.steps.at(-1)?.kind).toBe('error');
    expect(l.toArray()).toEqual(['A', 'B', 'C']);
  });

  it('deleteFirst removes the head and reports underflow', () => {
    const l = listOf(['A', 'B']);
    const r = l.deleteFirst();
    expect(r.result).toEqual({ ok: true, id: 'n2', value: 'A' });
    expect(r.steps.map((s) => s.kind)).toEqual(['unlink', 'delete']);
    l.deleteFirst();
    expect(l.isEmpty()).toBe(true);
    const e = l.deleteFirst();
    expect(e.result).toEqual({ ok: false, reason: 'empty' });
    expect(e.steps[0].kind).toBe('error');
  });

  it('find returns position and steps each hop', () => {
    const l = listOf(['A', 'B', 'C']);
    const r = l.find((v) => v === 'C');
    expect(r.result?.value).toBe('C');
    expect(r.result?.index).toBe(2);
    expect(r.steps.map((s) => s.kind)).toEqual(['visit', 'visit', 'found']);
    const miss = l.find((v) => v === 'Z');
    expect(miss.result).toBeNull();
    expect(miss.steps.at(-1)?.kind).toBe('not-found');
  });

  it('get, peekFirst and entries', () => {
    const l = listOf(['A', 'B']);
    const [first, second] = l.entries();
    expect(l.get(second.id)).toBe('B');
    expect(l.get('nope')).toBeUndefined();
    expect(l.peekFirst()).toBe(first.value);
    expect(new SinglyLinkedList<number>().peekFirst()).toBeUndefined();
  });

  it('snapshots are deep copies', () => {
    const l = new SinglyLinkedList<{ t: number }>();
    const v = { t: 40 };
    const r = l.insertAtBegin(v);
    v.t = 50;
    l.insertAtBegin({ t: 1 });
    expect(r.steps[1].snapshot.nodes).toEqual([{ id: 'n1', value: { t: 40 }, next: null }]);
  });
});
