import { Banknote, CalendarClock, Landmark, Percent, Sparkles, Timer, Users, type LucideIcon } from 'lucide-react';
import { Card, SectionTitle } from '../../../components/ui.js';
import type { FactKind, KeyFact } from '../../../../shared/types.js';

const ICONS: Record<FactKind, LucideIcon> = {
  money: Banknote,
  duration: Timer,
  percent: Percent,
  date: CalendarClock,
  party: Users,
  law: Landmark,
  ai: Sparkles,
};

export function KeyFacts({ facts }: { facts: KeyFact[] }) {
  if (!facts.length) return null;
  return (
    <Card aria-labelledby="facts-title">
      <SectionTitle id="facts-title" icon={Banknote}>
        Key details we found
      </SectionTitle>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {facts.map((fact) => {
          const Icon = ICONS[fact.kind] ?? Sparkles;
          return (
            <div key={`${fact.label}-${fact.value}`} className="flex gap-3 rounded-xl bg-surface-2 p-3.5">
              <span className="grid size-9 shrink-0 place-content-center rounded-lg bg-surface text-brand-text">
                <Icon aria-hidden className="size-[1.1rem]" />
              </span>
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-muted">{fact.label}</dt>
                <dd className="font-bold break-words text-fg">{fact.value}</dd>
              </div>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 text-[0.82rem] text-muted">Detected automatically. Check them against the original.</p>
    </Card>
  );
}
