'use client';

import { useRef, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { EXPERIMENTS } from '@/lib/ds/meta';
import { cn } from '@/lib/utils';
import { pad2 } from './model';

/**
 * Experiment selector: horizontal pill tabs on small screens, a sticky vertical rail on lg+. Roving tabindex with
 * arrow keys, as a WAI-ARIA tablist.
 */
export function ExpNav({ current, onSelect }: { current: number; onSelect: (exp: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (exp: number) => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-exp="${exp}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = EXPERIMENTS.length;
    const map: Record<string, number> = {
      ArrowRight: (current % n) + 1,
      ArrowDown: (current % n) + 1,
      ArrowLeft: ((current + n - 2) % n) + 1,
      ArrowUp: ((current + n - 2) % n) + 1,
      Home: 1,
      End: n,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    onSelect(map[e.key]);
    focusTab(map[e.key]);
  };

  return (
    <nav aria-label="Experiments" className="sticky top-[4.6rem] z-20 -mx-4 mb-6 px-4 sm:-mx-6 sm:px-6 lg:top-24 lg:mx-0 lg:mb-0 lg:self-start lg:px-0">
      <div className="glass-strong rounded-full p-1 lg:rounded-[28px] lg:p-2">
        <p className="hidden px-4 pb-2 pt-3 font-mono text-[10.5px] uppercase tracking-[0.2em] text-fg-subtle lg:block">8 experiments</p>
        <div
          ref={listRef}
          role="tablist"
          aria-label="Experiments"
          onKeyDown={onKeyDown}
          className="scrollbar-none flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
        >
          {EXPERIMENTS.map((e) => {
            const on = e.exp === current;
            return (
              <button
                key={e.exp}
                type="button"
                role="tab"
                id={`lab-tab-${e.exp}`}
                data-exp={e.exp}
                aria-selected={on}
                aria-controls="lab-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => onSelect(e.exp)}
                className={cn(
                  'group relative flex shrink-0 items-center gap-3 rounded-full px-4 py-2 text-left transition-colors duration-300 lg:rounded-[20px] lg:px-3 lg:py-2.5',
                  on ? 'text-midnight' : 'text-fg-muted hover:text-cloud',
                )}
              >
                {on && (
                  <motion.span
                    layoutId="lab-tab-pill"
                    className="absolute inset-0 rounded-full bg-cloud lg:rounded-[20px]"
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  />
                )}
                {!on && <span aria-hidden className="absolute inset-0 rounded-full bg-white/[0.05] opacity-0 transition-opacity group-hover:opacity-100 lg:rounded-[20px]" />}
                <span className={cn('relative font-wide text-sm font-black tabular lg:text-base', on ? 'text-midnight' : 'text-fg-subtle group-hover:text-fg-muted')}>
                  {pad2(e.exp)}
                </span>
                <span className="relative min-w-0">
                  <span className={cn('block whitespace-nowrap text-sm font-semibold', on ? 'text-midnight' : 'text-cloud/90')}>{e.module}</span>
                  <span className={cn('hidden truncate font-mono text-[10.5px] lg:block', on ? 'text-midnight/65' : 'text-fg-subtle')}>{e.title}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
