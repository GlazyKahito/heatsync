import type { Metadata, Viewport } from 'next';
import { Archivo, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

// Archivo (variable width, set extended + black) for the wordmark and figures; Geist for UI; Geist Mono for data.
const archivo = Archivo({ variable: '--font-archivo', subsets: ['latin'], axes: ['wdth'], display: 'swap' });
const geist = Geist({ variable: '--font-geist', subsets: ['latin'], display: 'swap' });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://heatsync-mh.vercel.app'),
  title: { default: 'HEATSYNC — Sense the heat. Sync the response.', template: '%s · HEATSYNC' },
  description:
    'HEATSYNC turns raw temperature readings into a heatwave response for Maharashtra: hotspot ranking, contiguous heat clusters, relief staging and audience-specific advisories — every module powered by a classic data structure.',
  applicationName: 'HEATSYNC',
  openGraph: {
    title: 'HEATSYNC — Sense the heat. Sync the response.',
    description: 'A data-structure powered heatwave response engine for Maharashtra, built on real ERA5 and Open-Meteo data.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a2531',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-IN" className={`${archivo.variable} ${geist.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
