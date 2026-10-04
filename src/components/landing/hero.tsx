'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ArrowRight, MousePointer2, Sparkles } from 'lucide-react';
import { DistrictSvgMap } from '@/components/map/district-svg-map';
import { useTier } from '@/components/three/perf';
import { buttonClass, LevelDot } from '@/components/ui/primitives';
import { DISTRICTS, REPLAY_DEFAULT, replaySnapshot, summarize } from '@/lib/data';
import { analyse } from '@/lib/engine';
import { HEAT_RAMP_CSS, LEVELS, type Level } from '@/lib/heat';
import { cn, fmtDay } from '@/lib/utils';
import { HERO_WORDMARK_CLASS, WORD_HALVES } from './hero-constants';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const HeatMap3D = dynamic(() => import('@/components/three/heat-map-3d'), { ssr: false });

/** Card geometry (fractions of the viewport) before the scroll expands it to full-bleed. */
const CARD = {
  desktop: { top: 0.55, side: 0.07, bottom: 0.035, radius: 32 },
  mobile: { top: 0.5, side: 0.04, bottom: 0.03, radius: 24 },
};
/** How far the canvas is pushed down so the map sits in the middle of the card, not behind the copy (% of vh). */
const canvasShift = (c: (typeof CARD)['desktop']) => ((c.top + (1 - c.bottom)) / 2 - 0.5) * 100;
const inset = (c: (typeof CARD)['desktop'], k: number) =>
  `inset(${(c.top * 100 * (1 - k)).toFixed(3)}% ${(c.side * 100 * (1 - k)).toFixed(3)}% ${(c.bottom * 100 * (1 - k)).toFixed(3)}% ${(c.side * 100 * (1 - k)).toFixed(3)}% round ${(c.radius * (1 - k)).toFixed(2)}px)`;

