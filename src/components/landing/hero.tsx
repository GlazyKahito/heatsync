'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ArrowRight, MousePointer2, Sparkles } from 'lucide-react';
import { DistrictSvgMap } from '@/components/map/district-svg-map';
import type { CardFit } from '@/components/three/heat-map-3d';
import { useTier } from '@/components/three/perf';
import { buttonClass, LevelDot } from '@/components/ui/primitives';
import { DISTRICTS, REPLAY_DEFAULT, replaySnapshot, summarize } from '@/lib/data';
import { analyse } from '@/lib/engine';
import { HEAT_RAMP_CSS, LEVELS, type Level } from '@/lib/heat';
import { cn, fmtDay } from '@/lib/utils';
import { HERO_WORDMARK_CLASS, WORDMARK } from './hero-constants';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const HeatMap3D = dynamic(() => import('@/components/three/heat-map-3d'), { ssr: false });

const DEFAULT_FIT: CardFit = { top: 0.56, bottom: 0.035, side: 0.07 };

/**
 * Hero — "letters become districts". On load the whole state sits in the card, cold and low, under the HEATSYNC
 * wordmark. Scrolling dissolves the wordmark into thousands of particles sampled from its own glyphs; they fly across
 * the screen (left letters to western districts, right letters to eastern ones) and land breadth-first from the
 * hottest district outward. As a district's particles land, its pillar rises to that day's real maximum and turns
 * white-hot. Scroll back up and the districts fly back into the letters. Then the camera dives toward Vidarbha and the
 * briefing panel lands. Particles and pillars are driven on the GPU; the DOM only changes opacity and transforms.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);
  const morph = useRef(0);
  const fit = useRef<CardFit>({ ...DEFAULT_FIT });
  const tier = useTier();
  const [active, setActive] = useState(true);

  const snap = useMemo(() => replaySnapshot(REPLAY_DEFAULT), []);
  const sum = useMemo(() => summarize(snap), [snap]);
  const intel = useMemo(() => analyse(snap), [snap]);
  const data = useMemo(() => snap.rows.map((r) => ({ tmax: r.tmax, level: r.status.level })), [snap]);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: '120px' });
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
        const { reduce } = ctx.conditions as { reduce: boolean };
        const el = root.current;
        const st = stage.current;
        const slot = el?.querySelector<HTMLElement>('[data-hero-slot]');
        if (!el || !st || !slot) return;

        // the card is wherever the layout slot under the copy ends up — re-measured on resize and font swaps
        const measure = () => {
          const s = st.getBoundingClientRect();
          const r = slot.getBoundingClientRect();
          if (!s.height || !s.width) return;
          fit.current = { top: (r.top - s.top) / s.height, bottom: (s.bottom - r.bottom) / s.height, side: (r.left - s.left) / s.width };
          el.style.setProperty('--card-top', `${(fit.current.top * 100).toFixed(3)}%`);
          el.style.setProperty('--card-bottom', `${(fit.current.bottom * 100).toFixed(3)}%`);
          el.style.setProperty('--card-side', `${(fit.current.side * 100).toFixed(3)}%`);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(slot);
        ro.observe(st);
        document.fonts?.ready.then(measure);

        if (reduce) {
          morph.current = 1; // districts already lit, no particles, wordmark stays
          return () => ro.disconnect();
        }

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 0.9, invalidateOnRefresh: true },
        });
        tl
          // the wordmark hands over to its particles almost immediately; the rest of the copy steps aside
          .fromTo(morph, { current: 0 }, { current: 1, duration: 0.6 }, 0.015)
          .to(word.current, { opacity: 0, duration: 0.03 }, 0.022)
          .to('[data-hero-fade]', { autoAlpha: 0, y: -28, duration: 0.07, stagger: 0.012, ease: 'power1.in' }, 0.01)
          // the card frame dissolves as the camera opens up to the full screen
          .to('[data-hero-card]', { autoAlpha: 0, scale: 1.035, duration: 0.24, ease: 'power1.inOut' }, 0.16)
          .fromTo(progress, { current: 0 }, { current: 1, duration: 0.8, ease: 'power1.inOut' }, 0.12)
          .fromTo('[data-hero-panel]', { autoAlpha: 0, y: 48 }, { autoAlpha: 1, y: 0, duration: 0.13, ease: 'power3.out' }, 0.66)
          .fromTo('[data-hero-chip]', { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.12, stagger: 0.025, ease: 'power3.out' }, 0.7)
          .to('[data-hero-bg]', { yPercent: -6, duration: 1 }, 0)
          .to('[data-hero-panel], [data-hero-chip]', { autoAlpha: 0, y: -24, duration: 0.08 }, 0.9)
          .fromTo('[data-hero-outro]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 }, 0.88);
        return () => {
          ro.disconnect();
          morph.current = 0;
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const levels: Level[] = ['red', 'orange', 'yellow', 'green'];

  return (
    <section ref={root} aria-labelledby="hero-title" className="relative h-[280svh] motion-reduce:h-svh [--card-bottom:3.5%] [--card-side:7%] [--card-top:56%]">
      <div ref={stage} data-hero-stage className="sticky top-0 flex h-svh flex-col overflow-hidden">
        {/* atmosphere */}
        <div data-hero-bg aria-hidden className="atmosphere absolute -inset-[6%] will-change-transform">
          <div className="hairline-grid mask-radial absolute inset-0 opacity-70" />
          <div className="absolute left-[6%] top-[12%] size-[42vmax] rounded-full bg-[radial-gradient(circle,rgba(189,195,199,0.09),transparent_70%)]" />
          <div className="absolute right-[2%] top-[30%] size-[34vmax] rounded-full bg-[radial-gradient(circle,rgba(51,73,93,0.5),transparent_70%)]" />
        </div>

        {/* the card: a DOM frame behind the transparent 3D layer */}
        <div
          data-hero-card
          aria-hidden
          className="absolute z-[5] overflow-hidden rounded-[32px] border border-line-strong bg-[radial-gradient(ellipse_at_50%_40%,#2c3d50_0%,#1f2c3a_60%,#18222d_100%)] shadow-[0_60px_120px_-40px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(236,240,241,0.12)] will-change-transform"
          style={{ top: 'var(--card-top)', left: 'var(--card-side)', right: 'var(--card-side)', bottom: 'var(--card-bottom)' }}
        >
          <div className="hairline-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
        </div>

        {/* the 3D layer: full viewport and unclipped, so the letter particles can fly anywhere on screen */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {tier && tier !== 'off' ? (
            <HeatMap3D
              data={data}
              tier={tier}
              variant="hero"
              progressRef={progress}
              morphRef={morph}
              wordRef={word}
              fitRef={fit}
              eventSource={stage}
              bfs={intel.bfs}
              labels={intel.ranking.slice(0, 3)}
              active={active}
            />
          ) : (
            <div className="absolute grid place-items-center" style={{ top: 'var(--card-top)', left: 'var(--card-side)', right: 'var(--card-side)', bottom: 'var(--card-bottom)' }}>
              <DistrictSvgMap data={data} className="max-h-full w-auto max-w-full p-6 opacity-95" showGraph label="Maharashtra heat map, 26 May 2024" />
            </div>
          )}
        </div>

        {/* copy — server-rendered and visible without JS */}
        <div data-hero-copy className="pointer-events-none relative z-20 flex shrink-0 flex-col items-center px-4 pt-[max(5.75rem,11svh)] text-center md:pt-[max(6rem,9svh)]">
          <p data-hero-fade className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/[0.04] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-muted">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-cloud/70" />
              <span className="relative size-1.5 rounded-full bg-cloud" />
            </span>
            Heatwave response engine · Maharashtra
          </p>
          <h1 id="hero-title" className={cn('mt-5 text-cloud', HERO_WORDMARK_CLASS)}>
            <span className="sr-only">HEATSYNC</span>
            <span ref={word} aria-hidden data-hero-word className="inline-flex">
              {WORDMARK}
            </span>
          </h1>
          <p data-hero-fade className="mt-4 text-[clamp(1rem,2vw,1.45rem)] font-medium tracking-tight text-fg-muted">
            Sense the heat. <span className="text-cloud">Sync the response.</span>
          </p>
          <div data-hero-fade className="pointer-events-auto mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/console" className={buttonClass('primary', 'lg', 'group')}>
              Open the console
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/lab" className={buttonClass('secondary', 'lg', 'hidden sm:inline-flex')}>
              <Sparkles className="size-4" aria-hidden /> DSA lab
            </Link>
          </div>
        </div>

        {/* layout slot: the card fills whatever room is left under the copy (measured, never overlapping it) */}
        <div data-hero-slot aria-hidden className="pointer-events-none mx-[7%] mb-[3%] mt-7 min-h-[32svh] flex-1" />

        {/* expanded-state briefing */}
        <div data-hero-panel className="invisible absolute bottom-8 left-8 z-30 w-[25rem] opacity-0">
          <div className="glass-strong rounded-3xl p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-silver">Historical replay · ERA5 reanalysis</p>
            <h2 className="mt-2 text-xl font-semibold leading-snug text-cloud">{fmtDay(snap.day)} — the peak of a twelve-day hot spell</h2>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-[10.5px] uppercase tracking-wide text-fg-subtle">Hottest</dt>
                <dd className="font-wide text-lg font-black tabular text-cloud">{sum.max.tmax.toFixed(1)}°</dd>
                <dd className="text-[11px] text-fg-muted">{DISTRICTS[sum.max.id].name}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] uppercase tracking-wide text-fg-subtle">≥ 40 °C</dt>
                <dd className="font-wide text-lg font-black tabular text-cloud">
                  {sum.atOrAbove40}
                  <span className="text-xs font-normal text-fg-subtle">/36</span>
                </dd>
                <dd className="text-[11px] text-fg-muted">districts</dd>
              </div>
              <div>
                <dt className="text-[10.5px] uppercase tracking-wide text-fg-subtle">Clusters</dt>
                <dd className="font-wide text-lg font-black tabular text-cloud">{intel.clusters.length}</dd>
                <dd className="text-[11px] text-fg-muted">found by BFS</dd>
              </div>
            </dl>
            <div className="mt-4">
              <div className="h-1.5 rounded-full ring-1 ring-line" style={{ background: HEAT_RAMP_CSS }} aria-hidden />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-subtle">
                <span>28 °C</span>
                <span>38</span>
                <span>44</span>
                <span>47+</span>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-fg-muted">
              Every particle was a piece of the wordmark. Each district lit up as its share landed — breadth-first from {DISTRICTS[intel.bfs.source].name}, the hottest district,
              the order alerts would travel.
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-fg-subtle">
              <MousePointer2 className="size-3.5" aria-hidden /> Move the pointer to shift the camera · scroll up to rewind
            </p>
          </div>
        </div>
        <ul aria-label="Districts by warning level" className="absolute right-8 top-24 z-30 flex flex-col gap-2">
          {levels.map((l) => (
            <li key={l} data-hero-chip className="glass invisible flex items-center gap-2.5 rounded-full py-1.5 pl-3 pr-4 opacity-0">
              <LevelDot level={l} />
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">{LEVELS[l].label}</span>
              <span className="ml-auto pl-3 font-wide text-sm font-black tabular text-cloud">{sum.counts[l]}</span>
            </li>
          ))}
        </ul>

        <div data-hero-outro aria-hidden className="pointer-events-none invisible absolute inset-x-0 bottom-0 z-40 h-1/2 bg-gradient-to-b from-transparent to-abyss opacity-0" />
      </div>
    </section>
  );
}
