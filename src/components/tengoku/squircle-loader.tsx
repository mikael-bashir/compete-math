'use client';

import { useEffect, useRef } from 'react';
import Zdog from 'zdog';

/**
 * The squircle loader from react-awesome-loaders (MIT): a 200 x 200 cylinder
 * turned a quarter at a time about its vertical axis. Seen end-on it is a
 * circle, side-on a square, and in between a squircle. Redrawn here without
 * gsap, styled-components or react-responsive: the same two-turn, 2 second
 * cycle and easing (expo-in blended into circ-out), in the site's colours.
 */

const FRONT = '#34d399'; // emerald-400
const BACK = '#047857'; // emerald-700
const ALTERNATE = '#fbbf24'; // amber-400
const PALETTE = [FRONT, BACK, ALTERNATE];

const TURN = Math.PI / 2;
const HOLD = 0.5; // seconds still before each quarter turn
const MOVE = 0.5; // seconds a quarter turn takes
const CYCLE = 2 * (HOLD + MOVE); // two quarter turns, then the colour changes

const expoIn = (p: number) => (p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, 10 * (p - 1)));
const circOut = (p: number) => Math.sqrt(1 - (p - 1) * (p - 1));
const power4InOut = (p: number) => (p < 0.5 ? 8 * p ** 4 : 1 - 8 * (1 - p) ** 4);
function ease(p: number) {
  const blend = power4InOut(p);
  return expoIn(p) * (1 - blend) + circOut(p) * blend;
}

function lerpColour(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The quarter turns done at `t` seconds, with the part of the one under way eased. */
function turnsAt(t: number) {
  const whole = Math.floor(t / CYCLE) * 2;
  const inCycle = t % CYCLE;
  let turns = whole;
  for (let k = 0; k < 2; k += 1) {
    const start = k * (HOLD + MOVE) + HOLD;
    if (inCycle >= start + MOVE) turns += 1;
    else if (inCycle > start) turns += ease((inCycle - start) / MOVE);
  }
  return turns;
}

export function SquircleLoader({
  size = 72,
  label = 'Searching',
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const scene = new Zdog.Anchor({ translate: { x: 400, y: 300 }, scale: 2 });
    const cylinder = new Zdog.Cylinder({
      addTo: scene,
      diameter: 200,
      length: 200,
      stroke: false,
      color: FRONT,
      backface: BACK,
    });

    function draw(turns: number, colour: string) {
      cylinder.color = colour;
      scene.rotate.y = turns * TURN;
      scene.updateGraph();
      while (svg!.firstChild) svg!.removeChild(svg!.firstChild);
      scene.renderGraphSvg(svg!);
    }

    // A person who asks for less motion gets one still squircle, halfway through a turn.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(0.5, FRONT);
      return;
    }

    let frame = 0;
    let started: number | null = null;
    function tick(now: number) {
      if (started === null) started = now;
      const t = (now - started) / 1000;
      const cycle = Math.floor(t / CYCLE);
      // the colour moves to the next one over the first half second of a cycle
      const from = PALETTE[(cycle + PALETTE.length - 1) % PALETTE.length];
      const to = PALETTE[cycle % PALETTE.length];
      const colour = cycle === 0 ? FRONT : lerpColour(from, to, Math.min(1, (t % CYCLE) / MOVE));
      draw(turnsAt(t), colour);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div role="status" aria-label={label} className={className} style={{ width: size, height: size }}>
      <svg
        ref={svgRef}
        viewBox="190 90 420 420"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
      />
    </div>
  );
}
