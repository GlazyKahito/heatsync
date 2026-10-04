'use client';

import { useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type Lenis from 'lenis';
import { EXPERIMENTS } from '@/lib/ds/meta';
import { REPLAY_DEFAULT } from '@/lib/data';
import { DayPicker } from './day-picker';
import { ExpNav } from './exp-nav';
import { buildModel, type CSource, type ExpProps } from './model';
import { Exp1Registry } from './experiments/exp1-registry';
import { Exp2AlertChain } from './experiments/exp2-alert-chain';
import { Exp3RuleCompiler } from './experiments/exp3-rule-compiler';
import { Exp4SensorRing } from './experiments/exp4-sensor-ring';
import { Exp5HotspotIndex } from './experiments/exp5-hotspot-index';
import { Exp6HeatSpread } from './experiments/exp6-heat-spread';
import { Exp7ClimateArchive } from './experiments/exp7-climate-archive';
import { Exp8InstantLookup } from './experiments/exp8-instant-lookup';

const BODIES: Record<number, ComponentType<ExpProps>> = {
  1: Exp1Registry,
  2: Exp2AlertChain,
  3: Exp3RuleCompiler,
  4: Exp4SensorRing,
  5: Exp5HotspotIndex,
  6: Exp6HeatSpread,
  7: Exp7ClimateArchive,
  8: Exp8InstantLookup,
};

// ── #exp-N hash, read through an external store so it stays in sync with back/forward and pasted links ──
const HASH_EVENT = 'heatsync:lab-hash';
function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener(HASH_EVENT, cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener(HASH_EVENT, cb);
  };
}
const readHash = () => window.location.hash;
const readServerHash = () => '';
const expFromHash = (hash: string) => {
  const m = /^#exp-([1-8])$/.exec(hash);
  return m ? Number(m[1]) : 1;
};

const ease = [0.16, 1, 0.3, 1] as const;

export function LabApp({ sources, intro }: { sources: Record<number, CSource>; intro: ReactNode }) {
  const [day, setDay] = useState(REPLAY_DEFAULT);
  const exp = expFromHash(useSyncExternalStore(subscribeHash, readHash, readServerHash));
  const model = useMemo(() => buildModel(day), [day]);
  const panelRef = useRef<HTMLDivElement>(null);
  const meta = EXPERIMENTS[exp - 1];
  const Body = BODIES[exp];

  const select = (next: number) => {
    if (next === exp) return;
    window.history.replaceState(null, '', `#exp-${next}`);
    window.dispatchEvent(new Event(HASH_EVENT));
    const el = panelRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
      if (lenis) lenis.scrollTo(el, { offset: -150, duration: 0.9 });
      else window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 150 });
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <header className="relative overflow-hidden px-4 pb-12 pt-28 sm:px-6 sm:pt-36">
        <div aria-hidden className="atmosphere absolute inset-0" />
        <div aria-hidden className="hairline-grid mask-radial absolute inset-0 opacity-70" />
        <div className="relative mx-auto grid grid-cols-1 max-w-7xl gap-10 sm:gap-12">
          {intro}
          <DayPicker day={day} onChange={setDay} />
        </div>
      </header>
      <section aria-label="Lab workspace" className="relative px-4 pb-28 sm:px-6">
        <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
          <ExpNav current={exp} onSelect={select} />
          <div ref={panelRef} id="lab-panel" role="tabpanel" aria-labelledby={`lab-tab-${exp}`} className="min-w-0 scroll-mt-40">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={exp}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, transition: { duration: 0.18 } }}
                transition={{ duration: 0.5, ease }}
              >
                <Body key={day} model={model} meta={meta} source={sources[exp]} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
