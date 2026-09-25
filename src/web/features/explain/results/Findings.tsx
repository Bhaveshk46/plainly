import { Accordion, Tabs } from 'radix-ui';
import { ChevronDown, Highlighter, ListFilter, Search, Scale } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Chip, RiskBadge, SectionTitle, TextInput } from '../../../components/ui.js';
import { usePrefersReducedMotion } from '../../../hooks/useMediaQuery.js';
import { cn } from '../../../lib/cn.js';
import { RISK_META, RISK_ORDER, plural } from '../../../lib/format.js';
import type { Risk } from '../../../../shared/options.js';
import type { Clause } from '../../../../shared/types.js';
import { DocumentViewer } from './DocumentViewer.js';

export type FindingsView = 'findings' | 'document';
export interface Jump {
  id: string;
  target: FindingsView;
  /** Changes on every request so repeating the same jump still fires. */
  nonce: number;
}

const BORDER: Record<Risk, string> = {
  high: 'border-s-high',
  medium: 'border-s-medium',
  low: 'border-s-low',
  info: 'border-s-info',
};

function Detail({ label, children }: { label: string; children: string }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-[0.7rem] font-bold tracking-wider text-muted uppercase">{label}</dt>
      <dd className="text-[0.95rem] text-fg">{children}</dd>
    </div>
  );
}

