import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { SiteFooter } from '@/components/landing/sections';
import { SiteNav } from '@/components/landing/site-nav';
import { buttonClass, Eyebrow } from '@/components/ui/primitives';
import { EXPERIMENTS } from '@/lib/ds/meta';
import { IMD_RULES } from '@/lib/heat';

export const metadata: Metadata = {
  title: 'Method & data',
  description: 'Problem statement, data sources, IMD heatwave criteria, how each data structure is used, and the limits of the HEATSYNC prototype.',
};

const SOURCES = [
  {
    name: 'ERA5 reanalysis',
    via: 'Open-Meteo historical weather API · CC BY 4.0',
    use: 'Daily maximum temperature for all 36 district points, 1 March – 30 June, 2015–2025 (48,312 values); May 2024 daily and hourly fields for the replay.',
  },
  {
    name: 'Open-Meteo forecast',
    via: 'Open-Meteo forecast API · CC BY 4.0',
    use: 'Live mode: 7-day maximum, feels-like, humidity and wind, plus the last 24 hourly readings, fetched in one request and cached for 30 minutes.',
  },
  {
    name: 'District boundaries',
    via: 'geoBoundaries IND ADM1 / ADM2 · ODbL / CC BY',
    use: '36 Maharashtra districts, simplified with shared borders preserved; 77 border-sharing pairs become the edges of the adjacency matrix.',
  },
  {
    name: 'Heatwave criteria',
    via: 'India Meteorological Department',
    use: 'Plains, coastal and absolute-temperature thresholds, written as rules and compiled by the stack module.',
  },
];

const LIMITS = [
  'ERA5 is a model reanalysis on a ~25 km grid, sampled at one point per district. It runs a few degrees cooler than station maxima in hot, dry interiors, so fewer days meet the heatwave criteria than IMD station records would show.',
  '“Normal” is the ERA5 2015–2024 mean for the same calendar window (±7 days), a documented stand-in for IMD’s 30-year station normals. Outside March–June no normal is defined and only absolute thresholds apply.',
  'Live mode uses numerical forecast guidance, not observations. HEATSYNC never presents either as an official warning.',
  'IoT weather stations (the use case’s Phase III) are represented by the sensor-ring module fed with reanalysis or forecast hourly data; physical stations would plug into the same ring buffer.',
  'Advisories come from a deterministic template engine following national heat-action guidance. They are drafts until a person approves them.',
];

