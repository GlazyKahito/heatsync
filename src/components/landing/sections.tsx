import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Cpu, GitBranch, Layers, Radio, ShieldCheck, Users } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { buttonClass, Eyebrow } from '@/components/ui/primitives';
import { Wordmark } from '@/components/brand/logo';
import { cn } from '@/lib/utils';
import { SpotlightCard } from './spotlight-card';
import { ArrayVisual, GraphVisual, HashVisual, ListVisual, RingVisual, SearchVisual, StackVisual, TreeVisual } from './module-visuals';

export function SectionHeading({ eyebrow, title, children, id, className }: { eyebrow: string; title: string; children?: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <div data-reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <h2 id={id} data-reveal="words" className="mt-4 font-wide text-[clamp(2rem,4.6vw,3.6rem)] font-black leading-[0.98] tracking-[-0.03em] text-cloud text-balance">
        {title}
      </h2>
      {children && (
        <div data-reveal className="mt-5 text-base leading-relaxed text-fg-muted text-pretty sm:text-lg">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Problem ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const STATS = [
  { value: '45.8', unit: '°C', label: 'Nagpur’s ERA5 daily maximum on 26 May 2024 — the hottest district that day.' },
  { value: '12', unit: 'days', label: 'In a row, 20–31 May 2024, with at least 16 of 36 districts above 40 °C.' },
  { value: '1283', unit: 'district-days', label: 'At or above 40 °C in the 2019 season — the worst of 2015–2025 in our archive.' },
  { value: '77', unit: 'borders', label: 'Shared between districts. Every one is a path the heat — and the help — can travel.' },
];

const GAPS = [
  { icon: Radio, title: 'Readings arrive as streams', body: 'Stations report every hour; decisions need a rolling 24-hour picture without re-reading history.' },
  { icon: Layers, title: 'Rankings are rebuilt by hand', body: 'Which district is worst, which ones fall in a severity band — recomputed in spreadsheets, every day.' },
  { icon: GitBranch, title: 'Neighbours are warned late', body: 'Heat ignores district lines, but alerts are issued district by district, one at a time.' },
  { icon: Users, title: 'One bulletin, four audiences', body: 'Citizens, farmers, hospitals and control rooms need different words for the same forecast.' },
];

export function ProblemSection() {
  return (
    <Reveal as="section" id="problem" aria-labelledby="problem-title" className="relative scroll-mt-20 px-4 py-28 sm:px-6 sm:py-36">
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading eyebrow="01 · The problem" title="Heat crosses district lines. Warnings rarely do." id="problem-title">
            <p>
              Maharashtra’s heatwaves build over days and spread across borders — Vidarbha one week, Marathwada the next. The data to act on exists: hourly weather,
              decades of reanalysis, IMD’s criteria. What is missing is an engine that turns it into a coordinated response fast enough to matter.
            </p>
          </SectionHeading>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {GAPS.map((g) => (
              <li key={g.title} data-reveal className="glass rounded-2xl p-4">
                <g.icon className="size-4 text-silver" aria-hidden />
                <p className="mt-3 text-sm font-semibold text-cloud">{g.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{g.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-4">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              data-reveal
              className={cn(
                'relative overflow-hidden rounded-3xl border p-7 sm:p-8',
                i === 0 ? 'border-transparent bg-cloud text-midnight' : i === 1 ? 'border-transparent bg-silver text-midnight' : i === 2 ? 'border-line bg-asphalt' : 'border-line bg-midnight',
              )}
            >
              <p className="flex items-baseline gap-2">
                <span data-count className="font-wide text-[clamp(3rem,7vw,5.2rem)] font-black leading-none tracking-[-0.04em] tabular">
                  {s.value}
                </span>
                <span className={cn('font-mono text-xs uppercase tracking-[0.18em]', i < 2 ? 'text-midnight/70' : 'text-fg-muted')}>{s.unit}</span>
              </p>
              <p className={cn('mt-3 max-w-sm text-sm leading-relaxed', i < 2 ? 'text-midnight/80' : 'text-fg-muted')}>{s.label}</p>
              <span aria-hidden className={cn('absolute right-6 top-6 font-mono text-[10px]', i < 2 ? 'text-midnight/40' : 'text-fg-subtle')}>
                ERA5 · {String(i + 1).padStart(2, '0')}
              </span>
            </div>
          ))}
          <p data-reveal className="px-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">
            Source: ERA5 reanalysis via Open-Meteo (CC BY 4.0), 36 district points, 1 Mar – 30 Jun 2015–2025. Borders: geoBoundaries.
          </p>
        </div>
      </div>
    </Reveal>
  );
}

// ── Modules (bento) ─────────────────────────────────────────────────────────────────────────────────────────────────
type Tone = 'cloud' | 'silver' | 'asphalt' | 'midnight';
const MODULES: { exp: number; ds: string; module: string; role: string; cx: string; tone: Tone; span: string; Visual: (p: { tone: 'light' | 'dark' }) => React.ReactNode }[] = [
  { exp: 1, ds: 'Array of structures', module: 'Station Registry', role: '36 fixed slots, one per district weather station. Insert and delete at the end, search by code or name.', cx: 'O(1) insert · O(n) search', tone: 'cloud', span: 'lg:col-span-3', Visual: ArrayVisual },
  { exp: 2, ds: 'Singly linked list', module: 'Alert Chain', role: 'Newest bulletin at the head; follow-ups slot in right after the bulletin they update.', cx: 'O(1) insert at head', tone: 'asphalt', span: 'lg:col-span-3', Visual: ListVisual },
  { exp: 3, ds: 'Stack · infix → postfix', module: 'Rule Compiler', role: 'IMD criteria written as readable rules, compiled to postfix and evaluated for every district.', cx: 'O(n) per rule', tone: 'midnight', span: 'lg:col-span-2', Visual: StackVisual },
  { exp: 4, ds: 'Circular queue', module: 'Sensor Ring', role: '24 hourly readings per station. The oldest is overwritten in place — a rolling day, no shifting.', cx: 'O(1) enqueue', tone: 'silver', span: 'lg:col-span-2', Visual: RingVisual },
  { exp: 5, ds: 'Binary search tree', module: 'Hotspot Index', role: 'Districts keyed by Tmax. Reverse in-order is the live ranking; range queries pull a severity band.', cx: 'O(h) search', tone: 'asphalt', span: 'lg:col-span-2', Visual: TreeVisual },
  { exp: 6, ds: 'Graph · BFS', module: 'Heat Spread Graph', role: 'Shared borders are edges. BFS finds contiguous hot zones, alert rings and the nearest cooler district.', cx: 'O(V²) matrix', tone: 'cloud', span: 'lg:col-span-2', Visual: GraphVisual },
  { exp: 7, ds: 'Sorting · binary search', module: 'Climate Archive', role: '48,312 daily maxima, sorted once, so today can be ranked against eleven seasons in O(log n).', cx: 'O(n log n) · O(log n)', tone: 'midnight', span: 'lg:col-span-2', Visual: SearchVisual },
  { exp: 8, ds: 'Hash table · circular array', module: 'Instant Lookup', role: 'District by name, former name or HQ PIN — Aurangabad still finds Chhatrapati Sambhajinagar.', cx: 'O(1) average', tone: 'silver', span: 'lg:col-span-2', Visual: HashVisual },
];

const TONE: Record<Tone, { card: string; text: string; sub: string; glow: string; light: boolean }> = {
  cloud: { card: 'bg-cloud', text: 'text-midnight', sub: 'text-midnight/70', glow: 'rgba(44,61,80,0.12)', light: true },
  silver: { card: 'bg-silver', text: 'text-midnight', sub: 'text-midnight/70', glow: 'rgba(44,61,80,0.14)', light: true },
  asphalt: { card: 'bg-asphalt border border-line', text: 'text-cloud', sub: 'text-fg-muted', glow: 'rgba(236,240,241,0.12)', light: false },
  midnight: { card: 'bg-midnight border border-line', text: 'text-cloud', sub: 'text-fg-muted', glow: 'rgba(236,240,241,0.10)', light: false },
};

export function ModulesSection() {
  return (
    <Reveal as="section" id="modules" aria-labelledby="modules-title" className="relative scroll-mt-20 px-4 py-28 sm:px-6 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading eyebrow="02 · Eight structures, one response" title="Every lab experiment does a real job." id="modules-title">
            <p>
              HEATSYNC is built from the eight data structures of the course — each one chosen because its operations match a step of the heat response, not bolted
              on for show.
            </p>
          </SectionHeading>
          <Link data-reveal href="/lab" className={buttonClass('secondary', 'md', 'group')}>
            Run them in the lab <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          {MODULES.map((m) => {
            const t = TONE[m.tone];
            return (
              <div key={m.exp} data-reveal className={m.span}>
                <SpotlightCard className={cn('rounded-[28px] p-6 sm:p-7', t.card)} glow={t.glow}>
                  <article className="flex h-full min-h-[22rem] flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className={cn('font-mono text-[10.5px] uppercase tracking-[0.2em]', t.sub)}>
                          Exp {String(m.exp).padStart(2, '0')} · {m.ds}
                        </p>
                        <h3 className={cn('mt-2 font-wide text-2xl font-black tracking-[-0.02em]', t.text)}>{m.module}</h3>
                      </div>
                      <span className={cn('font-wide text-5xl font-black leading-none opacity-15', t.text)}>{String(m.exp).padStart(2, '0')}</span>
                    </div>
                    <p className={cn('mt-3 max-w-md text-sm leading-relaxed', t.sub)}>{m.role}</p>
                    <div className="mt-auto pt-8">
                      <m.Visual tone={t.light ? 'light' : 'dark'} />
                    </div>
                    <p className={cn('mt-5 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px]', t.light ? 'border-midnight/20 text-midnight/70' : 'border-line-strong text-fg-muted')}>
                      <Cpu className="size-3" aria-hidden /> {m.cx}
                    </p>
                  </article>
                </SpotlightCard>
              </div>
            );
          })}
        </div>
      </div>
    </Reveal>
  );
}

// ── Use case & governance ───────────────────────────────────────────────────────────────────────────────────────────
export function UseCaseSection() {
  const rows = [
    ['Use case', 'KJS-CES-01 · Climate Intelligence for Heatwave Monitoring, Prediction, and Early Warning'],
    ['Vertical', 'Climate, Energy & Sustainability'],
    ['Collaborating organisation', 'India Meteorological Department (IMD), Mumbai–Pune'],
    ['Faculty owner', 'Dr. Radhika Kotecha, Professor and Head, Department of Information Technology'],
    ['Course', 'Data Structures — Experiments 1–8, each mapped to a HEATSYNC module'],
    ['Beneficiaries', 'SDMA, municipal corporations, agriculture and health departments, citizens'],
  ];
  const gov = [
    { t: 'Human in the loop', d: 'Advisories are drafts until a person approves them; only approved bulletins join the alert chain.' },
    { t: 'Honest data', d: 'Replay uses ERA5 reanalysis, live mode uses Open-Meteo guidance — always labelled, never presented as official warnings.' },
    { t: 'Transparent rules', d: 'IMD criteria are written as readable rules and compiled in the open; the step-by-step trace is one click away.' },
  ];
  return (
    <Reveal as="section" id="usecase" aria-labelledby="usecase-title" className="relative scroll-mt-20 overflow-hidden bg-cloud px-4 py-28 text-midnight sm:px-6 sm:py-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgba(44,61,80,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(44,61,80,0.06)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="relative mx-auto grid max-w-6xl gap-14 lg:grid-cols-2">
        <div>
          <p data-reveal className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-asphalt">
            <span className="h-px w-6 bg-asphalt/50" aria-hidden /> 05 · Built for
          </p>
          <h2 id="usecase-title" data-reveal="words" className="mt-4 font-wide text-[clamp(2rem,4.6vw,3.6rem)] font-black leading-[0.98] tracking-[-0.03em] text-balance">
            A real use case, an honest prototype.
          </h2>
          <p data-reveal className="mt-5 max-w-xl text-lg leading-relaxed text-asphalt">
            The use case asks for region-wise heat analysis, hotspot identification, visual decision support and stakeholder-specific advisories. HEATSYNC delivers that
            slice — with data structures you can inspect line by line.
          </p>
          <ul className="mt-10 grid gap-3">
            {gov.map((g) => (
              <li key={g.t} data-reveal className="flex gap-4 rounded-2xl border border-midnight/10 bg-white/60 p-4">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-asphalt" aria-hidden />
                <div>
                  <p className="font-semibold">{g.t}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-asphalt">{g.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <dl data-reveal="clip" className="self-start overflow-hidden rounded-3xl bg-midnight text-cloud shadow-[0_40px_90px_-40px_rgba(44,61,80,0.6)]">
          {rows.map(([k, v], i) => (
            <div key={k} className={cn('grid gap-1 px-6 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6', i > 0 && 'border-t border-line')}>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-subtle">{k}</dt>
              <dd className="text-[15px] leading-relaxed">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Reveal>
  );
}

// ── Closing ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function FinalCta() {
  return (
    <Reveal as="section" aria-labelledby="cta-title" className="relative overflow-hidden px-4 py-32 sm:px-6 sm:py-44">
      <div aria-hidden className="hairline-grid mask-radial absolute inset-0 opacity-60" />
      <div aria-hidden className="absolute left-1/2 top-1/2 size-[60vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(189,195,199,0.12),transparent_60%)]" />
      <div className="relative mx-auto max-w-5xl text-center">
        <h2 id="cta-title" data-reveal="words" className="font-wide text-[clamp(2.6rem,8vw,7rem)] font-black leading-[0.9] tracking-[-0.045em] text-cloud">
          Heat moves. So should the response.
        </h2>
        <p data-reveal className="mx-auto mt-6 max-w-xl text-lg text-fg-muted">
          Scrub through the May 2024 heatwave, switch to today’s live guidance, and watch every structure do its job.
        </p>
        <div data-reveal className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/console" className={buttonClass('primary', 'lg', 'group')}>
            Open the console <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link href="/about" className={buttonClass('secondary', 'lg')}>
            Read the method
          </Link>
        </div>
      </div>
    </Reveal>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-4 py-14 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-fg-muted">
            A data-structures mini project for AI use case KJS-CES-01. A decision-support prototype — not an official meteorological service. Always follow warnings
            from IMD (mausam.imd.gov.in) and your district administration.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">Explore</p>
          <ul className="mt-4 grid gap-2 text-sm">
            {[
              ['/console', 'Response console'],
              ['/lab', 'DSA lab'],
              ['/about', 'Method & data'],
              ['/#modules', 'Modules'],
            ].map(([h, l]) => (
              <li key={h}>
                <Link href={h} className="text-fg-muted transition-colors hover:text-cloud">
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">Data</p>
          <ul className="mt-4 grid gap-2 text-sm text-fg-muted">
            <li>ERA5 reanalysis via Open-Meteo · CC BY 4.0</li>
            <li>Live guidance: Open-Meteo forecast API · CC BY 4.0</li>
            <li>District boundaries: geoBoundaries · ODbL</li>
            <li>Criteria: IMD heatwave definitions</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-line pt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">
        <span>HEATSYNC · {new Date().getFullYear()}</span>
        <span>Sense the heat · Sync the response</span>
      </div>
    </footer>
  );
}
