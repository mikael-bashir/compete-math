# Task: Fix AtomixGlass so the nav bar and strip are real shader-refracted glass

## Goal

The nav bar and the strip beneath it must render as **genuine liquid glass** — a translucent surface that **refracts and distorts the page content scrolling behind it in real time**, using AtomixGlass's WebGL/SVG shader pipeline (the same approach as `Shohojdhara/atomix`). Right now the glass components are not working. Diagnose why, then implement them **correctly**.

This is explicitly **not** a request for `backdrop-filter: blur()` glassmorphism. A blurred translucent rectangle is a failure of this task. The deliverable is true refraction: straight edges of the content behind the bar should visibly bend/warp at the glass, with the optical character (refraction offset, edge/bevel distortion, subtle chromatic dispersion) that AtomixGlass produces. If you find yourself reaching for a plain blur as "good enough," stop — that is the cheap imitation we are rejecting.

## Non-negotiables

1. **Do it right, using the real shader pipeline.** Use AtomixGlass's actual WebGL/SVG-filter rendering. No fake blur substitute, no static screenshot, no CSS-only approximation as the final result.
2. **Mounted once, in the root layout.** The glass surface(s) are initialized a single time at the layout level — not re-imported or re-instantiated per page or per component. One source of truth, one WebGL context (see Performance).
3. **Always distorts live content behind it.** The refraction must track the page as it scrolls and as content changes — not a one-time snapshot that goes stale or blank. This is the single most common reason a fixed/sticky glass bar "looks broken."
4. **Verified in a real browser before you finish.** Run the dev server and use your browser tooling to actually look at it, scroll the page, and confirm the distortion is visibly present and correct. Do not declare done from code inspection alone.

## Step 0 — Diagnose why it's currently broken (do this first, write findings down)

Don't start rewriting blind. Reproduce the failure and identify the actual root cause. Work through these likely culprits and confirm which apply:

- **SSR / hydration:** WebGL and canvas need `window`/DOM. If this is Next.js (App Router) / Remix / any SSR framework, an AtomixGlass mounted on the server will no-op or throw. Check whether it needs a client boundary (`'use client'`), a browser-only mount (`useEffect`), or a dynamic import with SSR disabled. Check the console for hydration mismatches and "document/window is not defined" errors.
- **Stale/empty capture:** Many shader-glass setups capture the content behind the glass once and cache it. For a **fixed/sticky nav over a scrolling page**, that cached capture never updates, so the bar looks empty, frozen, or just tinted. Confirm whether the background is being re-sampled on scroll/resize/route change.
- **Positioned-root / child requirements:** These libraries typically require the glass element to be a **direct child of a positioned (`position: relative`) root** that contains the captured content. A `position: fixed` navbar bolted outside that root, or nested too deep, breaks the capture. Confirm the DOM relationship the library actually requires.
- **Clipping:** The shader output `<canvas>`/halo **overflows its box and is clipped by any ancestor with `overflow: hidden`**. Check every wrapping container between the glass and the root.
- **Stacking & pointer events:** Wrong `z-index`/stacking context can hide the glass or its canvas; `pointer-events` can either swallow nav clicks or let them fall through. Confirm nav links are still clickable and the glass sits at the correct layer.
- **Multiple instances / context exhaustion:** Several glass elements each spinning up a WebGL context (browsers cap concurrent contexts ~16) can cause later ones to silently fail. Check how many contexts are being created.
- **Browser support:** The SVG displacement / shader path is only partially supported in Safari and Firefox (displacement may not render). Confirm which browser you're testing in and whether the "not working" is actually an unsupported-browser path.
- **Wrong/missing snapshot target or background source:** If the library snapshots a specific element or expects a sibling background, a misconfigured selector yields a transparent or black result.

Record the confirmed root cause(s) before implementing. The fix depends on which of these is actually happening.

## Step 1 — Understand AtomixGlass properly before coding

Read the real source of truth, not assumptions:

- The atomix repo/source and its `AtomixGlass` implementation (`github.com/Shohojdhara/atomix`) and the live demo to learn the **actual props, displacement modes, init/teardown API, and DOM requirements** (root container, child placement, background capture, `data-*` hooks for dynamic content).
- Identify how it expects to be told that content behind it is **dynamic** (scrolling) so it re-captures, and what the recommended pattern is for a persistent, full-width surface like a header bar.
- Note its performance guidance (single context, capture cost, debounced resize) and its fallback behavior.

If the installed version's API differs from any blog post, **trust the installed package's source/types** over external write-ups.

## Step 2 — Architecture: one shared glass layer in the root layout

