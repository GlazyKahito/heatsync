'use client';

import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Card with a cursor-following spotlight and a gentle 3D tilt (pointer devices only). Inspired by the spotlight /
 * tilt card patterns popular on 21st.dev; written from scratch with CSS variables so it costs no re-renders.
 */
export function SpotlightCard({ children, className, glow = 'rgba(236,240,241,0.14)', tilt = 6 }: { children: ReactNode; className?: string; glow?: string; tilt?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      el.style.setProperty('--rx', `${((0.5 - y) * tilt).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * tilt).toFixed(2)}deg`);
    });
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="[perspective:1200px]">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className={cn(
          'group/spot relative h-full overflow-hidden transition-transform duration-500 ease-[var(--ease-out-expo)] [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d]',
          className,
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
          style={{ background: `radial-gradient(420px circle at var(--mx,50%) var(--my,50%), ${glow}, transparent 60%)` }}
        />
        <div className="relative z-10 h-full">{children}</div>
      </div>
    </div>
  );
}
