import { Fragment, useEffect, useMemo } from 'react';
import { findQuoteRange } from '../../../../shared/core/text.js';
import { normalizeDocument } from '../../../../shared/core/text.js';
import type { Risk } from '../../../../shared/options.js';
import type { Clause } from '../../../../shared/types.js';
import { RiskBadge } from '../../../components/ui.js';
import { usePrefersReducedMotion } from '../../../hooks/useMediaQuery.js';
import { cn } from '../../../lib/cn.js';
import { RISK_META, RISK_ORDER, plural } from '../../../lib/format.js';
import type { Jump } from './Findings.js';

const MARK: Record<Risk, string> = {
  high: 'bg-high-bg decoration-high',
  medium: 'bg-medium-bg decoration-medium',
  low: 'bg-low-bg decoration-low',
  info: 'bg-info-bg decoration-info',
};

const rank = (risk: Risk): number => RISK_ORDER.length - RISK_ORDER.indexOf(risk);

interface Placed {
  clause: Clause;
  start: number;
  end: number;
}

/** Locate each finding's quote in the text, resolving overlaps in favour of the riskier one. */
export function placeFindings(text: string, clauses: readonly Clause[]): Placed[] {
  const found: Placed[] = [];
  for (const clause of clauses) {
    const range = findQuoteRange(text, clause.quote);
    if (range) found.push({ clause, ...range });
  }
  found.sort((a, b) => a.start - b.start || rank(b.clause.risk) - rank(a.clause.risk));

  const placed: Placed[] = [];
  for (const item of found) {
    const last = placed[placed.length - 1];
    if (!last || item.start >= last.end) placed.push(item);
    else if (rank(item.clause.risk) > rank(last.clause.risk) && item.start >= last.start) placed[placed.length - 1] = item;
  }
  return placed;
}

interface Props {
  text: string;
  clauses: Clause[];
  jump: Jump | null;
  active: boolean;
  onLocated: (ids: ReadonlySet<string>) => void;
  onOpenFinding: (id: string) => void;
}

/** The document with every finding highlighted. Each highlight is a real button. */
export function DocumentViewer({ text, clauses, jump, active, onLocated, onOpenFinding }: Props) {
  const reduceMotion = usePrefersReducedMotion();
  const normalized = useMemo(() => normalizeDocument(text), [text]);
  const placed = useMemo(() => placeFindings(normalized, clauses), [normalized, clauses]);

  useEffect(() => {
    onLocated(new Set(placed.map((item) => item.clause.id)));
  }, [placed, onLocated]);

  // A "Show in document" click asked us to scroll to a highlight.
  useEffect(() => {
    if (!active || !jump || jump.target !== 'document') return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`mark-${jump.id}`);
      element?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      element?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      element?.classList.add('animate-flash');
      setTimeout(() => element?.classList.remove('animate-flash'), 1500);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, jump, reduceMotion]);

  const parts: Array<{ key: string; node: React.ReactNode }> = [];
  let cursor = 0;
  for (const { clause, start, end } of placed) {
    if (start > cursor) parts.push({ key: `t${cursor}`, node: normalized.slice(cursor, start) });
    parts.push({
      key: clause.id,
      node: (
        <mark id={`mark-${clause.id}`} className={cn('rounded px-0.5 text-fg underline decoration-2 underline-offset-2', MARK[clause.risk])}>
          <button
            type="button"
            onClick={() => onOpenFinding(clause.id)}
            className="cursor-pointer rounded text-start text-inherit"
          >
            <span className="sr-only">
              Finding: {clause.title}, {RISK_META[clause.risk].label}.{' '}
            </span>
            {normalized.slice(start, end)}
          </button>
        </mark>
      ),
    });
    cursor = end;
  }
  if (cursor < normalized.length) parts.push({ key: `t${cursor}`, node: normalized.slice(cursor) });

  const missed = clauses.length - placed.length;

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>Highlights:</span>
        {RISK_ORDER.map((level) => (
          <RiskBadge key={level} risk={level} />
        ))}
        <span className="ms-auto">
          {plural(placed.length, 'finding')} highlighted
          {missed > 0 ? ` (${missed} could not be placed exactly)` : ''}
        </span>
      </div>
      <div
        role="region"
        aria-label="Your document with findings highlighted"
        tabIndex={0}
        className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-surface-2 p-5 text-[0.95rem] leading-7 break-words whitespace-pre-wrap text-fg"
      >
        {parts.map((part) => (
          <Fragment key={part.key}>{part.node}</Fragment>
        ))}
      </div>
      <p className="mt-2 text-[0.82rem] text-muted">Select a highlight to jump to its explanation.</p>
    </div>
  );
}
