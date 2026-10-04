'use client';

import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Copy, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { C_TOKEN_CLASS, highlightLines } from './c-highlight';
import type { CSource } from './model';

const ease = [0.16, 1, 0.3, 1] as const;

function CodeBody({ code }: { code: string }) {
  const lines = useMemo(() => highlightLines(code), [code]);
  const gutter = String(lines.length).length;
  return (
    <div
      data-lenis-prevent
      tabIndex={0}
      aria-label="C source code"
      className="scrollbar-thin max-h-[34rem] overflow-auto overscroll-contain rounded-2xl border border-line bg-void/70"
    >
      <pre className="min-w-max py-4 font-mono text-[12px] leading-[1.7]">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex pr-6 hover:bg-white/[0.025]">
              <span aria-hidden className="sticky left-0 select-none bg-void/95 pl-4 pr-4 text-right text-fg-subtle/60" style={{ minWidth: `${gutter + 3}ch` }}>
                {i + 1}
              </span>
              <span className="whitespace-pre">
                {line.length === 0 ? ' ' : line.map((tk, j) => (
                  <span key={j} className={C_TOKEN_CLASS[tk.kind]}>
                    {tk.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

/** Collapsible, highlighted view of the experiment's C program. Tokenized only when opened. */
export function CodeViewer({ source }: { source: CSource }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const id = useId();
  const lineCount = useMemo(() => source.code.split('\n').length, [source.code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="glass rounded-[28px] p-2 sm:p-3" aria-label="C implementation">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-[22px] px-3 py-3 text-left transition-colors hover:bg-white/[0.04] sm:px-4"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-line-strong bg-white/[0.04]">
            <FileCode2 className="size-4 text-silver" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">C implementation</span>
            <span className="block truncate font-mono text-sm text-cloud">
              c/{source.file} <span className="text-fg-subtle">· {lineCount} lines</span>
            </span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-fg-muted transition-transform duration-300', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <button
            type="button"
            onClick={copy}
            className="mr-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 font-mono text-[11px] text-fg-muted transition-colors hover:text-cloud"
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="code"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease }}
            className="overflow-hidden"
          >
            <div className="px-1 pb-1 pt-2">
              <CodeBody code={source.code} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