export default function AboutPage() {
  return (
    <>
      <SmoothScroll />
      <SiteNav solid />
      <main id="main" className="pt-28">
        <Reveal as="section" className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div data-reveal>
              <Eyebrow>Method &amp; data</Eyebrow>
            </div>
            <h1 data-reveal="words" className="mt-4 font-wide text-[clamp(2.4rem,6vw,4.6rem)] font-black leading-[0.95] tracking-[-0.035em] text-cloud">
              How HEATSYNC works, and where it stops.
            </h1>
            <div data-reveal className="mt-10 rounded-[28px] bg-cloud p-7 text-midnight sm:p-9">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-asphalt">Problem statement</p>
              <p className="mt-4 text-lg leading-relaxed sm:text-xl">
                During a heatwave, district control rooms in Maharashtra must decide — every day, for 36 districts — which areas are worst, which neighbours will be next,
                where relief can be staged from, and what to tell citizens, farmers and hospitals. The inputs exist but arrive scattered: hourly weather streams,
                decades of records, IMD’s criteria. HEATSYNC is a response engine that turns them into a ranked, clustered, explained and audience-ready picture in
                milliseconds, using one classic data structure per step.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal as="section" className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div data-reveal>
              <Eyebrow>Experiment → module</Eyebrow>
            </div>
            <h2 data-reveal="words" className="mt-4 font-wide text-[clamp(1.9rem,4vw,3rem)] font-black leading-none tracking-[-0.03em] text-cloud">
              Every lab experiment, mapped.
            </h2>
            <div data-reveal="clip" className="mt-10 overflow-x-auto rounded-3xl border border-line" data-lenis-prevent>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-white/[0.04] font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">
                  <tr>
                    <th className="px-5 py-3 font-normal">Exp</th>
                    <th className="px-5 py-3 font-normal">Data structure</th>
                    <th className="px-5 py-3 font-normal">Module</th>
                    <th className="px-5 py-3 font-normal">Job in the heat response</th>
                    <th className="px-5 py-3 font-normal">Key operations</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPERIMENTS.map((e) => (
                    <tr key={e.exp} className="border-t border-line align-top">
                      <td className="px-5 py-4 font-wide text-lg font-black text-cloud">{String(e.exp).padStart(2, '0')}</td>
                      <td className="px-5 py-4 text-cloud">{e.title}</td>
                      <td className="px-5 py-4 text-cloud">{e.module}</td>
                      <td className="px-5 py-4 leading-relaxed text-fg-muted">{e.role}</td>
                      <td className="px-5 py-4 font-mono text-[11px] leading-relaxed text-fg-muted">
                        {e.ops.slice(0, 4).map((o) => (
                          <span key={o.name} className="block">
                            {o.name} · {o.complexity}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p data-reveal className="mt-4 text-sm text-fg-muted">
              The C implementations of all eight experiments, adapted to this use case, are in the repository’s <code className="font-mono text-cloud">c/</code> folder with
              their run transcripts.
            </p>
          </div>
        </Reveal>

        <Reveal as="section" className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
            <div>
              <div data-reveal>
                <Eyebrow>Heatwave criteria</Eyebrow>
              </div>
              <h2 data-reveal="words" className="mt-4 font-wide text-[clamp(1.9rem,4vw,3rem)] font-black leading-none tracking-[-0.03em] text-cloud">
                IMD’s rules, as code.
              </h2>
              <p data-reveal className="mt-5 leading-relaxed text-fg-muted">
                The rule compiler tokenises each rule, converts it to postfix with a linked stack and evaluates it for every district. A reference classifier written
                directly in TypeScript checks the compiled rules on every snapshot.
              </p>
            </div>
            <div className="grid gap-3">
              {(['plains', 'coastal'] as const).map((k) => (
                <div key={k} data-reveal className="glass rounded-3xl p-5">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">{k === 'plains' ? 'Plains stations' : 'Coastal stations (Konkan)'}</p>
                  <dl className="mt-3 grid gap-2 font-mono text-[12.5px]">
                    {(['severe', 'heatwave', 'watch'] as const).map((lvl) => (
                      <div key={lvl} className="grid grid-cols-[5.5rem_1fr] gap-3">
                        <dt className="text-fg-subtle">{lvl}</dt>
                        <dd className="text-cloud">{IMD_RULES[k][lvl]}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              <p data-reveal className="px-1 text-xs leading-relaxed text-fg-subtle">
                tmax = daily maximum (°C) · dep = departure from normal (°C). “Watch” is HEATSYNC’s early flag for a hot day that does not yet meet IMD’s heatwave
                definition.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal as="section" className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2">
            {SOURCES.map((s) => (
              <div key={s.name} data-reveal className="rounded-3xl border border-line bg-midnight p-6">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">{s.via}</p>
                <h3 className="mt-2 text-lg font-semibold text-cloud">{s.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.use}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal as="section" className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div data-reveal>
              <Eyebrow>Limitations</Eyebrow>
            </div>
            <h2 data-reveal="words" className="mt-4 font-wide text-[clamp(1.9rem,4vw,3rem)] font-black leading-none tracking-[-0.03em] text-cloud">
              What this prototype is not.
            </h2>
            <ol className="mt-8 grid gap-3">
              {LIMITS.map((l, i) => (
                <li key={i} data-reveal className="flex gap-4 rounded-2xl border border-line bg-white/[0.02] p-5">
                  <span className="font-wide text-lg font-black text-silver">{String(i + 1).padStart(2, '0')}</span>
                  <p className="text-[15px] leading-relaxed text-fg-muted">{l}</p>
                </li>
              ))}
            </ol>
            <div data-reveal className="mt-12 flex flex-wrap gap-3">
              <Link href="/console" className={buttonClass('primary', 'lg', 'group')}>
                Open the console <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link href="/lab" className={buttonClass('secondary', 'lg')}>
                DSA lab
              </Link>
            </div>
          </div>
        </Reveal>
      </main>
      <SiteFooter />
    </>
  );
}
