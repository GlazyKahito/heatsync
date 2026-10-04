'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Wordmark } from '@/components/brand/logo';
import { buttonClass } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/#problem', label: 'Problem' },
  { href: '/#modules', label: 'Modules' },
  { href: '/#pipeline', label: 'Pipeline' },
  { href: '/#live', label: 'Live' },
  { href: '/lab', label: 'DSA Lab' },
  { href: '/about', label: 'Method' },
];

/** Floating glass nav: hides while scrolling down, returns on scroll up, gains a backdrop once off the hero. */
export function SiteNav({ solid = false }: { solid?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(solid);
  const [open, setOpen] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(solid || y > 40);
      setHidden(y > 320 && y > last.current + 4);
      if (y < last.current - 4) setHidden(false);
      last.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [solid]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 px-3 pt-3 transition-transform duration-500 ease-[var(--ease-out-expo)] sm:px-5 sm:pt-4',
        hidden && !open && '-translate-y-[120%]',
      )}
    >
      <nav
        aria-label="Primary"
        className={cn(
          'mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-full border pl-4 pr-2 transition-[background-color,border-color,box-shadow] duration-500',
          scrolled
            ? 'border-line-strong bg-abyss/70 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl'
            : 'border-transparent bg-transparent',
        )}
      >
        <Link href="/" aria-label="HEATSYNC home" className="rounded-full">
          <Wordmark />
        </Link>
        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="group relative rounded-full px-3.5 py-2 text-sm text-fg-muted transition-colors hover:text-cloud">
                <span className="absolute inset-0 scale-75 rounded-full bg-white/[0.06] opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100" />
                <span className="relative">{l.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link href="/console" className={buttonClass('primary', 'sm', 'group hidden sm:inline-flex')}>
            Open console
            <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-cloud hover:bg-white/5 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong mx-auto mt-2 max-w-6xl rounded-3xl p-3 lg:hidden"
          >
            <ul className="grid gap-1">
              {[...LINKS, { href: '/console', label: 'Open console' }].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 text-base text-cloud hover:bg-white/5">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
