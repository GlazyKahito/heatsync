'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const ENTER = 'top 86%';

/**
 * Scroll reveals for everything inside. Markers:
 *   data-reveal            rise + fade + de-blur, batched so siblings stagger
 *   data-reveal="words"    heading words rise out of per-line masks
 *   data-reveal="clip"     panel wipes open from the bottom
 *   data-reveal="scale"    panel grows from 92% with a soft fade
 *   data-reveal="line"     rule draws left → right
 *   data-count             number counts up from 0 when its card reveals
 *   data-parallax="n"      drifts by n% of its height across the viewport
 * Nothing is hidden in the server HTML: content stays readable without JS and under reduced motion.
 */
export function Reveal({
  children,
  className,
  as: Tag = 'div',
  id,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'footer';
  id?: string;
  'aria-labelledby'?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const restore: (() => void)[] = [];
        const q = gsap.utils.selector(ref);

        const items = q('[data-reveal=""], [data-reveal="true"]') as HTMLElement[];
        if (items.length) {
          gsap.set(items, { autoAlpha: 0, y: 36, filter: 'blur(6px)' });
          ScrollTrigger.batch(items, {
            start: ENTER,
            once: true,
            onEnter: (batch) =>
              gsap.to(batch, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.05, ease: 'power3.out', stagger: 0.08, overwrite: true, clearProps: 'filter' }),
          });
        }

        (q('[data-reveal="words"]') as HTMLElement[]).forEach((el) => {
          SplitText.create(el, {
            type: 'lines,words',
            mask: 'lines',
            autoSplit: true,
            onSplit: (self) =>
              gsap.from(self.words, {
                yPercent: 118,
                rotate: 3,
                duration: 1.1,
                ease: 'expo.out',
                stagger: 0.04,
                scrollTrigger: { trigger: el, start: ENTER, once: true },
              }),
          });
        });

        (q('[data-reveal="clip"]') as HTMLElement[]).forEach((el) => {
          const radius = getComputedStyle(el).borderTopLeftRadius || '0px';
          const p = { k: 0 };
          const draw = () => (el.style.clipPath = `inset(${((1 - p.k) * 100).toFixed(2)}% 0% 0% 0% round ${radius})`);
          draw();
          gsap.to(p, {
            k: 1,
            duration: 1.3,
            ease: 'expo.inOut',
            onUpdate: draw,
            onComplete: () => (el.style.clipPath = ''),
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
          restore.push(() => (el.style.clipPath = ''));
        });

        (q('[data-reveal="scale"]') as HTMLElement[]).forEach((el) => {
          gsap.fromTo(
            el,
            { autoAlpha: 0, scale: 0.92, y: 40 },
            { autoAlpha: 1, scale: 1, y: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } },
          );
        });

        (q('[data-reveal="line"]') as HTMLElement[]).forEach((el) => {
          gsap.fromTo(
            el,
            { scaleX: 0, transformOrigin: '0% 50%' },
            { scaleX: 1, duration: 1.3, ease: 'power3.inOut', scrollTrigger: { trigger: el, start: 'top 92%', once: true } },
          );
        });

        (q('[data-count]') as HTMLElement[]).forEach((el) => {
          const node = el.firstChild;
          const final = node instanceof Text ? (node.nodeValue ?? '') : '';
          const value = Number(final);
          if (!(node instanceof Text) || !final.trim() || !Number.isFinite(value)) return;
          const decimals = final.split('.')[1]?.length ?? 0;
          const s = { v: 0 };
          node.nodeValue = (0).toFixed(decimals);
          gsap.to(s, {
            v: value,
            duration: 1.8,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: ENTER, once: true },
            onUpdate: () => (node.nodeValue = s.v.toFixed(decimals)),
            onComplete: () => (node.nodeValue = final),
          });
          restore.push(() => (node.nodeValue = final));
        });

        (q('[data-parallax]') as HTMLElement[]).forEach((el) => {
          const amount = Number(el.dataset.parallax) || 10;
          gsap.fromTo(el, { yPercent: amount }, { yPercent: -amount, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
        });

        return () => restore.forEach((f) => f());
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref as never} id={id} className={cn(className)} {...rest}>
      {children}
    </Tag>
  );
}
