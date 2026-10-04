'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { BgVideo } from './bg-video';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Transition between the problem and the modules: the footage opens as a framed window and grows to fill the screen
 * as you scroll. Only transform and opacity animate (the radius is fixed), so a playing video never forces a repaint.
 */
export function VideoInterlude() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap
          .timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom bottom', scrub: 0.8 } })
          .fromTo('[data-iv-frame]', { scale: 0.62 }, { scale: 1, ease: 'power2.inOut', duration: 0.55 }, 0)
          .fromTo('[data-iv-line]', { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.25, ease: 'power3.out' }, 0.35)
          .fromTo('[data-iv-caption]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, 0.55)
          .to('[data-iv-shade]', { opacity: 0.7, duration: 0.4 }, 0.3);
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-label="Interlude" className="relative h-[220svh]">
      <div className="sticky top-0 grid h-svh place-items-center overflow-hidden">
        <div data-iv-frame className="relative h-full w-full overflow-hidden rounded-[28px] will-change-transform" style={{ transform: 'scale(0.62)' }}>
          <BgVideo src="/media/heat-52441.mp4" poster="/media/heat-52441.jpg" />
          <div data-iv-shade aria-hidden className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/40 to-abyss/10 opacity-40" />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-[14%] px-6 text-center">
          <p className="mx-auto max-w-5xl font-wide text-[clamp(2.2rem,6vw,5.4rem)] font-black leading-[0.95] tracking-[-0.04em] text-cloud">
            <span data-iv-line className="block">The asphalt heats first.</span>
            <span data-iv-line className="block text-silver">Then everyone on it.</span>
          </p>
          <p data-iv-caption className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted">
            Outdoor workers, drivers, vendors — the first people every HEATSYNC advisory is written for
          </p>
        </div>
      </div>
    </section>
  );
}
