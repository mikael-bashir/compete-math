# Task: Bring the Problems pages up to the app's established visual standard

## Context & the core problem

CompeteMath has two tiers of UI polish, and the gap is the whole point of this task.

**The "nice" pages** — Landing, Dashboard ("Welcome back"), and Sign In — share a confident, cohesive identity: atmospheric full-bleed background art, a serif display typeface for headlines, a warm gold/amber + teal accent system on near-black, soft glows, and rounded cards with generous internal padding. Even the welcome back dashboard is leagues behind the landing and sign in, its a solid attempt at a unique design, but it looks clunky and needs work.

**The "plain" pages** — the **Archives** grid and the **individual Problem** view (e.g. "Glass Marbles") — look unfinished by comparison: flat black backgrounds with no atmosphere, **sans-serif** headings that clash with the serif used elsewhere, content marooned in a huge field of empty space, no problem metadata (difficulty/points/status), and button styling that doesn't match the rest of the app.

Your job is **not** to invent a new look. It is to **extract the design system that already exists on the nice pages and apply it consistently to the problems pages.** Consistency is the deliverable. When in doubt, make the problems pages feel like they were designed by the same person, on the same day, as the Dashboard.

## Step 0 — Audit before you touch anything

Before writing any styles, read the codebase to recover the *actual* design tokens. Do not eyeball values from screenshots and hardcode them — find the source of truth.

1. Locate the theme/design tokens: Tailwind config, CSS custom properties, a theme file, styled-components theme, or wherever colors, fonts, radii, and shadows are defined.
2. Open the three reference pages (Landing, Dashboard, Sign In) and the two target pages (Archives, Problem view) in the code. Note which components, utility classes, and tokens the nice pages use that the plain pages do **not**.
3. Write down (in your working notes) the shared system you're going to reuse: font families, the accent colors and where each is used, card background/border/radius/shadow, spacing scale, and button variants.

If reusable components already exist (a `Card`, `Badge`, `Button`, page-background wrapper, etc.), **reuse them**. If the nice pages use a shared layout/background component and the problems pages don't, that's likely the single biggest fix.

## The design language to match (verify exact values in code)

Use these as a description of the intended system, then confirm the real tokens in the codebase:

- **Background:** Near-black / deep charcoal base. The nice pages layer atmospheric art or texture over it (moonlit sky, dotted world-map, painted landscape). The problems pages currently have nothing. They don't need a literal illustration, but they need the same *depth* — a subtle radial glow, vignette, faint dotted/grid texture, or a low-opacity reuse of an existing background asset — so they don't read as a blank `#000`.
- **Display type:** Serif for page titles and problem titles. Right now "i got a tan" uses the serif but "Glass Marbles" and "ARCHIVES" use a bold sans — unify these on the serif display face used by the Dashboard headline.
- **Body/UI type:** The existing sans for paragraphs, labels, inputs, and metadata.
- **Accent system:** Warm **gold/amber** (the wordmark, primary highlights) and **teal/green** (secondary labels like "PROBLEM OF THE WEEK", icons, links). Apply these the same way the Dashboard does — don't introduce new accent hues.
- **Cards:** Rounded corners, a slightly-lifted dark fill over the background, a hairline border, and a soft shadow/glow. Match the radius, border color, and padding of the Dashboard's "Problem of the Week" and Leaderboard cards exactly.
- **Buttons:** Standardize. The Dashboard "Submit" and the problem-page "Submit" currently differ (one light/neutral, one gold). Pick the established primary-button variant and use it everywhere; keep secondary/ghost variants consistent too.
- **Glow/elevation:** Subtle, warm, never harsh. Mirror the existing logo/moon glow treatment rather than adding heavy drop shadows.

## Specific fixes — Archives page

The Archives grid (the keycap tiles with φ, Σ, ∫, λ, π) is a nice *motif* stranded in empty space with no information.

