'use client';

import { useSyncExternalStore } from 'react';

/** Rendering tier, decided once per visit: 'high' = shadows + post-processing, 'low' = plain 3D, 'off' = no WebGL. */
export type Tier = 'high' | 'low' | 'off';

const KEY = 'hs_tier';
let cached: Tier | null = null;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function detectTier(): Tier {
  if (cached) return cached;
  if (typeof window === 'undefined') return 'low';
  try {
    const forced = window.localStorage.getItem(KEY) as Tier | null;
    if (forced === 'high' || forced === 'low' || forced === 'off') return (cached = forced);
  } catch {}
  if (!hasWebGL()) return (cached = 'off');
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = window.innerWidth < 768;
  cached = cores <= 4 || mem <= 4 || (coarse && small) ? 'low' : 'high';
  return cached;
}

/** Remember an explicit choice (the "Lite mode" switch). */
export function setTier(t: Tier) {
  cached = t;
  try {
    window.localStorage.setItem(KEY, t);
  } catch {}
  window.dispatchEvent(new CustomEvent('hs:tier', { detail: t }));
}

export const SCENE_READY_EVENT = 'hs:scene-ready';
let sceneReady = false;
export function markSceneReady() {
  if (sceneReady) return;
  sceneReady = true;
  window.dispatchEvent(new Event(SCENE_READY_EVENT));
}
export function onSceneReady(fn: () => void) {
  if (sceneReady) {
    fn();
    return () => {};
  }
  window.addEventListener(SCENE_READY_EVENT, fn, { once: true });
  return () => window.removeEventListener(SCENE_READY_EVENT, fn);
}

const subscribeTier = (cb: () => void) => {
  window.addEventListener('hs:tier', cb);
  return () => window.removeEventListener('hs:tier', cb);
};
/** Current tier as external state: null during SSR / before hydration, then the detected or chosen tier. */
export function useTier(): Tier | null {
  return useSyncExternalStore(subscribeTier, detectTier, () => null);
}
