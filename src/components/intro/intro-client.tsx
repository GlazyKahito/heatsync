'use client';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { LogoMark } from '@/components/brand/logo';
import { HERO_WORDMARK_CLASS, WORDMARK } from '@/components/landing/hero-constants';
import { rng, sampleText } from '@/lib/text-sample';
import { detectTier, onSceneReady, setTier } from '@/components/three/perf';
import { DISTRICTS, REPLAY_DEFAULT, replaySnapshot, summarize } from '@/lib/data';
import { cn, fmtDay } from '@/lib/utils';
import { buildLattice, drawAssembly, drawLattice, type Assembly, type Lattice } from './bfs-lattice';
import { INTRO_DONE_EVENT, INTRO_ID, INTRO_SESSION_KEY } from './constants';

gsap.registerPlugin(useGSAP);

type Check = 'wait' | 'ok' | 'off';
const CHECKS = [
  ['type', 'Typefaces'],
  ['data', 'ERA5 replay · 36 districts'],
  ['graph', 'Border graph'],
  ['live', 'Live forecast feed'],
  ['scene', '3D terrain'],
] as const;
type CheckKey = (typeof CHECKS)[number][0];

const HIDDEN: CSSProperties = { opacity: 0, visibility: 'hidden' };
/** The loader never finishes faster than this, so the traversal reads as a traversal (ms). */
const MIN_LOAD_MS = 1700;
/** Longest we wait for slow checks before handing over anyway (ms). */
const MAX_LOAD_MS = 6500;

/**
 * Three beats, then a hand-off:
 *   1. statement — the late-May 2024 heatwave in three lines, every number computed from the ERA5 replay
 *   2. loading   — a breadth-first traversal of a hex lattice; its frontier can only advance as far as real readiness
 *                  allows (typefaces, data, border graph, live feed, first 3D frame)
 *   3. assemble  — the traversal's dots fly together and become the HEATSYNC letterforms (sampled from the real glyphs
 *                  at the hero's exact type size); the crisp wordmark resolves out of them — the reverse of the hero,
 *                  where the letters break back into the districts
 *   4. hand-off  — the backdrop fades away while the wordmark glides onto the hero's (FLIP)
 * Escape or "Skip" fast-forwards through the same hand-off.
 */
