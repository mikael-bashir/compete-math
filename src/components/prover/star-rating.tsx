'use client';

import { useCallback, useId, useState } from 'react';
import { createPortal } from 'react-dom';

import type { QualityEntry } from '@/data/leak-quality';
import { evidenceLines, rungOf } from '@/lib/prover/entry-quality';

// A saved theorem's star rating. Pointing at it (or focusing it, or tapping it) opens a card that says what the rung means, shows where it
// sits on the five-step scale, and lists the evidence behind this theorem's rating. The card is drawn on the page, not inside the dialog's
// scrolling list, so the list cannot clip it.
export function StarRating({ stars, quality }: { stars: number; quality?: QualityEntry | null }) {
  const [box, setBox] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const id = useId();
  const rung = rungOf(stars);

  const open = useCallback((el: HTMLElement) => {
    const b = el.getBoundingClientRect();
    const width = 288;
    const left = Math.min(Math.max(12, b.left), window.innerWidth - width - 12);
    const above = b.bottom + 260 > window.innerHeight && b.top > 270;
    setBox({ left, top: above ? b.top - 8 : b.bottom + 8, above });
  }, []);
  const close = useCallback(() => setBox(null), []);

  return (
    <>
      <span
        role="img"
        tabIndex={0}
        aria-label={`${stars} of 5 stars${rung ? `: ${rung.name}` : ''}`}
        aria-describedby={box ? id : undefined}
        className="cursor-help whitespace-nowrap border-b border-dotted border-muted-foreground/60 text-[11px] leading-none tracking-tight text-amber-500"
        onMouseEnter={(e) => open(e.currentTarget)}
        onMouseLeave={close}
        onFocus={(e) => open(e.currentTarget)}
        onBlur={close}
        onClick={(e) => (box ? close() : open(e.currentTarget))}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        {'★'.repeat(stars)}
        <span className="text-muted-foreground/40">{'★'.repeat(5 - stars)}</span>
      </span>
      {box && rung && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="tooltip"
              id={id}
              className="pointer-events-none fixed z-[100] w-72 rounded-lg border bg-background p-3 text-left text-xs leading-relaxed text-foreground shadow-lg"
              style={{ left: box.left, top: box.top, transform: box.above ? 'translateY(-100%)' : undefined }}
            >
              <div className="text-sm font-semibold">
                {stars} of 5: {rung.name}
              </div>
              <p className="mb-2 text-muted-foreground">{rung.lead}</p>
              <div className="mb-2 grid grid-cols-5 gap-1" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((k) => (
                  <i key={k} className={`block h-1.5 rounded-sm ${k <= stars ? 'bg-amber-500' : 'bg-muted'} ${k === stars ? 'ring-2 ring-sky-500 ring-offset-1 ring-offset-background' : ''}`} />
                ))}
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
                <dt className="text-muted-foreground">Earned by</dt>
                <dd>{rung.earnedBy}</dd>
                <dt className="text-muted-foreground">For example</dt>
                <dd>{rung.example}</dd>
              </dl>
              {quality && (
                <div className="mt-2 border-t pt-2">
                  <div className="mb-1 font-medium">This theorem</div>
                  <ul className="list-none space-y-0.5" style={{ margin: 0, padding: 0 }}>
                    {evidenceLines(quality).map((line) => (
                      <li key={line} style={{ margin: 0, padding: 0 }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