/**
 * Hero: a tilted glass "observation deck" holding the real-data 3D map of Maharashtra. Scrolling flattens and
 * expands it to full-bleed (the canvas itself never resizes — only its clip-path and transform change), splits the
 * wordmark, dives the camera toward the Vidarbha hot core, and lays a briefing panel over the scene.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
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
      mm.add(
        { desktop: '(min-width: 768px)', mobile: '(max-width: 767.98px)', reduce: '(prefers-reduced-motion: reduce)' },
        (ctx) => {
          const { desktop, reduce } = ctx.conditions as { desktop: boolean; reduce: boolean };
          // never let the card slide under the copy on short viewports
          const copyBottom = root.current?.querySelector('[data-hero-copy]')?.getBoundingClientRect().bottom ?? 0;
          const base = desktop ? CARD.desktop : CARD.mobile;
          const card = { ...base, top: Math.min(0.7, Math.max(base.top, (copyBottom + 28) / window.innerHeight)) };
          root.current?.style.setProperty('--card-top', `${(card.top * 100).toFixed(2)}%`);
          const frame = root.current?.querySelector<HTMLElement>('[data-hero-frame]');
          const tilt = root.current?.querySelector<HTMLElement>('[data-hero-tilt]');
          const canvas = root.current?.querySelector<HTMLElement>('[data-hero-canvas]');
          if (!frame || !tilt || !canvas) return;
          frame.style.clipPath = inset(card, 0);
          const shift = canvasShift(card);
          canvas.style.transform = `translateY(${shift.toFixed(2)}%)`;
          if (reduce) {
            tilt.style.transform = 'none';
            return;
          }
          const p = { k: 0 };
          const spread = () => window.innerWidth * (desktop ? 0.16 : 0.05);
          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom bottom', scrub: 0.8, invalidateOnRefresh: true },
          });
          tl.fromTo(
            p,
            { k: 0 },
            {
              k: 1,
              duration: 0.5,
              ease: 'power2.inOut',
              onUpdate: () => {
                frame.style.clipPath = inset(card, p.k);
                canvas.style.transform = `translateY(${(shift * (1 - p.k)).toFixed(2)}%)`;
                const rx = 20 * (1 - p.k);
                const s = 0.94 + 0.06 * p.k;
                tilt.style.transform = `perspective(1600px) rotateX(${rx.toFixed(2)}deg) scale(${s.toFixed(4)})`;
              },
            },
            0,
          )
            .fromTo(progress, { current: 0 }, { current: 1, duration: 0.85, ease: 'power1.inOut' }, 0.05)
            .to('[data-hero-fade]', { autoAlpha: 0, y: -40, duration: 0.18, stagger: 0.02 }, 0)
            .to('[data-hero-split="left"]', { x: () => -spread(), duration: 0.45, ease: 'power2.inOut' }, 0.02)
            .to('[data-hero-split="right"]', { x: () => spread(), duration: 0.45, ease: 'power2.inOut' }, 0.02)
            .to('[data-hero-title]', { y: () => -window.innerHeight * 0.08, duration: 0.4, ease: 'power1.inOut' }, 0.04)
            .to('[data-hero-title]', { autoAlpha: 0, duration: 0.12 }, 0.4)
            .to('[data-hero-edge]', { autoAlpha: 0, duration: 0.15 }, 0.1)
            .fromTo('[data-hero-panel]', { autoAlpha: 0, y: 48 }, { autoAlpha: 1, y: 0, duration: 0.16, ease: 'power3.out' }, 0.52)
            .fromTo('[data-hero-chip]', { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.14, stagger: 0.03, ease: 'power3.out' }, 0.58)
            .to('[data-hero-bg]', { yPercent: -8, scale: 1.05, duration: 1 }, 0)
            .to('[data-hero-panel], [data-hero-chip]', { autoAlpha: 0, y: -24, duration: 0.08 }, 0.9)
            .fromTo('[data-hero-outro]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 }, 0.88);
          return () => {
            frame.style.clipPath = inset(card, 0);
          };
        },
      );
      return () => mm.revert();
    },
    { scope: root },
  );

  const levels: Level[] = ['red', 'orange', 'yellow', 'green'];

  return (
    <section ref={root} aria-labelledby="hero-title" className="relative h-[270svh] motion-reduce:h-svh [--card-bottom:3%] [--card-side:4%] [--card-top:50%] md:[--card-bottom:3.5%] md:[--card-side:7%] md:[--card-top:55%]">
      <div className="sticky top-0 h-svh overflow-hidden">
        {/* atmosphere */}
        <div data-hero-bg aria-hidden className="atmosphere grain absolute -inset-[6%] will-change-transform">
          <div className="hairline-grid mask-radial absolute inset-0 opacity-70" />
          <div className="absolute left-[6%] top-[12%] size-[42vmax] rounded-full bg-[radial-gradient(circle,rgba(189,195,199,0.10),transparent_62%)] blur-2xl" />
          <div className="absolute right-[2%] top-[30%] size-[34vmax] rounded-full bg-[radial-gradient(circle,rgba(51,73,93,0.55),transparent_65%)] blur-2xl" />
        </div>

        {/* the deck: full-viewport layer, clipped to a card and tilted; expands with scroll */}
        <div className="absolute inset-0 [perspective:1600px]">
          <div data-hero-tilt className="absolute inset-0 origin-[50%_75%] will-change-transform" style={{ transform: 'perspective(1600px) rotateX(20deg) scale(0.94)' }}>
            <div
              data-hero-edge
              aria-hidden
              className="pointer-events-none absolute z-[11] rounded-[33px] border border-line-strong shadow-[0_60px_120px_-40px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(236,240,241,0.12)] max-md:rounded-[25px]"
              style={{ top: 'calc(var(--card-top) - 1px)', left: 'calc(var(--card-side) - 1px)', right: 'calc(var(--card-side) - 1px)', bottom: 'calc(var(--card-bottom) - 1px)' }}
            />
            <div data-hero-frame className="absolute inset-0 z-10 bg-abyss will-change-[clip-path]" style={{ clipPath: inset(CARD.desktop, 0) }}>
              <div data-hero-canvas className="absolute inset-0 will-change-transform" style={{ transform: `translateY(${canvasShift(CARD.desktop).toFixed(2)}%)` }}>
                {tier && tier !== 'off' ? (
                  <HeatMap3D data={data} tier={tier} variant="hero" progressRef={progress} bfs={intel.bfs} labels={intel.ranking.slice(0, 3)} active={active} />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_50%_55%,#2c3d50,#1a2531_70%)]">
                    <DistrictSvgMap data={data} className="w-[min(70vw,760px)] opacity-95" showGraph label="Maharashtra heat map, 26 May 2024" />
                  </div>
                )}
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(18,26,35,0.65)_100%)]" />
            </div>
          </div>
        </div>

        {/* copy — server-rendered and visible without JS */}
        <div data-hero-copy className="pointer-events-none absolute inset-x-0 top-[14%] z-20 flex flex-col items-center px-4 text-center md:top-[11%]">
          <p data-hero-fade className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/[0.04] px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.22em] text-fg-muted backdrop-blur">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-cloud/70" />
              <span className="relative size-1.5 rounded-full bg-cloud" />
            </span>
            Heatwave response engine · Maharashtra
          </p>
          <h1 id="hero-title" data-hero-title className={cn('mt-5 text-cloud', HERO_WORDMARK_CLASS)}>
            <span className="sr-only">HEATSYNC</span>
            <span aria-hidden data-hero-word className="inline-flex">
              <span data-hero-split="left" className="inline-block">
                {WORD_HALVES[0]}
              </span>
              <span data-hero-split="right" className="inline-block bg-gradient-to-b from-cloud via-cloud to-silver bg-clip-text text-transparent">
                {WORD_HALVES[1]}
              </span>
            </span>
          </h1>
          <p data-hero-fade className="mt-4 text-[clamp(1rem,2vw,1.45rem)] font-medium tracking-tight text-fg-muted">
            Sense the heat. <span className="text-cloud">Sync the response.</span>
          </p>
          <div data-hero-fade className="pointer-events-auto mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/console" className={buttonClass('primary', 'lg', 'group')}>
              Open the console
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/lab" className={buttonClass('secondary', 'lg', 'hidden sm:inline-flex')}>
              <Sparkles className="size-4" aria-hidden /> DSA lab
            </Link>
          </div>
        </div>

        {/* expanded-state briefing */}
        <div data-hero-panel className="invisible absolute inset-x-3 bottom-4 z-30 opacity-0 sm:inset-x-auto sm:bottom-8 sm:left-8 sm:w-[25rem]">
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
              Height and white-hot glow follow each district’s daily maximum. Pulses trace a breadth-first search across shared borders, starting at the hottest district — the order
              alerts would travel.
            </p>
            <p className="mt-3 hidden items-center gap-1.5 text-[11px] text-fg-subtle sm:flex">
              <MousePointer2 className="size-3.5" aria-hidden /> Move the pointer to shift the camera
            </p>
          </div>
        </div>
        <ul aria-label="Districts by warning level" className="absolute right-4 top-24 z-30 hidden flex-col gap-2 sm:right-8 md:flex">
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
