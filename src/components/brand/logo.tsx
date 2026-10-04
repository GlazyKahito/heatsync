import { cn } from '@/lib/utils';

/**
 * HEATSYNC mark: a three-node graph (the response network) whose edges are heat waves, closed into a ring.
 * Pure SVG in currentColor so it inherits any surface.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-7', className)} fill="none">
      <circle cx="16" cy="16" r="14.25" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M7.5 20.5c2.2-3 3.4-6.6 8.5-9.8m0 0c4.6 2.6 6.6 6.3 8.5 9.8M7.5 20.5h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 20.5c1-1.2 1.8-1.2 2.8 0s1.8 1.2 2.8 0 1.8-1.2 2.8 0 1.6 1.2 2.4 0" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" transform="translate(0 3.4)" />
      <circle cx="16" cy="10.7" r="2.6" fill="currentColor" />
      <circle cx="7.5" cy="20.5" r="2.1" fill="currentColor" />
      <circle cx="24.5" cy="20.5" r="2.1" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="size-7 text-cloud" />
      <span className="font-wide text-[15px] font-black tracking-[0.04em] text-cloud">HEATSYNC</span>
    </span>
  );
}
