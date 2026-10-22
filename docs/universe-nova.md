# The supernova in the universe visualiser

When a prover target is proved, its star is born in the Tengoku universe (the finale in `src/lib/universe/lineage.ts`). This adds a supernova to that moment. It lives inside the visualiser: the same camera, the same star, the same finale.

## What you see

- **A flash** in the first fraction of a second (up in 30 ms, mostly gone in a third of a second, once, never a strobe). It washes the whole canvas, brightest at the star.
- **The whole page flashes too**: the navbar, the strip, the footer and the visualiser's frame, centred on where the star is (`page-flash.ts`; one overlay, plus-lighter, removed when it has faded).
- **A screen shake**: rough and decaying, about 1% of the view's height at its worst, over about a second.
- **A shock wave, on a small scale.** A supernova cannot cross a universe in seconds, so the wave is a corner of the star's galaxy (`NOVA.rMax`, 0.012 world units). At the finale camera it is a few pixels and is not drawn. It is only there when you are zoomed far into the galaxy, where it is a gold ring with a fainter blue ripple behind it, bending the stars behind it a little like a lens. Its radius follows the Sedov-Taylor law (radius ~ t^(2/5)): it leaps, then slows.
- **Debris**: a couple of dozen sparks that leave the star, slow down, cool from white to ember and fade.

Reduced motion (`prefers-reduced-motion`) gets none of the flash, the shake or the page flash.

## Design

Everything is a pure function of `born`, the seconds since the star was born, on the clock of the person watching (a replay at 5x does not run the flash five times faster). `src/lib/universe/nova.ts` holds those functions and is tested without a GPU (`tests/universe/nova.test.ts`); `engine.ts` only draws them:

| Where | What |
| --- | --- |
| `updateCam` | the shake, added to the view-projection matrix |
| `TONE_FS` (tone-mapping pass) | the wave (lens + light) and the in-canvas flash, from `u_nova`, `u_nova2`, `u_novaC`, `u_flash` |
| `drawFinale` | the debris |
| `frame` | fires `onNova({x, y})` once, when the star is born while someone is watching (`shouldFire`); not when a replay is scrubbed into the middle of it |

Because it depends only on `born`, scrubbing a replay shows exactly what the live moment would have.

`onNova` is an option of `Engine`; `leak-universe.tsx` passes `flashPage`.

## Seeing it

Leak page, then **Load visualiser**, **Replay**, pick a run that ends in a proof, and press **⏭ finale** (jumps to a second before the star is born and plays). The button is disabled for runs that did not end in a proof. Replays that end in a proof now run 11.5 s past their last event (2.5 s, the finale's 8 s of settling, and 1 s more; it was 6 s) so the nova is not cut off. To see the wave, zoom into the galaxy around the new star while it plays, or pause just after it goes off and zoom.

## Changing it

The numbers are in `NOVA` and `PAGE_FLASH` in `nova.ts`. The nova goes off at `FINALE.stillness` seconds after the proof closes (a test fails if that changes without `nova.ts` being looked at). GLSL mistakes made while writing this are guarded by tests that read the shader source: `pow(x, 2.0)` of a signed value is undefined (use `sq()`), and reserved words (`flat`, ...) cannot be names. Do not call `loseContext()` on dispose: React StrictMode mounts the engine twice.
