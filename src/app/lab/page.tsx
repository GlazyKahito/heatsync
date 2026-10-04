import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { Reveal } from '@/components/motion/reveal';
import { SiteNav } from '@/components/landing/site-nav';
import { SiteFooter } from '@/components/landing/sections';
import { Eyebrow } from '@/components/ui/primitives';
import { LabApp } from '@/components/lab/lab-app';
import type { CSource } from '@/components/lab/model';

export const metadata: Metadata = {
  title: 'DSA Lab',
  description:
    'Run all eight HEATSYNC data structures on real May 2024 heat data — array, linked list, stack, circular queue, BST, graph BFS, sorting with binary search and a hash table — and replay every operation step by step next to its C implementation.',
};

const C_FILES: Record<number, string> = {
  1: 'exp1_station_registry.c',
  2: 'exp2_alert_chain.c',
  3: 'exp3_rule_compiler.c',
  4: 'exp4_sensor_ring.c',
  5: 'exp5_hotspot_bst.c',
  6: 'exp6_heat_spread_bfs.c',
  7: 'exp7_archive_search.c',
  8: 'exp8_station_dictionary.c',
};

function readSources(): Record<number, CSource> {
  const out: Record<number, CSource> = {};
  for (const [exp, file] of Object.entries(C_FILES)) {
    let code: string;
    try {
      code = fs.readFileSync(path.join(process.cwd(), 'c', file), 'utf8');
    } catch {
      code = `/* c/${file} could not be read on the server. */\n`;
    }
    out[Number(exp)] = { file, code };
  }
  return out;
}

function LabIntro({ cLines }: { cLines: number }) {
  const facts = [
    ['8', 'structures'],
    ['36', 'districts'],
    ['17', 'replay days'],
    [cLines.toLocaleString('en-IN'), 'lines of C'],
  ];
  return (
    <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end lg:gap-14">
      <div>
        <div data-reveal>
          <Eyebrow>DSA Lab · 8 experiments</Eyebrow>
        </div>
        <h1 data-reveal="words" className="mt-5 font-wide text-[clamp(2.4rem,6.2vw,5rem)] font-black leading-[0.92] tracking-[-0.045em] text-cloud text-balance">
          Run every structure on real heat.
        </h1>
      </div>
      <div>
        <p data-reveal className="max-w-xl text-base leading-relaxed text-fg-muted text-pretty sm:text-lg">
          Each lab experiment powers one HEATSYNC module. Pick a replay day from the May 2024 heatwave, run the operations on that day’s readings and step through
          every comparison, pointer move and probe, with the C program alongside.
        </p>
        <dl data-reveal className="mt-6 grid grid-cols-4 gap-2">
          {facts.map(([v, l]) => (
            <div key={l} className="flex min-w-0 flex-col-reverse rounded-2xl border border-line bg-white/[0.03] px-3 py-2.5">
              <dt className="mt-0.5 truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-subtle">{l}</dt>
              <dd className="font-wide text-lg font-black tracking-[-0.02em] text-cloud tabular sm:text-xl">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Reveal>
  );
}

export default function LabPage() {
  const sources = readSources();
  const cLines = Object.values(sources).reduce((n, s) => n + s.code.split('\n').length, 0);
  return (
    <>
      <a href="#main" className="sr-only z-[110] rounded-full bg-cloud px-4 py-2 text-midnight focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <SmoothScroll />
      <div className="relative">
        <SiteNav solid />
        <main id="main" tabIndex={-1} className="outline-none">
          <LabApp sources={sources} intro={<LabIntro cLines={cLines} />} />
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
