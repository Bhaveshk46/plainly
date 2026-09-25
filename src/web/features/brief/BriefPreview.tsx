import { languageDirection } from '../../../shared/options.js';
import { RiskBadge } from '../../components/ui.js';
import { PRIORITY_LABELS, type Brief } from '../../lib/brief.js';

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mt-6 mb-2 border-b border-line pb-1 text-base font-bold tracking-tight text-fg">{title}</h3>
      {children}
    </section>
  );
}

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 ps-5 text-[0.93rem] text-fg marker:text-brand-text">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

/** The brief as a printable page. Used by the Brief tab and by shared-link viewers. */
export function BriefPreview({ brief }: { brief: Brief }) {
  return (
    <article
      lang={brief.language}
      dir={languageDirection(brief.language)}
      aria-label="Lawyer brief preview"
      className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-9 print:border-0 print:p-0 print:shadow-none"
    >
      <header>
        <h2 className="text-2xl font-extrabold tracking-tight text-fg">{brief.title}</h2>
        <p className="mt-1 text-sm text-muted">
          Prepared {brief.generated} · {brief.preparedBy}
        </p>
      </header>

      <Block title="My situation">
        <ul className="list-disc space-y-1 ps-5 text-[0.93rem] text-fg marker:text-brand-text">
          <li>Role: {brief.situation.role}</li>
          <li>Stage: {brief.situation.stage}</li>
          <li>Where it applies: {brief.situation.jurisdiction}</li>
          <li>Document type: {brief.documentType}</li>
          <li>
            Overall assessment: <strong>{brief.riskLevel} risk</strong>. {brief.riskRationale}
          </li>
        </ul>
      </Block>

      {brief.notes ? (
        <Block title="My notes">
          <p className="text-[0.93rem] whitespace-pre-wrap text-fg">{brief.notes}</p>
        </Block>
      ) : null}
      {brief.summary.length ? (
        <Block title="Summary">
          <List items={brief.summary} />
        </Block>
      ) : null}
      {brief.keyFacts.length ? (
        <Block title="Key details">
          <List items={brief.keyFacts.map((fact) => `${fact.label}: ${fact.value}`)} />
        </Block>
      ) : null}

      {brief.keyTerms.length ? (
        <Block title="Terms I would like reviewed">
          <div className="grid gap-4">
            {brief.keyTerms.map((term) => (
              <div key={`${term.title}-${term.quote}`} className="break-inside-avoid">
                <p className="flex flex-wrap items-center gap-2 font-bold text-fg">
                  {term.title}
                  {term.location ? <span className="text-sm font-normal text-muted">({term.location})</span> : null}
                  <RiskBadge risk={term.risk} label={PRIORITY_LABELS[term.risk]} />
                </p>
                <blockquote className="quote-text my-1.5 rounded-e-md border-s-4 border-line bg-surface-2 px-3.5 py-2 text-[0.9rem] text-fg print:bg-transparent">“{term.quote}”</blockquote>
                <p className="text-[0.9rem] text-fg">
                  <span className="font-semibold">Why it matters: </span>
                  {term.whyItMatters}
                </p>
              </div>
            ))}
          </div>
        </Block>
      ) : null}

      {brief.missing.length ? (
        <Block title="Not found in the document">
          <List items={brief.missing} />
        </Block>
      ) : null}
      {brief.questions.length ? (
        <Block title="Questions for you">
          <ol className="list-decimal space-y-1 ps-6 text-[0.93rem] text-fg marker:font-bold marker:text-brand-text">
            {brief.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </Block>
      ) : null}
      {brief.nextSteps.length ? (
        <Block title="What I plan to do next">
          <List items={brief.nextSteps} />
        </Block>
      ) : null}

      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">{brief.disclaimer}</p>
    </article>
  );
}
