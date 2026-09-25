import { GitCompareArrows } from 'lucide-react';
import { useState } from 'react';
import { Button, Callout, Field, TextInput } from '../../components/ui.js';
import { useAnnounce } from '../../hooks/useAnnouncer.js';
import { useAsyncTask } from '../../hooks/useAsyncTask.js';
import { useEngineSettings } from '../../hooks/useEngineSettings.js';
import { api } from '../../lib/api.js';
import { engine } from '../../lib/engine.js';
import { COMPARE_SAMPLE } from '../../lib/samples.js';
import { useSession } from '../../state/session.js';
import { DocumentField } from '../workspace/DocumentField.js';
import { ComparisonView } from './ComparisonView.js';

interface Slot {
  label: string;
  text: string;
}

const MIN_CHARS = 40;

function DocumentSlot({ title, slot, onChange, error }: { title: string; slot: Slot; onChange: (slot: Slot) => void; error: string | undefined }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm forced-border sm:p-5">
      <legend className="px-2 text-sm font-bold text-fg">{title}</legend>
      <Field label="Name">{(props) => <TextInput {...props} value={slot.label} maxLength={60} autoComplete="off" onChange={(event) => onChange({ ...slot, label: event.target.value })} />}</Field>
      <DocumentField
        label="Text"
        text={slot.text}
        rows={9}
        hint="Paste it, or drop a file."
        error={error}
        onText={(text, source) => onChange({ text, label: source?.fileName && /^Document [AB]$/.test(slot.label) ? source.fileName.replace(/\.[^.]+$/, '').slice(0, 60) : slot.label })}
      />
    </fieldset>
  );
}

export function CompareTab() {
  const { state, dispatch } = useSession();
  const settings = useEngineSettings();
  const announce = useAnnounce();
  const { busy, error, run, clearError } = useAsyncTask();
  const [a, setA] = useState<Slot>({ label: 'Document A', text: '' });
  const [b, setB] = useState<Slot>({ label: 'Document B', text: '' });
  const [problems, setProblems] = useState<{ a?: string; b?: string }>({});

  async function loadSample(): Promise<void> {
    clearError();
    try {
      const [textA, textB] = await Promise.all([api.sample(COMPARE_SAMPLE.a.file), api.sample(COMPARE_SAMPLE.b.file)]);
      setA({ label: COMPARE_SAMPLE.a.label, text: textA });
      setB({ label: COMPARE_SAMPLE.b.label, text: textB });
      dispatch({ type: 'context', patch: COMPARE_SAMPLE.context });
      setProblems({});
      announce('Sample pair loaded and situation set. Choose Compare documents.');
    } catch (caught) {
      announce(caught instanceof Error ? caught.message : 'Could not load the sample.');
    }
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const next = {
      ...(a.text.trim().length < MIN_CHARS ? { a: 'Please add the text of the first document.' } : {}),
      ...(b.text.trim().length < MIN_CHARS ? { b: 'Please add the text of the second document.' } : {}),
    };
    setProblems(next);
    if (next.a || next.b) {
      announce('Please add text for both documents.');
      return;
    }
    announce(settings.mode === 'ai' ? 'Comparing with AI. This can take up to a minute…' : 'Comparing the documents…');
    const comparison = await run((signal) =>
      engine.compare({ label: a.label.trim() || 'Document A', text: a.text }, { label: b.label.trim() || 'Document B', text: b.text }, state.context, settings, signal),
    );
    if (comparison) {
      dispatch({ type: 'compared', comparison });
      announce(`Comparison complete. ${comparison.verdict.headline}`);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-6">
        <div>
          <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-fg">
            <GitCompareArrows aria-hidden className="size-6 text-brand-text" />
            Compare two documents
          </h2>
          <p className="mt-1 text-muted">Two offers, or the old and new version of the same document. See what differs, which is better for you, and what changed.</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <DocumentSlot title="Document A" slot={a} onChange={setA} error={problems.a} />
          <DocumentSlot title="Document B" slot={b} onChange={setB} error={problems.b} />
        </div>

        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" icon={GitCompareArrows} busy={busy}>
            {busy ? 'Comparing…' : 'Compare documents'}
          </Button>
          <Button variant="secondary" onClick={() => void loadSample()} disabled={busy}>
            Try a sample pair
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setA({ label: 'Document A', text: '' });
              setB({ label: 'Document B', text: '' });
              setProblems({});
              dispatch({ type: 'compared', comparison: null });
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {state.comparison ? <ComparisonView result={state.comparison} /> : null}
    </div>
  );
}
