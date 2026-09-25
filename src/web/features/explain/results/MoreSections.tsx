import { CircleHelp, Copy, ExternalLink, FileQuestion, LifeBuoy, Users } from 'lucide-react';
import { Button, Card, SectionTitle } from '../../../components/ui.js';
import { useAnnounce } from '../../../hooks/useAnnouncer.js';
import { copyText } from '../../../lib/clipboard.js';
import type { MissingItem, Obligation, Resource } from '../../../../shared/types.js';

const PARTY_ORDER = ['You', 'Other party', 'Both parties'];
const PARTY_TITLE: Record<string, string> = { You: 'Your duties', 'Other party': 'Their duties' };

export function Obligations({ items }: { items: Obligation[] }) {
  if (!items.length) return null;
  const groups = new Map<string, Obligation[]>();
  for (const item of items) groups.set(item.party, [...(groups.get(item.party) ?? []), item]);
  const parties = [...groups.keys()].sort((a, b) => (PARTY_ORDER.indexOf(a) + 1 || 9) - (PARTY_ORDER.indexOf(b) + 1 || 9));

  return (
    <Card aria-labelledby="duties-title">
      <SectionTitle id="duties-title" icon={Users}>
        Who has to do what
      </SectionTitle>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {parties.map((party) => (
          <section key={party} aria-label={PARTY_TITLE[party] ?? party} className="rounded-xl bg-surface-2 p-4">
            <h4 className="mb-2 font-bold text-fg">{PARTY_TITLE[party] ?? party}</h4>
            <ul className="list-disc space-y-2 ps-5 text-[0.92rem] text-fg marker:text-brand-text">
              {groups.get(party)?.map((item) => (
                <li key={item.text}>
                  {item.text}
                  {item.when ? <strong className="text-brand-text"> ({item.when})</strong> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

export function Missing({ items }: { items: MissingItem[] }) {
  if (!items.length) return null;
  return (
    <Card aria-labelledby="gaps-title">
      <SectionTitle id="gaps-title" icon={FileQuestion}>
        Not found in this document
      </SectionTitle>
      <p className="mt-1 text-sm text-muted">Things a document like this usually covers. They may be dealt with elsewhere, so ask.</p>
      <ul className="mt-4 grid gap-2.5">
        {items.map((entry) => (
          <li key={entry.item} className="rounded-xl bg-surface-2 px-4 py-3 text-[0.95rem] text-fg">
            <strong>{entry.item}</strong>
            {entry.why ? <span className="text-muted"> · {entry.why}</span> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Questions({ items }: { items: string[] }) {
  const announce = useAnnounce();
  if (!items.length) return null;
  const copy = async (): Promise<void> => {
    const ok = await copyText(items.map((question, index) => `${index + 1}. ${question}`).join('\n'));
    announce(ok ? 'Questions copied to the clipboard.' : 'Copying was blocked by your browser.');
  };
  return (
    <Card aria-labelledby="questions-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle id="questions-title" icon={CircleHelp}>
          Questions to ask a lawyer
        </SectionTitle>
        <Button variant="ghost" size="sm" icon={Copy} onClick={() => void copy()} className="no-print">
          Copy questions
        </Button>
      </div>
      <ol className="mt-4 list-decimal space-y-2.5 ps-6 text-[0.95rem] text-fg marker:font-bold marker:text-brand-text">
        {items.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ol>
    </Card>
  );
}

const isHttps = (url: string): boolean => /^https:\/\//i.test(url);

export function Resources({ items }: { items: Resource[] }) {
  if (!items.length) return null;
  return (
    <Card aria-labelledby="help-title">
      <SectionTitle id="help-title" icon={LifeBuoy}>
        Free or low-cost legal help
      </SectionTitle>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {items.map((resource) => (
          <li key={resource.name} className="rounded-xl bg-surface-2 p-4">
            {isHttps(resource.url) ? (
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold text-brand-text underline underline-offset-2">
                {resource.name}
                <ExternalLink aria-hidden className="size-3.5" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <strong className="text-fg">{resource.name}</strong>
            )}
            <p className="mt-1 text-sm text-muted">{resource.note}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
