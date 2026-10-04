/**
 * HEATSYNC engine — where the eight lab data structures do the product's real work on a day's snapshot.
 *
 *   EXP1 StaticArray       station registry (36 fixed slots)
 *   EXP2 SinglyLinkedList  alert chain (newest bulletin at the head)
 *   EXP3 LinkedStack       rule compiler (IMD criteria infix → postfix → evaluated per district)
 *   EXP4 CircularQueue     sensor ring (24 hourly readings per station, rolling max)
 *   EXP5 BST               hotspot index (reverse in-order = ranking, range queries = severity bands)
 *   EXP6 Graph + BFS       heat spread (clusters, alert rings, nearest cooler district)
 *   EXP7 sort + search     climate archive (percentile rank of today against 11 seasons)
 *   EXP8 HashTable         instant lookup (name / former name / HQ PIN → district)
 *
 * Engine calls run with step recording off (maxSteps: 0); the lab replays the same operations with traces on.
 */
import { BST } from './ds/bst';
import { Graph } from './ds/graph';
import { SinglyLinkedList } from './ds/linked-list';
import { compileRule, evaluatePostfix, type Token } from './ds/stack';
import { CircularQueue, stats } from './ds/circular-queue';
import { StaticArray } from './ds/static-array';
import { HashTable } from './ds/hash-table';
import { lowerBound, mergeSort, percentileRank } from './ds/sort-search';
import { DISTRICTS, type DayRow, type Snapshot } from './data';
import { IMD_RULES, LEVELS, type Level } from './heat';

export interface HeatKey {
  t: number;
  id: number;
}
export const compareHeat = (a: HeatKey, b: HeatKey) => a.t - b.t || a.id - b.id;

let graphCache: Graph | null = null;
/** District adjacency as an adjacency matrix (built once from real shared borders). */
export function districtGraph() {
  return (graphCache ??= Graph.fromNeighbors(DISTRICTS.map((d) => d.neighbors)));
}

/** A district is "hot" for clustering when it is at watch level or above (≥ 40 °C plains / ≥ 37 °C coast). */
export const isHot = (r: DayRow) => r.status.level !== 'green';

export interface Intel {
  /** district ids, hottest first — reverse in-order traversal of the hotspot BST */
  ranking: number[];
  bstHeight: number;
  /** contiguous hot districts (BFS components over the border graph), largest first */
  clusters: number[][];
  /** BFS from the hottest district over the whole graph: alert rings */
  bfs: { level: number[]; parent: number[]; source: number; order: number[] };
  rings: number[][];
  /** for each heatwave district, the shortest-hop path to the nearest district below watch level */
  relief: { from: number; path: number[] | null }[];
}

export function analyse(s: Snapshot): Intel {
  const tree = new BST<HeatKey, number>(compareHeat, { maxSteps: 0 });
  for (const r of s.rows) tree.insert({ t: r.tmax, id: r.id }, r.id);
  const ranking = tree.reverseInorder().result.map((e) => e.value);

  const g = districtGraph();
  const hot = (v: number) => isHot(s.rows[v]);
  const clusters = g.components(hot);

  const source = ranking[0];
  const b = g.bfs(source, { maxSteps: 0 }).result;
  const rings: number[][] = [];
  b.order.forEach((v) => (rings[b.level[v]] ??= []).push(v));

  const relief = s.rows
    .filter((r) => LEVELS[r.status.level].rank >= 2)
    .sort((a, z) => z.tmax - a.tmax)
    .map((r) => ({ from: r.id, path: g.nearest(r.id, (v) => !hot(v)) }));

  return { ranking, bstHeight: tree.height(), clusters, bfs: { level: b.level, parent: b.parent, source, order: b.order }, rings, relief };
}

// ── EXP3: compiled IMD rules ─────────────────────────────────────────────────────────────────────────────────────
interface CompiledSet {
  severe: Token[];
  heatwave: Token[];
  watch: Token[];
}
let rulesCache: { plains: CompiledSet; coastal: CompiledSet } | null = null;

export function compiledRules() {
  if (rulesCache) return rulesCache;
  const c = (expr: string) => {
    const out = compileRule(expr, { maxSteps: 0 });
    if (out.error) throw new Error(`rule "${expr}": ${out.error}`);
    return out.postfix;
  };
  const set = (r: { severe: string; heatwave: string; watch: string }) => ({ severe: c(r.severe), heatwave: c(r.heatwave), watch: c(r.watch) });
  rulesCache = { plains: set(IMD_RULES.plains), coastal: set(IMD_RULES.coastal) };
  return rulesCache;
}

/** Level decided by evaluating the compiled postfix rules (independent of the reference classifier). */
export function ruleLevel(r: DayRow): Level {
  const rules = compiledRules()[DISTRICTS[r.id].coastal ? 'coastal' : 'plains'];
  // an unknown normal must never satisfy a departure criterion
  const env = { tmax: r.tmax, dep: r.normal == null ? -99 : r.tmax - r.normal, feels: r.feels ?? r.tmax, rh: r.rh ?? 0 };
  const fires = (pf: Token[]) => evaluatePostfix(pf, env, { maxSteps: 0 }).result.value === true;
  if (fires(rules.severe)) return 'red';
  if (fires(rules.heatwave)) return 'orange';
  if (fires(rules.watch)) return 'yellow';
  return 'green';
}

