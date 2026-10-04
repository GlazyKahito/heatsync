'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { INTRO_DONE_EVENT, INTRO_ID } from '@/components/intro/constants';

gsap.registerPlugin(ScrollTrigger);

/**
 * Inertial scrolling (Lenis) driven by GSAP's ticker, so every ScrollTrigger scene reads the same smoothed position on
 * the same frame. Paused while the intro covers the page; off under reduced motion. Nested scrollers opt out with
 * `data-lenis-prevent`.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: false, anchors: { offset: -72 }, lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.1 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const resume = () => {
      lenis.start();
      ScrollTrigger.refresh();
    };
    if (document.getElementById(INTRO_ID)?.hasAttribute('data-active')) {
      lenis.stop();
      window.addEventListener(INTRO_DONE_EVENT, resume, { once: true });
    }
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    return () => {
      window.removeEventListener(INTRO_DONE_EVENT, resume);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, []);
  return null;
}