1. **Vertical composition:** It currently floats near the top with a vast empty lower half. Give the page a proper composed layout — a titled section that breathes but doesn't leave 60% of the viewport dead. Consider centering the grid in the available space or adding supporting structure (intro line, counts, filters) so the emptiness is intentional, not accidental.
2. **Title consistency:** "ARCHIVES" should use the serif display treatment consistent with other page titles (and drop the lone underline accent if it doesn't appear elsewhere).
3. **Add problem metadata to each tile/card:** The system clearly tracks **difficulty** (e.g. "Medium") and **points** (e.g. "40 pts") and **solved/unsolved status** — the Dashboard shows these. Surface them here. Each archive entry should show at minimum: problem number, title, difficulty badge, points, and a solved/attempted indicator. Keep the keycap glyph as the visual hook, but pair it with this metadata so the grid is scannable.
4. **Difficulty badges:** Build or reuse a consistent badge component with clear color coding (e.g. easy/medium/hard) and reuse it on the Dashboard and problem pages too, so badges look identical everywhere.
5. **Cards:** Wrap each entry in the standard card style (border, radius, shadow, hover state) so the tiles feel like part of the same system as the Dashboard cards.
6. **Hover/focus states:** Give tiles a clear, on-brand hover (subtle lift + warm glow) and visible keyboard focus.

## Specific fixes — Individual Problem page (e.g. "Glass Marbles")

1. **Title typography:** Switch the bold sans heading to the serif display face used by "i got a tan" / the Dashboard, so problem titles are consistent across the app.
2. **Background depth:** Apply the same atmospheric/textured background treatment as the rest of the app instead of flat black.
3. **Dead space:** There's a large empty band between the problem card and the answer input. Tighten the vertical rhythm so the problem statement, metadata, and answer field feel like one composed unit rather than three things scattered down the page.
4. **Problem metadata header:** Show difficulty badge, points, and problem number consistently with the Archives and Dashboard, near the title.
5. **Math rendering:** Ensure the LaTeX/MathJax/KaTeX (integrals, fractions, `mod`, subscripts) renders crisply and is legible against the card background at the established body size. Don't let it overflow on narrow viewports — math is the most common mobile break point, so test it.
6. **Answer input + Submit:** Match the input styling and the **primary button variant** to the Dashboard's. Resolve the gold-vs-neutral button inconsistency in favor of the established primary style. Keep the existing submit handler, validation, and answer-checking logic untouched.
7. **"Back to Archives" link:** Keep it, but style it consistently with other navigational/secondary links (the gold link treatment).

## Cross-cutting requirements

- **Responsive / mobile:** Both pages must work cleanly from ~360px up. The Archives grid should reflow (e.g. multi-column → fewer columns → single column) without cramped tiles or overflow. On the problem page, the math, card padding, and input/button must not overflow or get clipped on small screens. Test at common breakpoints, not just desktop.
- **Visual hierarchy:** Title > metadata > body > input/actions should be unambiguous through size, weight, color, and spacing — not just stacking order.
- **Consistent spacing:** Pick the existing spacing scale and apply it uniformly (consistent gaps between cards, consistent card padding, consistent section margins). No one-off magic numbers.
- **Accessibility:** Sufficient contrast for text and badges on dark backgrounds, visible keyboard focus states on all interactive elements (tiles, links, input, button), and appropriate semantic markup / labels. The light-on-light or dark-on-dark traps from low-contrast accents must be avoided.
- **Hover/active/focus states** on every interactive element, on-brand and consistent.

## Hard constraints — do not break these

- **Preserve all existing functionality.** Routing, data fetching, the submit/answer-checking flow, countdown logic, leaderboard, auth — all behavior stays identical. This is a styling/layout pass.
- **Do not restyle the already-good pages** (Landing, Dashboard, Sign In) beyond what's needed to *share* components/tokens. If you extract a shared `Badge` or `Button` and it improves those pages too, that's fine — but don't redesign them.
- **Reuse, don't duplicate.** Prefer extending existing components and tokens over creating parallel ones. If you find yourself inventing a new color or font, stop and find the existing one.
- **No new heavy dependencies** without a clear reason; use what the project already has.

## Workflow

1. Work in the current worktree.
2. Audit first (Step 0), then implement Archives, then the Problem page.
3. **Run the dev server and verify in the browser before finishing.** Check:
   - Archives and Problem pages side-by-side with the Dashboard — do they now read as the same app?
   - Mobile breakpoints (~360px, ~768px) for reflow, overflow, and math rendering.
   - Every interactive element's hover/focus/active state.
   - That submitting an answer still works end-to-end.
4. If anything looks off against the reference pages, iterate before declaring done.

## Definition of done

- [ ] Archives and Problem titles use the serif display face, consistent with the Dashboard.
- [ ] Both pages have the same background depth/atmosphere as the rest of the app (no flat black).
- [ ] A single reusable difficulty-badge and a single primary-button variant are used consistently across Archives, Problem, and Dashboard.
- [ ] Archive entries show number, title, difficulty, points, and solved status in consistent cards.
- [ ] Problem page shows metadata, renders math crisply, and has tightened vertical rhythm.
- [ ] Both pages are fully responsive down to ~360px with no overflow/clipping (math included).
- [ ] All interactive elements have on-brand hover and visible focus states; contrast is accessible.
- [ ] All existing functionality verified working in the dev server.
- [ ] Placed beside the Dashboard, the problems pages look like they belong to the same product.