export function IntroClient({ failsafeClass }: { failsafeClass: string }) {
  const root = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipFn = useRef<() => void>(() => {});
  const [done, setDone] = useState(false);
  const [checks, setChecks] = useState<Record<CheckKey, Check>>({ type: 'wait', data: 'wait', graph: 'wait', live: 'wait', scene: 'wait' });
  const [lite, setLite] = useState(false);
  const pctRef = useRef<HTMLSpanElement>(null);
  const bfsRef = useRef<HTMLSpanElement>(null);

  const facts = useMemo(() => {
    const s = replaySnapshot(REPLAY_DEFAULT);
    const sum = summarize(s);
    const edges = DISTRICTS.reduce((n, d) => n + d.neighbors.length, 0) / 2;
    return { day: fmtDay(s.day), peak: sum.max.tmax.toFixed(1), peakName: DISTRICTS[sum.max.id].name, hot: sum.atOrAbove40, edges };
  }, []);

  useGSAP(
    (_, contextSafe) => {
      const safe = contextSafe ?? (<T,>(f: T) => f);
      const host = document.getElementById(INTRO_ID);
      const el = root.current;
      if (!host || !el || !host.hasAttribute('data-active')) {
        setDone(true);
        return;
      }
      host.classList.remove(failsafeClass);
      try {
        window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
      } catch {}
      setLite(detectTier() === 'off');

      const page = document.getElementById('hs-page');
      const html = document.documentElement;
      const prevOverflow = html.style.overflow;
      page?.setAttribute('inert', '');
      html.style.overflow = 'hidden';
      window.scrollTo(0, 0);

      const q = gsap.utils.selector(el);
      let alive = true;
      let finished = false;
      let fast = false;
      let current: gsap.core.Timeline | null = null;
      let release = () => {};
      const skipped = new Promise<void>((r) => (release = r));
      const cleanups: (() => void)[] = [];
      const check = (k: CheckKey, v: Check) => alive && setChecks((c) => (c[k] === v ? c : { ...c, [k]: v }));

      const restore = () => {
        page?.removeAttribute('inert');
        html.style.overflow = prevOverflow;
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        restore();
        host.removeAttribute('data-active');
        window.dispatchEvent(new Event(INTRO_DONE_EVENT));
        setDone(true);
      };
      const play = (tl: gsap.core.Timeline) =>
        new Promise<void>((resolve) => {
          current = tl;
          tl.eventCallback('onComplete', () => resolve());
          if (fast) tl.progress(1);
        });

      // ── real readiness ─────────────────────────────────────────────────────────────────────────────────────────
      const ready = { n: 0 };
      const total = CHECKS.length;
      const tick = (k: CheckKey, v: Check) => {
        check(k, v);
        ready.n++;
      };
      document.fonts?.ready.then(() => tick('type', 'ok'));
      queueMicrotask(() => tick('data', 'ok')); // the replay ships with the page
      queueMicrotask(() => tick('graph', facts.edges > 0 ? 'ok' : 'off'));
      const ctrl = new AbortController();
      const liveTimer = window.setTimeout(() => ctrl.abort(), 3500);
      fetch('/api/live', { signal: ctrl.signal })
        .then((r) => tick('live', r.ok ? 'ok' : 'off'))
        .catch(() => tick('live', 'off'));
      cleanups.push(() => window.clearTimeout(liveTimer));
      if (detectTier() === 'off') queueMicrotask(() => tick('scene', 'off'));
      else cleanups.push(onSceneReady(() => tick('scene', 'ok')));

      // ── lattice ────────────────────────────────────────────────────────────────────────────────────────────────
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let L: Lattice | null = null;
      const size = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        L = buildLattice(w, h, w < 640 ? 26 : 34);
      };
      size();
      window.addEventListener('resize', size);
      cleanups.push(() => window.removeEventListener('resize', size));

      const lat = { front: -1, fade: -1 };
      let asm: Assembly | null = null;
      const draw = () => {
        if (!ctx || !L) return;
        if (asm && asm.t > 0) drawAssembly(ctx, L, lat.front, asm, dpr);
        else drawLattice(ctx, L, lat.front, dpr, lat.fade);
      };
      gsap.ticker.add(draw);
      cleanups.push(() => gsap.ticker.remove(draw));

      // ── beats ──────────────────────────────────────────────────────────────────────────────────────────────────
      const statement = safe(() =>
        gsap
          .timeline()
          .to(q('[data-intro-hud]'), { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power2.out', stagger: 0.06 }, 0)
          .fromTo(q('[data-intro-rule]'), { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'expo.inOut' }, 0.1)
          .to(q('[data-intro-date]'), { autoAlpha: 1, duration: 0.5 }, 0.5)
          .fromTo(q('[data-intro-line] > span'), { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.75 }, 0.65)
          .set(q('[data-intro-line]'), { autoAlpha: 1 }, 0.65)
          .to({}, { duration: 0.6 })
          .to(q('[data-intro-statement]'), { autoAlpha: 0, y: -24, duration: 0.5, ease: 'power2.in' }),
      );

      const loading = safe(
        () =>
          new Promise<void>((resolve) => {
            gsap.to(q('[data-intro-loader]'), { autoAlpha: 1, duration: 0.4 });
            const t0 = performance.now();
            const step = () => {
              if (!alive || !L) return;
              const elapsed = performance.now() - t0;
              const readyFrac = elapsed > MAX_LOAD_MS ? 1 : ready.n / total;
              const timeFrac = Math.min(1, elapsed / MIN_LOAD_MS);
              const target = Math.min(readyFrac, timeFrac) * (L.maxLevel + 1.3);
              lat.front += (target - lat.front) * (fast ? 1 : 0.09);
              let visited = 0;
              const lim = Math.floor(lat.front);
              while (visited < L.count && L.level[L.order[visited]] <= lim) visited++;
              // plain DOM writes: no React render per frame
              const pct = Math.min(100, Math.round((visited / L.count) * 100));
              if (pctRef.current) pctRef.current.textContent = String(pct).padStart(2, '0');
              if (bfsRef.current) bfsRef.current.textContent = `level ${Math.max(0, Math.min(L.maxLevel, lim))}/${L.maxLevel} · ${visited} nodes visited`;
              if (lat.front >= L.maxLevel + 1.1 || fast) {
                lat.front = L.maxLevel + 2;
                resolve();
                return;
              }
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }),
      );

      // the lattice's visited dots fly into the letterforms, centre-out in BFS order
      const assemble = safe(() => {
        const box = q('[data-intro-wordbox]')[0] as HTMLElement;
        const sample = L ? sampleText(box, { max: 3200, density: 46, seed: 5 }) : null;
        if (L && sample) {
          const rand = rng(9);
          const n = sample.count;
          const src = new Float32Array(n * 2);
          const delay = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const node = L.order[Math.floor(rand() * L.count)];
            src[2 * i] = L.x[node];
            src[2 * i + 1] = L.y[node];
            delay[i] = (L.level[node] / Math.max(1, L.maxLevel)) * 0.4 + rand() * 0.08;
          }
          asm = { t: 0, alpha: 1, src, dst: sample.points, delay, n, size: sample.step * 1.15 };
        }
        const a = asm ?? { t: 0, alpha: 1 };
        return gsap
          .timeline()
          .to(q('[data-intro-loader]'), { autoAlpha: 0, duration: 0.4, ease: 'power1.out' }, 0)
          .to(a, { t: 1, duration: 1.45, ease: 'none' }, 0.05)
          .set(q('[data-intro-word]'), { autoAlpha: 1 }, 1.25)
          .fromTo(q('[data-intro-wordbox]'), { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 1.25)
          .to(a, { alpha: 0, duration: 0.4, ease: 'power1.out' }, 1.35)
          .fromTo(q('[data-intro-tag]'), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 1.4)
          .to({}, { duration: 0.3 });
      });

      const handoff = safe(() => {
        const word = q('[data-intro-wordbox]')[0] as HTMLElement;
        gsap.set(word, { x: 0, y: 0 });
        const from = word.getBoundingClientRect();
        const to = document.querySelector('[data-hero-word]')?.getBoundingClientRect();
        const dx = to ? to.left - from.left : 0;
        const dy = to ? to.top - from.top : 0;
        const tl = gsap
          .timeline({ onComplete: finish })
          .to(q('[data-intro-hud], [data-intro-tag]'), { autoAlpha: 0, duration: 0.3 }, 0)
          .to(word, { x: dx, y: dy, duration: 1.1, ease: 'expo.inOut' }, 0)
          .to(q('[data-intro-backdrop]'), { autoAlpha: 0, duration: 0.9, ease: 'power2.inOut' }, 0.15)
          .to(word, { autoAlpha: 0, duration: 0.25 }, 1.1); // the identical hero wordmark is underneath by now
        if (fast) tl.timeScale(2.2);
        return tl;
      });

      skipFn.current = () => {
        if (fast || finished) return;
        fast = true;
        current?.progress(1);
        release();
      };
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && skipFn.current();
      window.addEventListener('keydown', onKey);

      void (async () => {
        await play(statement());
        if (!alive) return;
        await Promise.race([loading(), skipped]);
        if (!alive) return;
        await play(assemble());
        if (!alive) return;
        current = handoff();
      })();

      return () => {
        alive = false;
        ctrl.abort();
        cleanups.forEach((f) => f());
        window.removeEventListener('keydown', onKey);
        if (!finished) restore();
      };
    },
    { scope: root },
  );

  if (done) return null;
  const nReady = Object.values(checks).filter((c) => c !== 'wait').length;

  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label="HEATSYNC intro" className="absolute inset-0 overflow-hidden">
      {/* backdrop: clipped away from the top by the scan in the hand-off; the homepage is already underneath */}
      <div data-intro-backdrop className="absolute inset-0 overflow-hidden">
        <div aria-hidden className="atmosphere absolute inset-0 bg-void" />
        <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0" />
        <div aria-hidden className="grain pointer-events-none absolute inset-0" />

        {/* HUD */}
        <div data-intro-hud className="absolute left-5 top-5 flex items-center gap-2.5 sm:left-8 sm:top-7" style={{ ...HIDDEN, transform: 'translateY(8px)' }}>
          <LogoMark className="size-7 text-cloud" />
          <div className="font-mono text-[10px] uppercase leading-tight tracking-[0.2em]">
            <p className="text-cloud">HEATSYNC</p>
            <p className="text-fg-subtle">Heatwave response · Maharashtra</p>
          </div>
        </div>
        <div
          data-intro-hud
          className="absolute right-5 top-5 hidden text-right font-mono text-[10px] uppercase leading-tight tracking-[0.2em] text-fg-subtle sm:right-8 sm:top-7 sm:block"
          style={{ ...HIDDEN, transform: 'translateY(8px)' }}
        >
          <p className="text-cloud">Use case KJS-CES-01</p>
          <p>ERA5 · Open-Meteo · geoBoundaries</p>
        </div>

        {/* 1 — statement */}
        <div data-intro-statement className="absolute inset-0 grid place-items-center px-6">
          <div className="w-full max-w-4xl">
            <div className="flex items-center gap-4">
              <span data-intro-date className="font-mono text-[11px] uppercase tracking-[0.24em] text-silver" style={HIDDEN}>
                {facts.day} · ERA5 daily max
              </span>
              <span data-intro-rule className="h-px flex-1 origin-left bg-gradient-to-r from-silver/50 to-transparent" style={{ transform: 'scaleX(0)' }} />
            </div>
            <div className="mt-6 space-y-2 font-wide text-[clamp(1.6rem,4.6vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-cloud">
              <p data-intro-line className="overflow-hidden pb-1" style={HIDDEN}>
                <span className="block">
                  {facts.peakName} hit <span className="text-white">{facts.peak}&nbsp;°C.</span>
                </span>
              </p>
              <p data-intro-line className="overflow-hidden pb-1" style={HIDDEN}>
                <span className="block text-silver">
                  {facts.hot} of 36 districts crossed 40&nbsp;°C.
                </span>
              </p>
              <p data-intro-line className="overflow-hidden pb-1" style={HIDDEN}>
                <span className="block text-fg-subtle">The heat moved. The response had to keep up.</span>
              </p>
            </div>
          </div>
        </div>

        {/* 2 — loading */}
        <div data-intro-loader className="pointer-events-none absolute inset-0" style={HIDDEN}>
          <div className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-3 px-6 text-center sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
            <p className="font-wide text-[clamp(3rem,10vw,6.5rem)] font-black leading-none tabular text-cloud">
              <span ref={pctRef}>00</span>
              <span className="text-[0.4em] text-silver">%</span>
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-fg-muted tabular">
              Breadth-first search · <span ref={bfsRef}>level 0 · 0 nodes visited</span>
            </p>
          </div>
        </div>

        <ul data-intro-hud className="absolute bottom-6 left-5 flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] sm:bottom-8 sm:left-8" style={{ ...HIDDEN, transform: 'translateY(8px)' }} aria-hidden>
          {CHECKS.map(([k, label]) => (
            <li key={k} className="flex items-center gap-2">
              <span className={cn('size-1.5 rounded-full', checks[k] === 'ok' ? 'bg-cloud' : checks[k] === 'off' ? 'bg-fg-subtle' : 'animate-pulse-soft ring-1 ring-silver')} />
              <span className={checks[k] === 'wait' ? 'text-fg-subtle' : 'text-fg-muted'}>
                {label}
                {checks[k] === 'off' ? ' · skipped' : ''}
              </span>
            </li>
          ))}
        </ul>

        <div data-intro-hud className="absolute bottom-6 right-5 z-20 flex items-center gap-2 sm:bottom-8 sm:right-8" style={{ ...HIDDEN, transform: 'translateY(8px)' }}>
          <button
            type="button"
            onClick={() => {
              const next = !lite;
              setLite(next);
              setTier(next ? 'off' : 'high');
            }}
            className="rounded-full border border-line-strong bg-white/[0.04] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-muted hover:text-cloud"
            aria-pressed={lite}
          >
            Lite mode · {lite ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => skipFn.current()}
            className="rounded-full border border-line-strong bg-white/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cloud hover:bg-white/10"
          >
            Skip <span className="sr-only">intro (Escape)</span>
          </button>
        </div>

      </div>

      {/* 3 — wordmark (same type as the hero's so it can land on it exactly) */}
      <div data-intro-word className="pointer-events-none absolute inset-0 grid place-items-center" style={HIDDEN}>
        <div className="flex flex-col items-center">
          <p aria-hidden className={cn(HERO_WORDMARK_CLASS, 'text-cloud')}>
            <span data-intro-wordbox className="inline-flex opacity-0">
              {WORDMARK}
            </span>
          </p>
          <p data-intro-tag className="mt-5 font-mono text-[11px] uppercase tracking-[0.3em] text-silver" style={HIDDEN}>
            Sense the heat · Sync the response
          </p>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {nReady === CHECKS.length ? 'HEATSYNC is ready' : 'Loading HEATSYNC'}
      </p>
    </div>
  );
}
