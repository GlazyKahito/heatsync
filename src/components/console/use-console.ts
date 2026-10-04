'use client';

import { useEffect, useMemo, useState } from 'react';
import { REPLAY_DEFAULT, REPLAY_WINDOW, replaySnapshot, type Snapshot } from '@/lib/data';
import { alertChain, analyse, type Bulletin } from '@/lib/engine';
import { liveSnapshot, useLive } from '@/lib/live';
import type { SinglyLinkedList } from '@/lib/ds/linked-list';

export type Mode = 'replay' | 'live';
export type Tab = 'hotspots' | 'spread' | 'rules' | 'sensors' | 'alerts' | 'advisory' | 'registry' | 'archive';

/** All console state in one place: mode, day, selection, the derived snapshot + analysis, and the session's alert chain. */
export function useConsole(initialMode: Mode) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [replayDay, setReplayDay] = useState(REPLAY_DEFAULT);
  const [liveDay, setLiveDay] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('hotspots');
  const [emphasis, setEmphasis] = useState<Set<number> | null>(null);
  const [playing, setPlaying] = useState(false);
  const live = useLive(true);

  const snapshot: Snapshot = useMemo(() => {
    if (mode === 'live' && live.status === 'ready') return liveSnapshot(live.payload, liveDay);
    return replaySnapshot(replayDay);
  }, [mode, live, liveDay, replayDay]);
  const effectiveMode: Mode = snapshot.mode;
  const intel = useMemo(() => analyse(snapshot), [snapshot]);

  // the alert chain is a real linked list that lives for the session; it is rebuilt when the day changes and
  // approved advisories / follow-ups are inserted into it in place
  const chain: SinglyLinkedList<Bulletin> = useMemo(() => alertChain(snapshot), [snapshot]);
  const [chainVersion, setChainVersion] = useState(0);
  const bumpChain = () => setChainVersion((v) => v + 1);

  // replay autoplay: step through the heat spell one day at a time
  useEffect(() => {
    if (!playing || effectiveMode !== 'replay') return;
    const id = window.setInterval(() => {
      setReplayDay((d) => {
        const i = REPLAY_WINDOW.indexOf(d);
        if (i >= REPLAY_WINDOW.length - 1) {
          setPlaying(false);
          return d;
        }
        return REPLAY_WINDOW[i + 1];
      });
    }, 1300);
    return () => window.clearInterval(id);
  }, [playing, effectiveMode]);

  return {
    mode,
    setMode,
    effectiveMode,
    live,
    replayDay,
    setReplayDay,
    liveDay,
    setLiveDay,
    selected,
    setSelected,
    tab,
    setTab,
    emphasis,
    setEmphasis,
    playing,
    setPlaying,
    snapshot,
    intel,
    chain,
    chainVersion,
    bumpChain,
  };
}

export type ConsoleState = ReturnType<typeof useConsole>;