- Create a single client-only glass layer (e.g. `GlassChrome` / `GlassSurface`) that owns the nav bar and the strip, mounted **once** in the root layout so it persists across route changes and never re-initializes per page.
- Establish the **positioned root** the shader needs so the captured "behind" content is the actual scrolling page, and place the glass element(s) in the exact DOM relationship AtomixGlass requires.
- The nav bar and strip should be two glass regions of this one layer (or one surface styled to cover both), sharing a single initialization and, where possible, a single WebGL context. Do **not** instantiate a new glass per nav item.
- Guard against SSR: ensure the WebGL/canvas init only runs in the browser, with a clean mount/unmount lifecycle (initialize on mount, `destroy()` on unmount) so navigation and HMR don't leak contexts.

## Step 3 — Make the refraction track live scrolling content (the core requirement)

- Wire the glass so the content behind it is treated as **dynamic**: re-sample/mark-changed on scroll (and on resize and route change), using whatever AtomixGlass exposes for this (e.g. a dynamic/dirty flag or a `markChanged`-style call), debounced/`requestAnimationFrame`-throttled to stay smooth.
- Verify that scrolling the page produces continuously updated distortion under the bar — text and edges behind the glass should bend and shift as they pass beneath it, not freeze.
- If the bar is sticky/fixed, make sure the capture coordinate space stays aligned with the viewport as the user scrolls (no drift, no offset between where content visually is and where it's sampled).

## Step 4 — Preserve nav functionality and accessibility

- All nav links/buttons remain fully clickable and keyboard-focusable; the glass canvas must not intercept or block interaction.
- Maintain correct focus order, visible focus states, and any existing aria semantics. The glass is decorative — it must not become a focus trap or hide interactive elements from assistive tech.
- Text/logo/icons in the bar stay legible over the refracted background at all scroll positions (consider the established tint/contrast treatment; do not let legibility depend on whatever happens to be scrolling behind).

## Step 5 — Performance

- **One WebGL context** for the chrome layer wherever feasible; never spawn a context per element. Confirm in devtools that you aren't exhausting contexts.
- Keep captured/rasterized wrappers shallow; re-capture only when content actually changes (scroll/resize/route), not every idle frame.
- Target a smooth 60fps while scrolling; profile if the bar causes jank, and throttle the re-capture cadence rather than dropping to a fake-blur fallback.
- Clean up on unmount/HMR to prevent context and listener leaks.

## Step 6 — Graceful fallback (without abandoning the real effect)

- Because Safari/Firefox may not render the displacement, detect capability and provide a tasteful fallback (e.g. a refined tinted translucent surface) **only** where the real shader genuinely cannot run. This is a fallback, not the primary path — Chromium-based browsers must get the real refraction.
- Make the fallback visually coherent with the real glass so the bar never looks broken, just slightly less dramatic where unsupported.

## Hard constraints

- **No cheap imitation as the final result.** Plain `backdrop-filter: blur`, a static image, or a CSS gradient pretending to be glass does not satisfy this task except as the explicitly-scoped unsupported-browser fallback.
- **Single import/init in the root layout.** No per-page or per-component re-instantiation.
- **Preserve all existing nav behavior, routing, and styling intent** beyond the glass surface itself.
- **No new heavy dependencies** beyond AtomixGlass/its peers unless strictly required; justify anything added.

## Verification — use your browser tooling, don't skip this

Run the dev server and verify in an actual browser:

1. **Distortion is real and live:** Scroll a content-rich page and confirm the area behind the nav bar and strip visibly **refracts/warps** the moving content — not just blurs it. Edges behind the glass should bend.
2. **It tracks scroll:** The distortion updates continuously while scrolling; nothing freezes, blanks, or drifts out of alignment.
3. **Single instance:** Navigate between routes — the glass persists, is not re-created, and devtools shows you are not accumulating WebGL contexts.
4. **No console/WebGL errors**, no hydration warnings, no "context lost" spam.
5. **Interaction intact:** Every nav link/button is clickable and keyboard-navigable; focus states visible.
6. **Legibility:** Bar contents remain readable at multiple scroll positions and over varied background content.
7. **Responsive:** Check desktop and mobile widths — the glass covers the bar/strip correctly with no clipping (watch for `overflow: hidden` ancestors) and no overflow artifacts.
8. **Fallback path:** Confirm the unsupported-browser fallback looks intentional, and that supported browsers still get the real shader.

Capture before/after observations. If the distortion isn't clearly visible, the task is not done — iterate on the capture/positioning/dynamic-update wiring until it is.

## Definition of done

- [ ] Root cause of the original breakage identified and documented.
- [ ] AtomixGlass real shader refraction renders on the nav bar and strip in Chromium.
- [ ] Glass layer is mounted exactly once in the root layout; persists across routes.
- [ ] Refraction updates live as the page scrolls and resizes; no stale/blank capture.
- [ ] One WebGL context for the chrome; no context exhaustion or leaks; smooth scrolling.
- [ ] Nav links clickable, keyboard-accessible, legible; no console/hydration errors.
- [ ] Sensible capability-detected fallback for browsers that can't display the displacement.
- [ ] Verified in-browser with scrolling, route changes, and responsive widths — distortion confirmed visible.