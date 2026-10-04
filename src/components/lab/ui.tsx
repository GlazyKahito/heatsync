'use client';

import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DayRow } from '@/lib/data';
import { cn } from '@/lib/utils';
import { DISTRICTS_BY_NAME, TONE_HEX, type Tone } from './model';

export const inputClass =
  'h-10 w-full min-w-0 rounded-full border border-line-strong bg-void/50 px-4 font-mono text-[13px] text-cloud placeholder:text-fg-subtle transition-[border-color,background-color] hover:border-silver/30 focus-visible:border-silver/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cloud/70';

/** A titled group of controls for one engine operation. */
export function OpGroup({ op, complexity, hint, children, className }: { op: string; complexity?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-[22px] border border-line bg-white/[0.025] p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[12px] text-cloud">{op}()</p>
        {complexity && <p className="shrink-0 font-mono text-[10.5px] text-fg-subtle">{complexity}</p>}
      </div>
      {hint && <div className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">{hint}</div>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">{children}</div>
    </div>
  );
}

export function SelectField({ className, children, label, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <span className={cn('relative block min-w-0', className)}>
      <select aria-label={label} {...rest} className={cn(inputClass, 'cursor-pointer appearance-none pr-9 [&>option]:bg-night [&>optgroup]:bg-night')}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
    </span>
  );
}

/** District picker labelled with the selected day's Tmax. */
export function DistrictSelect({ value, onChange, rows, label = 'District', className, disabled }: { value: number; onChange: (id: number) => void; rows: DayRow[]; label?: string; className?: string; disabled?: boolean }) {
  return (
    <SelectField label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} className={className} disabled={disabled}>
      {DISTRICTS_BY_NAME.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name} · {rows[d.id].tmax.toFixed(1)} °C
        </option>
      ))}
    </SelectField>
  );
}

/** The visualization surface. */
export function StageCard({ title, meta, status, children, className, bodyClassName }: { title: ReactNode; meta?: ReactNode; status?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('relative overflow-hidden rounded-[28px] border border-line bg-void/45', className)}>
      <div aria-hidden className="hairline-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted">{title}</p>
        {meta && <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-subtle">{meta}</div>}
        {status && <div className="ml-auto">{status}</div>}
      </div>
      <div className={cn('relative p-5 sm:p-6', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-abyss/60 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-cloud">
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: TONE_HEX[tone] }} />
      {children}
    </span>
  );
}

export function MetaTag({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-line px-2 py-0.5 tabular">{children}</span>;
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-2xl border border-line bg-white/[0.025] px-4 py-3', className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-subtle">{label}</p>
      <p className="mt-1 truncate font-wide text-xl font-black tracking-[-0.02em] text-cloud tabular">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">{sub}</p>}
    </div>
  );
}

/** Small titled panel used beside or below the stage. */
export function Inspector({ title, children, className, aside }: { title: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={cn('glass min-w-0 rounded-[28px] p-5 sm:p-6', className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted">{title}</h3>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-subtle">{children}</p>;
}