// ── EXP4: sensor ring ────────────────────────────────────────────────────────────────────────────────────────────
export interface Reading {
  t: string;
  v: number;
}
export function sensorRing(readings: Reading[], capacity = 24) {
  const q = new CircularQueue<Reading>(capacity, { maxSteps: 0, describe: (r) => `${r.v.toFixed(1)} °C` });
  for (const r of readings) q.push(r);
  return { queue: q, stats: stats(q, (r) => r.v) };
}

// ── EXP1: station registry ───────────────────────────────────────────────────────────────────────────────────────
export interface StationRec {
  id: number;
  code: string;
  name: string;
  tmax: number;
}
export const stationCode = (id: number) => `MH${String(id + 1).padStart(2, '0')}`;

export function stationRegistry(s: Snapshot) {
  const arr = new StaticArray<StationRec>(DISTRICTS.length, { maxSteps: 0 });
  for (const r of s.rows) arr.insertLast({ id: r.id, code: stationCode(r.id), name: DISTRICTS[r.id].name, tmax: r.tmax });
  return arr;
}

// ── EXP2: alert chain ────────────────────────────────────────────────────────────────────────────────────────────
export interface Bulletin {
  no: number;
  district: number;
  level: Level;
  tmax: number;
  day: string;
  text: string;
}

/** Bulletins for every district at watch level or above; issued mildest first so the most severe ends up at the head. */
export function alertChain(s: Snapshot, startNo = 100) {
  const list = new SinglyLinkedList<Bulletin>({ maxSteps: 0 });
  const issued = s.rows.filter((r) => r.status.level !== 'green').sort((a, b) => LEVELS[a.status.level].rank - LEVELS[b.status.level].rank || a.tmax - b.tmax);
  issued.forEach((r, i) => {
    list.insertAtBegin({
      no: startNo + i + 1,
      district: r.id,
      level: r.status.level,
      tmax: r.tmax,
      day: s.day,
      text: `${LEVELS[r.status.level].label} — ${DISTRICTS[r.id].name}: ${r.status.reason}.`,
    });
  });
  return list;
}

// ── EXP8: instant lookup ─────────────────────────────────────────────────────────────────────────────────────────
let dict: HashTable<number> | null = null;
/** Dictionary of names, former names, station codes and HQ PINs → district id (open addressing, linear probing). */
export function lookupTable() {
  if (dict) return dict;
  dict = new HashTable<number>(211, { maxSteps: 0 });
  for (const d of DISTRICTS) {
    dict.insert(d.name, d.id);
    for (const a of d.aliases) dict.insert(a, d.id);
    dict.insert(d.hqPin, d.id);
    dict.insert(stationCode(d.id), d.id);
  }
  return dict;
}

/** Exact lookup first (O(1) average); falls back to a prefix scan of the keys for partial input. */
export function lookup(query: string): { id: number; key: string; probes: number; exact: boolean } | null {
  const t = lookupTable();
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return null;
  const hit = t.search(q).result;
  if (hit.found && hit.value !== undefined) return { id: hit.value, key: q, probes: hit.probes, exact: true };
  const partial = t.entries().find((e) => e.key.startsWith(q));
  return partial ? { id: partial.value, key: partial.key, probes: 0, exact: false } : null;
}

// ── EXP7: climate archive ────────────────────────────────────────────────────────────────────────────────────────
export interface Archive {
  years: number[];
  seasonDays: number;
  tmax: (number | null)[][];
}
let archivePromise: Promise<Archive | null> | null = null;
export function loadArchive() {
  archivePromise ??= fetch('/data/archive.json')
    .then((r) => (r.ok ? (r.json() as Promise<Archive>) : null))
    .catch(() => null);
  return archivePromise;
}

const sortedCache = new Map<number, number[]>();
/** One district's 1,342 season days (2015–2025) sorted once with merge sort, in °C. */
export function sortedSeason(a: Archive, districtId: number) {
  let s = sortedCache.get(districtId);
  if (!s) {
    const vals = a.tmax[districtId].filter((v): v is number => v != null).map((v) => v / 10);
    s = mergeSort(vals, (x, y) => x - y).sorted;
    sortedCache.set(districtId, s);
  }
  return s;
}

/** Where today's Tmax sits in the district's own history: percentile (binary search) and days at or above it. */
export function rankAgainstHistory(a: Archive, districtId: number, tmax: number) {
  const s = sortedSeason(a, districtId);
  const pct = percentileRank(s, tmax);
  const atOrAbove = s.length - lowerBound(s, tmax);
  return { pct, atOrAbove, n: s.length, max: s[s.length - 1], median: s[Math.floor(s.length / 2)] };
}