function FindingItem({ clause, canLocate, onShow }: { clause: Clause; canLocate: boolean; onShow: () => void }) {
  return (
    <Accordion.Item
      value={clause.id}
      id={`finding-${clause.id}`}
      data-risk={clause.risk}
      className={cn('scroll-mt-28 rounded-xl border border-line border-s-[6px] bg-surface shadow-sm forced-border', BORDER[clause.risk])}
    >
      <Accordion.Header className="m-0">
        <Accordion.Trigger className="group flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-4 py-3 text-start">
          <RiskBadge risk={clause.risk} />
          <span className="min-w-0 flex-1 basis-56 text-base font-bold text-fg">{clause.title}</span>
          {clause.location ? <span className="text-xs text-muted">{clause.location}</span> : null}
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Accordion.Trigger>
      </Accordion.Header>

      <blockquote className="quote-text mx-4 mb-3 rounded-e-lg border-s-4 border-line bg-surface-2 px-3.5 py-2.5 text-[0.95rem] break-words text-fg">
        <span className="mb-0.5 block font-sans text-[0.68rem] font-bold tracking-wider text-muted uppercase not-italic">From your document</span>“{clause.quote}”
      </blockquote>

      <Accordion.Content className="overflow-hidden data-[state=closed]:hidden">
        <div className="space-y-3 border-t border-line px-4 py-4">
          <dl className="space-y-3">
            <Detail label="In plain words">{clause.explanation}</Detail>
            <Detail label="Why it matters">{clause.whyItMatters}</Detail>
            <Detail label="What you can do">{clause.suggestion}</Detail>
          </dl>
          {clause.jurisdictionNote ? (
            <p className="flex gap-2 rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm text-fg">
              <Scale aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-text" />
              <span>
                <strong>Local law note: </strong>
                {clause.jurisdictionNote} <em className="text-muted">(General information. Verify with a local lawyer.)</em>
              </span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{clause.source === 'ai' ? 'AI explanation' : 'Pattern check'}</Badge>
            {clause.related.length ? <Badge>Also relates to: {clause.related.join(', ')}</Badge> : null}
            {canLocate ? (
              <Button variant="ghost" size="sm" icon={Highlighter} onClick={onShow} className="ms-auto no-print">
                Show in document
              </Button>
            ) : null}
          </div>
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

interface Props {
  clauses: Clause[];
  documentText: string;
  view: FindingsView;
  onViewChange: (view: FindingsView) => void;
  jump: Jump | null;
  onJump: (jump: Omit<Jump, 'nonce'>) => void;
}

export function Findings({ clauses, documentText, view, onViewChange, jump, onJump }: Props) {
  const reduceMotion = usePrefersReducedMotion();
  const [filter, setFilter] = useState<Risk | 'all'>('all');
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const [open, setOpen] = useState<string[]>(() => clauses.filter((clause) => clause.risk === 'high').slice(0, 2).map((clause) => clause.id));
  const [located, setLocated] = useState<ReadonlySet<string>>(new Set());

  const counts = useMemo(() => {
    const result: Record<Risk, number> = { high: 0, medium: 0, low: 0, info: 0 };
    for (const clause of clauses) result[clause.risk] += 1;
    return result;
  }, [clauses]);

  const visible = useMemo(
    () =>
      clauses.filter(
        (clause) =>
          (filter === 'all' || clause.risk === filter) &&
          (!deferred || `${clause.title} ${clause.quote} ${clause.explanation} ${clause.whyItMatters}`.toLowerCase().includes(deferred)),
      ),
    [clauses, filter, deferred],
  );

  // A highlight in the document asked us to open a finding.
  useEffect(() => {
    if (!jump || jump.target !== 'findings') return;
    setFilter('all');
    setQuery('');
    setOpen((current) => (current.includes(jump.id) ? current : [...current, jump.id]));
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`finding-${jump.id}`);
      element?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      element?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      element?.classList.add('animate-flash');
      setTimeout(() => element?.classList.remove('animate-flash'), 1500);
    });
    return () => cancelAnimationFrame(frame);
  }, [jump, reduceMotion]);

  if (!clauses.length) {
    return (
      <Card aria-labelledby="findings-title">
        <SectionTitle id="findings-title" icon={ListFilter}>
          Terms worth a closer look
        </SectionTitle>
        <p className="mt-3 text-muted">No specific terms were flagged. That does not mean the document is safe: read it fully and consider asking a lawyer.</p>
      </Card>
    );
  }

  return (
    <Card aria-labelledby="findings-title" className="p-0 sm:p-0">
      <Tabs.Root value={view} onValueChange={(next) => onViewChange(next as FindingsView)}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <SectionTitle id="findings-title" icon={ListFilter}>
            Terms worth a closer look
          </SectionTitle>
          <Tabs.List aria-label="How to view the findings" className="no-print inline-flex rounded-xl border border-line bg-surface-2 p-0.5 forced-border">
            {(
              [
                ['findings', 'Findings'],
                ['document', 'In your document'],
              ] as const
            ).map(([value, label]) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="min-h-10 rounded-[0.65rem] px-4 text-sm font-semibold text-muted transition-colors data-[state=active]:bg-surface data-[state=active]:text-brand-text data-[state=active]:shadow-sm"
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <Tabs.Content value="findings" className="px-5 pt-4 pb-5 sm:px-6 sm:pb-6">
          <div className="no-print flex flex-wrap items-center gap-2">
            <Chip pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All ({clauses.length})
            </Chip>
            {RISK_ORDER.filter((level) => counts[level]).map((level) => (
              <Chip key={level} pressed={filter === level} onClick={() => setFilter(level)}>
                {RISK_META[level].label} ({counts[level]})
              </Chip>
            ))}
          </div>
          <div className="no-print mt-3 flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 flex-1">
              <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <TextInput type="search" aria-label="Search findings" placeholder="Search findings…" value={query} onChange={(event) => setQuery(event.target.value)} className="ps-10" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(visible.map((clause) => clause.id))}>
              Expand all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen([])}>
              Collapse all
            </Button>
          </div>
          <p role="status" className="mt-3 text-sm text-muted">
            Showing {plural(visible.length, 'term')}
            {filter !== 'all' ? `: ${RISK_META[filter].label.toLowerCase()}` : ''}
            {deferred ? ` matching “${query.trim()}”` : ''}.
          </p>

          <Accordion.Root type="multiple" value={open} onValueChange={setOpen} className="mt-3 grid gap-3">
            {visible.map((clause) => (
              <FindingItem key={clause.id} clause={clause} canLocate={located.has(clause.id)} onShow={() => onJump({ id: clause.id, target: 'document' })} />
            ))}
          </Accordion.Root>
          {!visible.length ? <p className="mt-4 text-muted">Nothing matches. Try another filter or search.</p> : null}
        </Tabs.Content>

        <Tabs.Content value="document" className="px-5 pt-4 pb-5 sm:px-6 sm:pb-6" forceMount>
          <div hidden={view !== 'document'}>
            <DocumentViewer text={documentText} clauses={clauses} jump={jump} onLocated={setLocated} onOpenFinding={(id) => onJump({ id, target: 'findings' })} active={view === 'document'} />
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </Card>
  );
}
