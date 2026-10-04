import { Intro } from '@/components/intro/intro';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { Hero } from '@/components/landing/hero';
import { LivePulse } from '@/components/landing/live-pulse';
import { PipelineSection } from '@/components/landing/pipeline';
import { FinalCta, ModulesSection, ProblemSection, SiteFooter, UseCaseSection } from '@/components/landing/sections';
import { SiteNav } from '@/components/landing/site-nav';

export default function Home() {
  return (
    <>
      <a href="#main" className="sr-only z-[110] rounded-full bg-cloud px-4 py-2 text-midnight focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <Intro />
      <SmoothScroll />
      <div id="hs-page" className="relative">
        <SiteNav />
        <main id="main" tabIndex={-1} className="outline-none">
          <Hero />
          <ProblemSection />
          <ModulesSection />
          <PipelineSection />
          <LivePulse />
          <UseCaseSection />
          <FinalCta />
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
