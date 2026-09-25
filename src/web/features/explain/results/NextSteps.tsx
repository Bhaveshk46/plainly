import { CalendarClock, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Card, SectionTitle } from '../../../components/ui.js';
import { cn } from '../../../lib/cn.js';
import { WHEN_LABELS } from '../../../lib/format.js';
import type { NextStep, StepWhen } from '../../../../shared/types.js';

const ORDER: readonly StepWhen[] = ['now', 'before_signing', 'soon', 'later'];
const WHEN_STYLE: Record<StepWhen, string> = {
  now: 'text-high',
  before_signing: 'text-medium',
  soon: 'text-brand-text',
  later: 'text-muted',
};

/** A tick-off checklist. Ticks live in memory only. */
export function NextSteps({ steps }: { steps: NextStep[] }) {
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  const sorted = steps.map((step, index) => ({ ...step, index })).sort((a, b) => ORDER.indexOf(a.when) - ORDER.indexOf(b.when));

  const toggle = (index: number): void =>
    setDone((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <Card aria-labelledby="steps-title">
      <SectionTitle id="steps-title" icon={ListChecks}>
        What to do next
      </SectionTitle>
      <p className="mt-1 text-sm text-muted">
        {done.size} of {steps.length} done
      </p>
      <ul className="mt-4 grid gap-2.5">
        {sorted.map((step) => {
          const id = `step-${step.index}`;
          const checked = done.has(step.index);
          return (
            <li key={step.index} className="flex items-start gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <input id={id} type="checkbox" checked={checked} onChange={() => toggle(step.index)} className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--brand)]" />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                <span className={cn('flex items-center gap-1.5 text-[0.7rem] font-bold tracking-wider uppercase', WHEN_STYLE[step.when])}>
                  <CalendarClock aria-hidden className="size-3.5" />
                  {WHEN_LABELS[step.when]}
                </span>
                <span className={cn('block text-[0.95rem] text-fg', checked && 'text-muted line-through')}>{step.step}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
