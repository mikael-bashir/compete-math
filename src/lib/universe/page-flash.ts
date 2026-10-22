// The page flash: when the target's star goes off in the visualiser (nova.ts), light reaches the whole page for a moment, the navbar, the strip, the
// footer and the visualiser's own frame included, centred on where the star is. One overlay above everything, added to the light below it
// (plus-lighter, or screen where that is not known), faded by the Web Animations API and then removed. One flash that decays: never repeated,
// never a strobe. Reduced motion gets none of it.

import { PAGE_FLASH, pageFlashFrames } from './nova';

let last = 0;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Flash the whole page, centred on `x`, `y` (the window's CSS pixels). `strength` scales the peak (0..1, default 1). */
export function flashPage(at: { x: number; y: number; strength?: number }): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) return;
  const now = performance.now();
  if (now - last < PAGE_FLASH.durationMs * 0.5) return; // never a second flash on top of one that is still fading
  last = now;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const blend = typeof CSS !== 'undefined' && CSS.supports?.('mix-blend-mode', 'plus-lighter') ? 'plus-lighter' : 'screen';
  const s = el.style;
  s.position = 'fixed';
  s.inset = '0';
  s.zIndex = '2147483000';
  s.pointerEvents = 'none';
  s.opacity = '0';
  s.mixBlendMode = blend;
  s.background = `radial-gradient(circle at ${Math.round(at.x)}px ${Math.round(at.y)}px, rgba(255,252,240,1) 0, rgba(255,238,205,.88) 14%, rgba(255,224,172,.62) 40%, rgba(255,214,150,.5) 100%)`;
  document.body.appendChild(el);
  const a = el.animate(pageFlashFrames(PAGE_FLASH.peak * Math.min(1, Math.max(0, at.strength ?? 1))), { duration: PAGE_FLASH.durationMs, easing: 'linear', fill: 'forwards' });
  const done = (): void => el.remove();
  a.onfinish = done;
  a.oncancel = done;
}
