import type { Metadata } from 'next';
import { ConsoleApp } from '@/components/console/console-app';

export const metadata: Metadata = {
  title: 'Response console',
  description: 'Replay the May 2024 Maharashtra heat spell or follow today’s guidance: hotspot ranking, heat zones, compiled IMD rules, sensor rings, alert chain and advisories.',
};

export default async function ConsolePage({ searchParams }: PageProps<'/console'>) {
  const mode = (await searchParams).mode === 'live' ? 'live' : 'replay';
  return (
    <main id="main">
      <h1 className="sr-only">HEATSYNC response console</h1>
      <ConsoleApp initialMode={mode} />
    </main>
  );
}
