import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LEVELS, type Level } from '@/lib/heat';

type Variant = 'primary' | 'secondary' | 'ghost' | 'light';
type Size = 'sm' | 'md' | 'lg';

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(
    'relative inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-300 ease-[var(--ease-out-expo)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
    size === 'sm' && 'h-9 px-4 text-sm',
    size === 'md' && 'h-11 px-5 text-sm',
    size === 'lg' && 'h-13 px-7 text-[15px]',
    variant === 'primary' &&
      'bg-cloud text-midnight shadow-[0_10px_40px_-12px_rgba(236,240,241,0.55),inset_0_-2px_0_rgba(44,61,80,0.15)] hover:bg-white hover:shadow-[0_14px_50px_-12px_rgba(236,240,241,0.75)]',
    variant === 'secondary' && 'border border-line-strong bg-asphalt/40 text-cloud backdrop-blur hover:border-silver/40 hover:bg-asphalt/70',
    variant === 'ghost' && 'text-fg-muted hover:bg-white/5 hover:text-cloud',
    variant === 'light' && 'bg-midnight text-cloud hover:bg-asphalt',
    extra,
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted', className)}>
      <span className="h-px w-6 bg-silver/50" aria-hidden />
      {children}
    </p>
  );
}

export function LevelDot({ level, className }: { level: Level; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: LEVELS[level].color }} />;
}

export function LevelChip({ level, className }: { level: Level; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]', className)}
      style={{ borderColor: `color-mix(in srgb, ${LEVELS[level].color} 45%, transparent)`, color: LEVELS[level].color }}
    >
      <LevelDot level={level} className="size-1.5" />
      {LEVELS[level].short}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{children}</kbd>;
}

export function Panel({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <Tag className={cn('glass relative rounded-3xl', className)}>{children}</Tag>;
}
