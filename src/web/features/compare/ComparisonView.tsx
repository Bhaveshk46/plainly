import { CircleHelp, FileDiff, GitCompareArrows, Scale, TriangleAlert, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { languageDirection } from '../../../shared/options.js';
import type { Change, CompareRow, CompareSide, Comparison, DiffPart } from '../../../shared/types.js';
import { Badge, Card, Gauge, RiskBadge, SectionTitle, SwitchRow } from '../../components/ui.js';
import { cn } from '../../lib/cn.js';
import { plural } from '../../lib/format.js';
import { TrustNotices } from '../explain/results/TrustNotices.js';

function TableWrap({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[40rem] border-collapse text-[0.92rem]">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const TH = 'border-b border-line bg-surface-2 px-4 py-2.5 text-start text-xs font-bold tracking-wider text-muted uppercase';

function VerdictCard({ result }: { result: Comparison }) {
  const { verdict, labels, documents } = result;
  const winner = verdict.favors === 'a' ? labels.a : verdict.favors === 'b' ? labels.b : null;
  return (
    <Card aria-labelledby="verdict-title" className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-accent-a to-accent-b" />
      <div className="flex items-center gap-2 text-sm font-bold text-brand-text">
        <Scale aria-hidden className="size-4" /> Verdict for you
      </div>
      <h3 id="verdict-title" className="mt-1 text-2xl font-extrabold tracking-tight text-fg">
        {verdict.headline}
      </h3>
      {winner ? (
        <p className="mt-2 flex items-center gap-2">
          <Badge tone="good" icon={Trophy}>
            Better for you
          </Badge>
          <strong className="text-fg">{winner}</strong>
        </p>
      ) : null}
      {verdict.reasons.length ? (
        <ul className="mt-4 list-disc space-y-1.5 ps-5 text-[0.95rem] text-fg marker:text-brand-text">
          {verdict.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(['a', 'b'] as const).map((side) => {
          const doc = documents[side];
          return (
            <div key={side} className="flex items-center gap-4 rounded-xl bg-surface-2 p-4">
              <Gauge score={doc.risk.score} level={doc.risk.level} label={`Risk of ${labels[side]}`} size={92} />
              <div className="min-w-0">
                <p className="truncate font-bold text-fg">{labels[side]}</p>
                <p className="text-xs text-muted">
                  {doc.typeLabel} · {doc.wordCount.toLocaleString('en')} words
                </p>
                <p className="mt-1 text-sm text-muted">{doc.risk.rationale}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function FactsTable({ result }: { result: Comparison }) {
  if (!result.facts.length) return null;
  const none = <span className="text-muted">Not found</span>;
  return (
    <Card aria-labelledby="cmp-facts-title">
      <SectionTitle id="cmp-facts-title" icon={GitCompareArrows}>
        Key figures side by side
      </SectionTitle>
      <div className="mt-4">
        <TableWrap caption="Key figures in each document">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Detail
              </th>
              <th scope="col" className={TH}>
                {result.labels.a}
              </th>
              <th scope="col" className={TH}>
                {result.labels.b}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.facts.map((fact) => (
              <tr key={fact.label} className={cn('border-t border-line', fact.differs && 'bg-medium-bg/40')}>
                <th scope="row" className="px-4 py-2.5 text-start font-semibold text-fg">
                  {fact.label}
                  {fact.differs ? <span className="sr-only"> (differs)</span> : null}
                </th>
                <td className="px-4 py-2.5 text-fg">{fact.a || none}</td>
                <td className="px-4 py-2.5 text-fg">{fact.b || none}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>
    </Card>
  );
}

function Side({ side, better }: { side: CompareSide; better: boolean }) {
  if (!side.present) return <span className="text-muted">Not mentioned</span>;
  return (
    <div className="flex flex-col items-start gap-1.5">
      {side.risk ? <RiskBadge risk={side.risk} /> : null}
      {side.value ? <p className="text-fg">{side.value}</p> : null}
      {side.quote ? <blockquote className="quote-text rounded-e-md border-s-2 border-line bg-surface-2 px-2.5 py-1.5 text-[0.82rem] text-fg">“{side.quote}”</blockquote> : null}
      {better ? (
        <Badge tone="good" icon={Trophy}>
          Better for you
        </Badge>
      ) : null}
    </div>
  );
}

function RowsTable({ result }: { result: Comparison }) {
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const rows: CompareRow[] = onlyDifferences ? result.rows.filter((row) => row.difference !== 'same') : result.rows;
  if (!result.rows.length) return null;
  const differing = result.rows.filter((row) => row.difference !== 'same').length;

  return (
    <Card aria-labelledby="cmp-rows-title">
      <SectionTitle id="cmp-rows-title" icon={GitCompareArrows}>
        Clause by clause
      </SectionTitle>
      <div className="no-print my-4">
        <SwitchRow checked={onlyDifferences} onCheckedChange={setOnlyDifferences} label="Show only differences" description={`${plural(result.rows.length, 'topic')}; ${differing} differ.`} />
      </div>
      <p role="status" className="sr-only">
        Showing {plural(rows.length, 'topic')}.
      </p>
      <TableWrap caption="Clause-by-clause comparison of the two documents">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Topic
            </th>
            <th scope="col" className={TH}>
              {result.labels.a}
            </th>
            <th scope="col" className={TH}>
              {result.labels.b}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.category}-${row.title}`} className="border-t border-line align-top">
              <th scope="row" className="w-1/4 px-4 py-3 text-start font-semibold text-fg">
                {row.title}
                {row.comment ? <span className="mt-1 block text-[0.8rem] font-normal text-muted">{row.comment}</span> : null}
              </th>
              <td className={cn('px-4 py-3', row.better === 'a' && 'bg-low-bg/50')}>
                <Side side={row.a} better={row.better === 'a'} />
              </td>
              <td className={cn('px-4 py-3', row.better === 'b' && 'bg-low-bg/50')}>
                <Side side={row.b} better={row.better === 'b'} />
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Card>
  );
}

const CHANGE: Record<Change['type'], { label: string; tone: 'medium' | 'high' | 'low' }> = {
  modified: { label: 'Changed', tone: 'medium' },
  removed: { label: 'Removed', tone: 'high' },
  added: { label: 'Added', tone: 'low' },
};

function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="leading-7 break-words text-fg">
      {parts.map((part, index) => {
        const space = index ? ' ' : '';
        if (part.type === 'del')
          return (
            <span key={index}>
              {space}
              <span className="sr-only">[removed: </span>
              <del className="rounded bg-del px-0.5 decoration-high decoration-2">{part.text}</del>
              <span className="sr-only">]</span>
            </span>
          );
        if (part.type === 'ins')
          return (
            <span key={index}>
              {space}
              <span className="sr-only">[added: </span>
              <ins className="rounded bg-ins px-0.5 decoration-low decoration-2 underline">{part.text}</ins>
              <span className="sr-only">]</span>
            </span>
          );
        return <span key={index}>{space + part.text}</span>;
      })}
    </p>
  );
}

function Changes({ result }: { result: Comparison }) {
  return (
    <Card aria-labelledby="cmp-changes-title">
      <SectionTitle id="cmp-changes-title" icon={FileDiff}>
        What changed
      </SectionTitle>
      {result.changes.length ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Paragraph by paragraph, from {result.labels.a} to {result.labels.b}. Removed words are struck through; added words are underlined.
          </p>
          <ul className="mt-4 grid gap-3">
            {result.changes.map((change, index) => (
              <li key={index} className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <RiskBadge risk={CHANGE[change.type].tone} label={CHANGE[change.type].label} />
                  <span className="text-xs text-muted">
                    {[change.locationA && `${result.labels.a}: ${change.locationA}`, change.locationB && `${result.labels.b}: ${change.locationB}`].filter(Boolean).join(' → ')}
                  </span>
                </div>
                {change.type === 'modified' && change.parts ? <Diff parts={change.parts} /> : <p className="break-words text-fg">{change.a ?? change.b}</p>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-muted">No differences in wording were found between the two documents.</p>
      )}
    </Card>
  );
}

function TextList({ title, icon: Icon, items, ordered }: { title: string; icon: typeof TriangleAlert; items: string[]; ordered?: boolean }) {
  if (!items.length) return null;
  const List = ordered ? 'ol' : 'ul';
  return (
    <Card>
      <SectionTitle icon={Icon}>{title}</SectionTitle>
      <List className={cn('mt-4 space-y-2 ps-6 text-[0.95rem] text-fg marker:text-brand-text', ordered ? 'list-decimal' : 'list-disc')}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    </Card>
  );
}

export function ComparisonView({ result }: { result: Comparison }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [result]);
  const onDevice = result.mode === 'offline' && !result.privacy.sentToAI && result.notice === null;

  return (
    <div lang={result.outputLanguage} dir={languageDirection(result.outputLanguage)} className="flex flex-col gap-5">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-extrabold tracking-tight text-fg outline-none">
        Comparison
      </h2>
      <TrustNotices mode={result.mode} notice={result.notice} warnings={result.warnings} grounding={result.grounding} privacy={result.privacy} onDevice={onDevice} />
      <VerdictCard result={result} />
      <FactsTable result={result} />
      <RowsTable result={result} />
      <Changes result={result} />
      <TextList title="Inconsistencies and gaps" icon={TriangleAlert} items={result.inconsistencies} />
      <TextList title="Questions to ask a lawyer" icon={CircleHelp} items={result.questionsForLawyer} ordered />
      <p className="text-[0.82rem] text-muted">{result.disclaimer}</p>
    </div>
  );
}
