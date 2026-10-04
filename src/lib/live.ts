'use client';

import { useEffect, useState } from 'react';
import type { LivePayload } from '@/app/api/live/route';
import { DISTRICTS, makeRow, type Snapshot } from './data';

let pending: Promise<LivePayload | null> | null = null;

/** One shared request per page view; null when the feed is unavailable. */
export function loadLive(): Promise<LivePayload | null> {
  if (!pending)
    pending = fetch('/api/live')
      .then((r) => (r.ok ? (r.json() as Promise<LivePayload>) : null))
      .catch(() => null);
  return pending;
}

export function liveSnapshot(p: LivePayload, dayIndex = 0): Snapshot {
  const k = Math.min(dayIndex, p.days.length - 1);
  const iso = p.days[k];
  return {
    mode: 'live',
    day: iso,
    source: p.source,
    fetchedAt: p.fetchedAt,
    rows: DISTRICTS.map((d) => {
      const r = p.districts[d.id];
      return makeRow(d.id, r.tmax[k] ?? 0, r.feels[k], r.rh[k] == null ? null : Math.round(r.rh[k]!), r.wind[k] == null ? null : Math.round(r.wind[k]!), iso);
    }),
  };
}

export type LiveState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; payload: LivePayload };

export function useLive(enabled = true): LiveState {
  const [state, setState] = useState<LiveState>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadLive().then((p) => alive && setState(p ? { status: 'ready', payload: p } : { status: 'error' }));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}
