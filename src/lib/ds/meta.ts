/**
 * Catalogue of the eight lab experiments and the HEATSYNC module each one powers.
 */

export interface ExperimentOp {
  /** Operation name as exported by the engine. */
  name: string;
  /** Time complexity in Big-O notation. */
  complexity: string;
}

export interface Experiment {
  exp: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  slug: string;
  title: string;
  /** Lab aim, verbatim. */
  aim: string;
  /** HEATSYNC module name. */
  module: string;
  /** The module's real job in the heatwave product. */
  role: string;
  ops: ExperimentOp[];
}

export const EXPERIMENTS: readonly Experiment[] = [
  {
    exp: 1,
    slug: 'array-of-structures',
    title: 'Array of structures',
    aim: 'Implement and demonstrate the use of arrays, array of structure and pointers using C.',
    module: 'Station Registry',
    role: 'Fixed-capacity registry of the 36 district automated weather stations; insert/delete at the end, linear search by code or name.',
    ops: [
      { name: 'insertLast', complexity: 'O(1)' },
      { name: 'deleteLast', complexity: 'O(1)' },
      { name: 'search', complexity: 'O(n)' },
      { name: 'display', complexity: 'O(n)' },
    ],
  },
  {
    exp: 2,
    slug: 'singly-linked-list',
    title: 'Singly linked list',
    aim: 'Implementing Singly Linked List (SLL) supporting insert at the beginning, insert after a specified node, delete before a specified node and tabular display.',
    module: 'Alert Chain',
    role: 'Newest-first chain of heat bulletins; follow-ups are inserted after the bulletin they update.',
    ops: [
      { name: 'insertAtBegin', complexity: 'O(1)' },
      { name: 'insertAfter', complexity: 'O(n)' },
      { name: 'deleteBefore', complexity: 'O(n)' },
      { name: 'deleteFirst', complexity: 'O(1)' },
      { name: 'find', complexity: 'O(n)' },
      { name: 'display', complexity: 'O(n)' },
    ],
  },
  {
    exp: 3,
    slug: 'stack',
    title: 'Stack using SLL and infix to postfix',
    aim: 'Create a stack using SLL and convert an infix expression to postfix.',
    module: 'Rule Compiler',
    role: 'Compiles IMD heatwave criteria written as infix rules into postfix and evaluates them for every district.',
    ops: [
      { name: 'push', complexity: 'O(1)' },
      { name: 'pop', complexity: 'O(1)' },
      { name: 'peek', complexity: 'O(1)' },
      { name: 'tokenize', complexity: 'O(n)' },
      { name: 'infixToPostfix', complexity: 'O(n)' },
      { name: 'evaluatePostfix', complexity: 'O(n)' },
    ],
  },
  {
    exp: 4,
    slug: 'circular-queue',
    title: 'Circular queue (counter method)',
    aim: 'Implement a static circular queue using the counter method.',
    module: 'Sensor Ring',
    role: '24-slot ring buffer of hourly station readings giving a rolling 24-hour max without shifting memory.',
    ops: [
      { name: 'enqueue', complexity: 'O(1)' },
      { name: 'dequeue', complexity: 'O(1)' },
      { name: 'push (overwrite oldest)', complexity: 'O(1)' },
      { name: 'peek', complexity: 'O(1)' },
      { name: 'stats (rolling min/max/mean)', complexity: 'O(n)' },
    ],
  },
  {
    exp: 5,
    slug: 'bst',
    title: 'Binary search tree',
    aim: 'Operations on a Binary Search Tree using doubly linked nodes: create, insert, search, delete, display.',
    module: 'Hotspot Index',
    role: 'Districts keyed by heat score; reverse in-order gives the live hotspot ranking and range queries find every district in a severity band.',
    ops: [
      { name: 'insert', complexity: 'O(h): avg O(log n), worst O(n)' },
      { name: 'search', complexity: 'O(h): avg O(log n), worst O(n)' },
      { name: 'delete', complexity: 'O(h): avg O(log n), worst O(n)' },
      { name: 'min / max', complexity: 'O(h)' },
      { name: 'rangeQuery', complexity: 'O(h + k)' },
      { name: 'inorder / reverseInorder / preorder', complexity: 'O(n)' },
    ],
  },
  {
    exp: 6,
    slug: 'graph-bfs',
    title: 'Graph BFS (adjacency matrix)',
    aim: 'Represent a graph using an adjacency matrix and traverse it using BFS with a static linear queue.',
    module: 'Heat Spread Graph',
    role: 'Districts sharing a border are edges; BFS finds contiguous heatwave clusters, alert rings and the nearest cooler district for relief staging.',
    ops: [
      { name: 'build matrix', complexity: 'O(V²)' },
      { name: 'hasEdge', complexity: 'O(1)' },
      { name: 'enqueue / dequeue', complexity: 'O(1)' },
      { name: 'bfs', complexity: 'O(V²) with an adjacency matrix' },
      { name: 'components', complexity: 'O(V²)' },
      { name: 'nearest', complexity: 'O(V²)' },
    ],
  },
  {
    exp: 7,
    slug: 'sort-search',
    title: 'Sorting and binary search',
    aim: 'Demonstrate the use of sorting in the binary search algorithm.',
    module: 'Climate Archive',
    role: "Sorts 11 seasons of ERA5 daily maxima so binary search can rank today's heat against history in O(log n).",
    ops: [
      { name: 'insertionSort', complexity: 'O(n²) worst, O(n) best' },
      { name: 'quickSort', complexity: 'O(n log n) avg, O(n²) worst' },
      { name: 'mergeSort', complexity: 'O(n log n)' },
      { name: 'binarySearch', complexity: 'O(log n)' },
      { name: 'lowerBound / upperBound', complexity: 'O(log n)' },
      { name: 'percentileRank', complexity: 'O(log n)' },
      { name: 'quantile', complexity: 'O(1)' },
    ],
  },
  {
    exp: 8,
    slug: 'hash-table',
    title: 'Hash table (linear probing)',
    aim: 'Implement a dictionary using a hash table on a circular array with linear probing.',
    module: 'Instant Lookup',
    role: 'O(1) lookup of a district by name, former name or HQ PIN code.',
    ops: [
      { name: 'insert', complexity: 'O(1) average, O(n) worst' },
      { name: 'search', complexity: 'O(1) average, O(n) worst' },
      { name: 'delete', complexity: 'O(1) average, O(n) worst' },
      { name: 'loadFactor', complexity: 'O(1)' },
    ],
  },
];
