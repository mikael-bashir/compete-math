'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { createNovaRenderer, startingScale, type NovaRenderer } from './renderer';
import { FADE_OUT_FROM_S, TEXT_IN_S, TOTAL_S, smoothstep, textOpacity } from './timeline';

// What happens on screen when a target is proved: the sky goes dark, a star collapses, and it goes off. A full-screen overlay (or, on the
// preview page, a box) with the word in the glow. Click or Esc to let it go early. It plays once per `playId`; 0 is nothing.
//
// The frame is drawn at `time` when that is given (the preview page's scrubber), otherwise from a clock that starts with the play.
// prefers-reduced-motion gets one still frame and the word, no flash. A browser without WebGL2 gets a plain CSS bloom.

export interface ProofSupernovaProps {
  playId: number;
  title?: string; // the theorem's name, under the word
  mode?: 'overlay' | 'inline';
  time?: number | null;
  figure?: boolean;
  onDone?: () => void;
}

const STILL_T = 4.6; // the frame shown to prefers-reduced-motion
const STILL_HOLD_S = 3.6;
const WORD = 'PROVED';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return reduced;
}

function Stage({ title, time, figure, reduced, skip, onDone }: Omit<ProofSupernovaProps, 'playId' | 'mode'> & { reduced: boolean; skip: MutableRefObject<boolean> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const seed = useRef(Math.random() * 100);
  const [fallback, setFallback] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // the word: out of the glow (blur and wide spacing resolve), and away before the sky does
  const styleText = (T: number) => {
    const o = textOpacity(T);
    const p = smoothstep(TEXT_IN_S, TEXT_IN_S + 1.3, T);
    if (wordRef.current) {
      const s = wordRef.current.style;
      s.opacity = String(o);
      s.filter = `blur(${((1 - p) * 14).toFixed(1)}px)`;
      s.letterSpacing = `${(0.62 - 0.4 * (1 - (1 - p) * (1 - p))).toFixed(3)}em`;
      s.textShadow = `0 0 ${(10 + 14 * p).toFixed(0)}px rgba(255,70,50,${(0.9 * p).toFixed(2)}), 0 0 ${(40 + 30 * p).toFixed(0)}px rgba(255,30,20,${(0.7 * p).toFixed(2)}), 0 0 ${(110 + 60 * p).toFixed(0)}px rgba(255,20,20,${(0.5 * p).toFixed(2)})`;
    }
    if (subRef.current) subRef.current.style.opacity = String(smoothstep(TEXT_IN_S + 0.7, TEXT_IN_S + 1.9, T) * (1 - smoothstep(FADE_OUT_FROM_S - 0.6, FADE_OUT_FROM_S + 0.8, T)));
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const renderer: NovaRenderer | null = reduced ? null : createNovaRenderer(canvas, seed.current);
    if (!reduced && !renderer) {
      setFallback(true);
    }
    if (renderer) renderer.setFigure(figure !== false);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = wrap.getBoundingClientRect();
    let scale = startingScale(box.width, box.height, dpr);
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      renderer?.resize(Math.max(2, r.width), Math.max(2, r.height), dpr, scale);
    };
    fit();
    const ro = new ResizeObserver(() => {
      fit();
      if (time != null && renderer) {
        renderer.render(time);
      }
    });
    ro.observe(wrap);

    // scrub: one frame at `time`
    if (time != null) {
      renderer?.render(time);
      styleText(time);
      return () => {
        ro.disconnect();
        renderer?.dispose();
      };
    }

    // a still for prefers-reduced-motion: no flash, no motion
    if (reduced) {
      styleText(STILL_T);
      const id = window.setTimeout(() => doneRef.current?.(), STILL_HOLD_S * 1000);
      return () => window.clearTimeout(id);
    }

    // the clock: it starts after a first frame has been drawn, because that draw is where the driver compiles the shaders and a hitch there
    // would otherwise be played as time passed (the quiet before would be skipped)
    renderer?.render(0);
    const t0 = performance.now();
    let skipped = 0; // seconds jumped forward by a dismiss
    let raf = 0;
    let frames = 0;
    let acc = 0;
    let last = t0;
    const tick = (now: number) => {
      if (skip.current && skipped === 0) {
        const T = (now - t0) / 1000;
        skipped = Math.max(0, FADE_OUT_FROM_S - T);
      }
      const T = (now - t0) / 1000 + skipped;
      // adaptive resolution: if the GPU is struggling, draw smaller and let the browser scale it (the glow forgives it)
      const dt = now - last;
      last = now;
      if (frames > 3) {
        acc += dt;
        if ((frames - 3) % 12 === 0) {
          const avg = acc / 12;
          acc = 0;
          if (avg > 22 && scale > 0.4) {
            scale = Math.max(0.4, scale * 0.8);
            renderer?.setQuality(scale > 0.6 ? 1 : 0.5);
            fit();
          }
        }
      }
      frames++;
      renderer?.render(Math.min(T, TOTAL_S));
      styleText(T);
      if (T >= TOTAL_S) {
        doneRef.current?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, time, figure]);

  // the CSS bloom for a browser with no WebGL2: a hot disc that grows and fades, over black
  useEffect(() => {
    if (!fallback || time != null) return;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const T = (now - t0) / 1000 + (skip.current ? FADE_OUT_FROM_S : 0);
      styleText(T);
      if (T >= TOTAL_S) return doneRef.current?.();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback, time]);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden"
      style={{ background: reduced ? 'radial-gradient(ellipse at 50% 45%, #1b0d12 0%, #05060d 70%)' : undefined }}
    >
      <style>{`@keyframes nova-fallback{0%{opacity:0;transform:scale(.1)}12%{opacity:1}100%{opacity:0;transform:scale(2.6)}}@keyframes nova-still{from{opacity:0}to{opacity:1}}`}</style>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
      {fallback && (
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 size-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, #fff 0%, #ffd9a0 12%, #ff7a2a 30%, #7a1a18 52%, transparent 70%)', animation: `nova-fallback ${TOTAL_S}s ease-out both` }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <div
          ref={wordRef}
          style={{
            opacity: 0,
            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
            fontWeight: 600,
            fontSize: 'clamp(44px, 12vw, 170px)',
            lineHeight: 1,
            color: '#ff3b2f',
            paddingLeft: '0.2em',
          }}
        >
          {WORD}
        </div>
        <div ref={subRef} style={{ opacity: 0 }} className="mt-5 max-w-[80vw] space-y-1.5 text-white">
          <p className="text-base font-medium tracking-wide sm:text-xl" style={{ textShadow: '0 0 18px rgba(120,170,255,.75)' }}>
            no sorry left{title ? <span className="opacity-70"> · {title}</span> : null}
          </p>
          <p className="text-xs uppercase tracking-[0.28em] text-white/50">verified by Leak IV</p>
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        Proof verified{title ? `: ${title}` : ''}. No sorry left.
      </span>
    </div>
  );
}

export function ProofSupernova({ playId, title, mode = 'overlay', time = null, figure = true, onDone }: ProofSupernovaProps) {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const skip = useRef(false); // click or Esc: the sky fades from where it is
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (playId > 0) {
      skip.current = false;
      setActive(true);
    }
  }, [playId]);

  useEffect(() => {
    if (mode !== 'overlay' || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip.current = true;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, active]);

  if (playId <= 0 || !mounted) return null;

  const stage = (
    <Stage
      key={playId}
      title={title}
      time={time}
      figure={figure}
      reduced={reduced}
      skip={skip}
      onDone={() => {
        setActive(false);
        onDone?.();
      }}
    />
  );

  if (mode === 'inline') return <div className="absolute inset-0">{stage}</div>;
  if (!active) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] cursor-pointer" onClick={() => (skip.current = true)} role="presentation" title="Click to close">
      {stage}
      <p className="pointer-events-none absolute bottom-5 left-0 right-0 text-center text-[11px] uppercase tracking-[0.3em] text-white/30">click or press Esc to close</p>
    </div>,
    document.body,
  );
}
