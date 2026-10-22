# The proof supernova

What plays when a target is proved, in place of a green "no sorry left" box. The sky goes dark, a star collapses, and it goes off; the blast wave runs out across the screen; the word PROVED comes up in the glow, with the theorem's name and "no sorry left" under it. Click or Esc lets it go early. It plays once each time a run goes from not proved to proved.

## Where it lives

- `src/components/prover/supernova/timeline.ts`: the beats (detonation at 1.15 s, the word at 2 s, the sky gone at 11.5 s) and the Sedov-Taylor blast radius. Pure, so the shader, the overlay, the preview page and the tests read the same numbers.
- `shader.ts`, `renderer.ts`: WebGL2. A scene pass in HDR (starfield, galaxies, the collapse, the fireball, the blast wave with its fingered front and filaments, debris, rays, the flare, a speck of a figure for scale), a bright-pass, a small and a wide blur, and a composite (bloom, tone map, chromatic aberration at the flash, vignette, grain). Float render targets when the browser has them, 8-bit otherwise.
- `proof-supernova.tsx`: the overlay (or, with `mode="inline"`, a box), the word, adaptive resolution, Esc and click, the reduced-motion still, the CSS fallback for a browser with no WebGL2.
- `use-proof-celebration.ts`: `useProofCelebration(proved)` fires it on the false-to-true edge and compiles the shaders on an idle tick; `theoremNameOf` reads the name off the statement.
- `src/components/prover/prover-playground.tsx`: `proved` is a `verified` event on the stream or an outcome that says so.
- `src/app/lab/supernova`: the preview page (replay, a scrubber that draws any frame exactly, a replayed run that ends in a verified proof). Served on preview deployments and under `next dev`; production returns 404 (`VERCEL_ENV`).

## Why it looks the way it does

The blast radius is the Sedov-Taylor law for a point explosion, R ~ t^(2/5): it leaps out and then slows, which is what reads as enormous. The front is ragged (fingers from noise sampled on the circle, so it is continuous all the way round), and behind it the gas glows in the colours of a real remnant: H-alpha red, [O III] teal, [S II] orange, with dark dust lanes across it. Stars and gas are pulled toward the front, so it shows as a bright caustic. The speck of a figure and the far galaxies are there for scale; `figure` turns the speck off.

## Safety and cost

- `prefers-reduced-motion`: one still frame and the word for 3.6 s. No flash, no motion.
- One flash, not a strobe: it rises in about 30 ms and only falls (tested).
- It draws at no more than about 2.6 million pixels at first and steps its resolution down (to 40%) if the GPU cannot hold about 45 frames a second; the glow forgives it.
- It stops drawing when it ends: the canvas unmounts.

## Tuning

Change the numbers in `timeline.ts` (the shader takes them from there) and look at the preview page. `tests/supernova` checks the timeline and the shader source for the mistakes that were made writing it (`pow()` of a signed value, a reserved word as a name); a shader cannot be compiled in a test run, so the look is checked on the preview page.
