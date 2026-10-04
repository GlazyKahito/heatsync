'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Muted, looping background clip that only downloads and plays while it is on screen (and never under reduced
 * motion, where the poster frame stays). The footage is colour-graded to the palette at encode time, so no CSS
 * filters run while it plays.
 */
export function BgVideo({ src, poster, className }: { src: string; poster: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (v.preload !== 'auto') v.preload = 'auto';
          v.play().catch(() => {});
        } else v.pause();
      },
      { rootMargin: '200px' },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} className={cn('h-full w-full object-cover', className)} src={src} poster={poster} muted loop playsInline preload="none" aria-hidden />;
}
