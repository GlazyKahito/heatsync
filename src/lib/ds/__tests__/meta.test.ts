import { describe, expect, it } from 'vitest';
import * as ds from '@/lib/ds';
import { EXPERIMENTS } from '../meta';

describe('EXPERIMENTS', () => {
  it('lists the eight experiments in order with unique slugs', () => {
    expect(EXPERIMENTS.map((e) => e.exp)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(EXPERIMENTS.map((e) => e.slug)).toEqual([
      'array-of-structures',
      'singly-linked-list',
      'stack',
      'circular-queue',
      'bst',
      'graph-bfs',
      'sort-search',
      'hash-table',
    ]);
    expect(EXPERIMENTS.map((e) => e.module)).toEqual([
      'Station Registry',
      'Alert Chain',
      'Rule Compiler',
      'Sensor Ring',
      'Hotspot Index',
      'Heat Spread Graph',
      'Climate Archive',
      'Instant Lookup',
    ]);
  });

  it('keeps the lab aims verbatim', () => {
    expect(EXPERIMENTS[0].aim).toBe('Implement and demonstrate the use of arrays, array of structure and pointers using C.');
    expect(EXPERIMENTS[1].aim).toBe(
      'Implementing Singly Linked List (SLL) supporting insert at the beginning, insert after a specified node, delete before a specified node and tabular display.',
    );
    expect(EXPERIMENTS[2].aim).toBe('Create a stack using SLL and convert an infix expression to postfix.');
    expect(EXPERIMENTS[3].aim).toBe('Implement a static circular queue using the counter method.');
    expect(EXPERIMENTS[4].aim).toBe('Operations on a Binary Search Tree using doubly linked nodes: create, insert, search, delete, display.');
    expect(EXPERIMENTS[5].aim).toBe('Represent a graph using an adjacency matrix and traverse it using BFS with a static linear queue.');
    expect(EXPERIMENTS[6].aim).toBe('Demonstrate the use of sorting in the binary search algorithm.');
    expect(EXPERIMENTS[7].aim).toBe('Implement a dictionary using a hash table on a circular array with linear probing.');
  });

  it('gives every experiment a title, role and operations with complexities', () => {
    for (const e of EXPERIMENTS) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.role.length).toBeGreaterThan(20);
      expect(e.ops.length).toBeGreaterThanOrEqual(4);
      for (const op of e.ops) expect(op.complexity).toMatch(/^O\(/);
    }
  });
});

describe('index re-exports', () => {
  it('exposes every module through @/lib/ds', () => {
    const names = [
      'Tracer',
      'deepClone',
      'StaticArray',
      'SinglyLinkedList',
      'LinkedStack',
      'tokenize',
      'infixToPostfix',
      'evaluatePostfix',
      'compileRule',
      'CircularQueue',
      'stats',
      'BST',
      'LinearQueue',
      'Graph',
      'pathTo',
      'insertionSort',
      'quickSort',
      'mergeSort',
      'binarySearch',
      'lowerBound',
      'upperBound',
      'percentileRank',
      'quantile',
      'HashTable',
      'normalizeKey',
      'EXPERIMENTS',
    ];
    const exported = ds as unknown as Record<string, unknown>;
    for (const n of names) expect(exported[n], n).toBeDefined();
  });
});
