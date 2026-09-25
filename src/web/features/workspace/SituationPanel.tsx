import { RadioGroup } from 'radix-ui';
import { ChevronDown, Cpu, Sparkles, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { JURISDICTIONS, LANGUAGES, ROLES, STAGES, jurisdictionLabel, roleLabel, stageLabel, type Context } from '../../../shared/options.js';
import { Callout, Field, SelectControl, SwitchRow } from '../../components/ui.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { cn } from '../../lib/cn.js';
import type { EngineMode } from '../../lib/engine.js';
import { useConfig } from '../../state/config.js';
import { useSession } from '../../state/session.js';

interface Option {
  id: string;
  label: string;
}

function Select({ label, hint, value, options, onChange }: { label: string; hint?: string | undefined; value: string; options: readonly Option[]; onChange: (value: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      {(props) => (
        <SelectControl {...props} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectControl>
      )}
    </Field>
  );
}

function ModeOption({ value, icon: Icon, title, description, disabled }: { value: EngineMode; icon: typeof Cpu; title: string; description: ReactNode; disabled?: boolean }) {
  return (
    <RadioGroup.Item
      value={value}
      disabled={disabled}
      className={cn(
        'group flex w-full gap-3 rounded-xl border-[1.5px] border-line bg-surface p-3.5 text-start transition-colors forced-border',
        'hover:border-brand/60 data-[state=checked]:border-brand data-[state=checked]:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-55',
      )}
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-content-center rounded-lg bg-surface-2 text-brand-text group-data-[state=checked]:bg-surface">
        <Icon aria-hidden className="size-[1.1rem]" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-bold text-fg">
          {title}
          <RadioGroup.Indicator className="rounded-full bg-brand px-2 py-px text-[0.65rem] font-bold text-brand-fg">Selected</RadioGroup.Indicator>
        </span>
        <span className="mt-0.5 block text-[0.82rem] text-muted">{description}</span>
      </span>
    </RadioGroup.Item>
  );
}

function Fields() {
  const { state, dispatch } = useSession();
  const { config } = useConfig();
  const { context, mode } = state;
  const patch = (change: Partial<Context>) => dispatch({ type: 'context', patch: change });
  const aiAvailable = config.ai.enabled;
  const needsAi = context.language !== 'en';

  return (
    <div className="flex flex-col gap-4">
      <Select label="Who are you in this document?" value={context.role} options={ROLES} onChange={(value) => patch({ role: value as Context['role'] })} />
      <Select label="Where are you in the process?" value={context.stage} options={STAGES} onChange={(value) => patch({ stage: value as Context['stage'] })} />
      <Select label="Where does it apply?" value={context.jurisdiction} options={JURISDICTIONS} onChange={(value) => patch({ jurisdiction: value as Context['jurisdiction'] })} />
      <Select
        label="Explain in"
        value={context.language}
        options={LANGUAGES}
        onChange={(value) => patch({ language: value as Context['language'] })}
        hint={needsAi && mode === 'local' ? 'Other languages need AI. On-device mode is English only.' : undefined}
      />

      <div className="mt-1 border-t border-line pt-4">
        <p id="mode-label" className="mb-2 text-sm font-semibold text-fg">
          How should Plainly analyse it?
        </p>
        <RadioGroup.Root value={mode} onValueChange={(value) => dispatch({ type: 'mode', mode: value as EngineMode })} aria-labelledby="mode-label" className="flex flex-col gap-2.5">
          <ModeOption
            value="local"
            icon={Cpu}
            title="On this device only"
            description="Rule-based engine in your browser. Pasted text and Word files never leave it. English only."
          />
          <ModeOption
            value="ai"
            icon={Sparkles}
            title={`AI (${config.ai.provider})`}
            disabled={!aiAvailable}
            description={aiAvailable ? 'Deeper explanations, 9 languages, reads scans. Text goes to the server and the AI.' : 'Not available: this server has no AI key configured.'}
          />
        </RadioGroup.Root>

        {mode === 'ai' && aiAvailable ? (
          <div className="mt-3">
            <SwitchRow
              checked={state.redact}
              onCheckedChange={(redact) => dispatch({ type: 'redact', redact })}
              label="Hide personal details from the AI"
              description="Emails, phone and ID numbers, cards and names after a title are masked, then restored in your results."
            />
          </div>
        ) : null}
        {mode === 'local' ? (
          <Callout tone="good" className="mt-3">
            Nothing you paste is sent anywhere. PDFs and photos still need the server to read them.
          </Callout>
        ) : null}
      </div>
    </div>
  );
}

/** On phones the panel collapses to a one-line summary; on desktop it is always open. */
export function SituationPanel() {
  const { state } = useSession();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [open, setOpen] = useState(false);
  const { role, stage, jurisdiction } = state.context;

  return (
    <aside aria-labelledby="situation-title" className="no-print min-w-0 lg:sticky lg:top-24 lg:self-start">
      <details
        open={desktop || open}
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="group rounded-2xl border border-line bg-surface shadow-card forced-border"
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 lg:pointer-events-none lg:cursor-default [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 shrink-0 place-content-center rounded-xl bg-brand-soft text-brand-text">
            <UserRound aria-hidden className="size-[1.1rem]" />
          </span>
          <span className="min-w-0 flex-1">
            <span id="situation-title" className="block text-base font-bold text-fg">
              Your situation
            </span>
            <span className="block truncate text-xs text-muted lg:hidden">
              {roleLabel(role).split(' / ')[0]} · {stageLabel(stage)} · {jurisdictionLabel(jurisdiction)}
            </span>
            <span className="hidden text-xs text-muted lg:block">Changes what we flag and what we suggest.</span>
          </span>
          <ChevronDown aria-hidden className="size-5 text-muted transition-transform group-open:rotate-180 lg:hidden" />
        </summary>
        <div className="border-t border-line px-5 py-5">
          <Fields />
        </div>
      </details>
    </aside>
  );
}
