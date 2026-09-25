import { ArrowRight, BriefcaseBusiness, MessageCircleQuestion, ScanText, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button, Callout, Card } from '../../components/ui.js';
import { useAnnounce } from '../../hooks/useAnnouncer.js';
import { useAsyncTask } from '../../hooks/useAsyncTask.js';
import { useEngineSettings } from '../../hooks/useEngineSettings.js';
import { api } from '../../lib/api.js';
import { engine } from '../../lib/engine.js';
import { plural } from '../../lib/format.js';
import { SAMPLES, type Sample } from '../../lib/samples.js';
import { useConfig } from '../../state/config.js';
import { useSession } from '../../state/session.js';
import { DocumentField } from '../workspace/DocumentField.js';
import { useWorkspace } from '../workspace/WorkspaceContext.js';
import { ResultsView } from './results/ResultsView.js';
import type { Context } from '../../../shared/options.js';

const MIN_CHARS = 40;

function SampleGrid({ onPick, disabled }: { onPick: (sample: Sample) => void; disabled: boolean }) {
  return (
    <div>
      <p id="samples-label" className="mb-2 text-sm font-semibold text-fg">
        No document handy? Try a fictional sample:
      </p>
      <ul aria-labelledby="samples-label" className="grid gap-2.5 sm:grid-cols-2">
        {SAMPLES.map((sample) => (
          <li key={sample.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(sample)}
              className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-start transition-colors hover:border-brand hover:bg-brand-soft disabled:opacity-60 forced-border"
            >
              <span>
                <span className="block text-sm font-bold text-fg">{sample.label}</span>
                <span className="block text-xs text-muted">{sample.blurb}</span>
              </span>
              <ArrowRight aria-hidden className="size-4 shrink-0 text-brand-text transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExplainTab() {
  const { state, dispatch } = useSession();
  const { config } = useConfig();
  const settings = useEngineSettings();
  const announce = useAnnounce();
  const { goTo } = useWorkspace();
  const { busy, error, run, clearError } = useAsyncTask();

  const [text, setText] = useState(state.document?.text ?? '');
  const [label, setLabel] = useState(state.document?.label ?? 'Your document');
  const [editing, setEditing] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState('');

  const showResults = state.analysis !== null && state.document !== null && !editing;

  async function analyse(documentText: string, documentLabel: string, contextOverride?: Partial<Context>): Promise<void> {
    const context = { ...state.context, ...contextOverride };
    announce(settings.mode === 'ai' ? 'Reading the document with AI. This can take up to a minute…' : 'Analysing the document…');
    const analysis = await run((signal) => engine.analyze(documentText, context, settings, signal));
    if (!analysis) return;
    dispatch({ type: 'analysed', document: { text: documentText, label: documentLabel }, analysis });
    setEditing(false);
    announce(`Analysis complete. ${plural(analysis.clauses.length, 'term')} found. Overall risk: ${analysis.risk.level}.`);
  }

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (busy || sampleLoading) return;
    if (text.trim().length < MIN_CHARS) {
      setTooShort(true);
      announce('Please paste or upload a longer document.');
      return;
    }
    void analyse(text, label);
  }

  async function pickSample(sample: Sample): Promise<void> {
    if (busy || sampleLoading) return;
    setSampleLoading(true);
    setSampleError('');
    clearError();
    setTooShort(false);
    try {
      const sampleText = await api.sample(sample.file);
      setText(sampleText);
      setLabel(sample.label);
      dispatch({ type: 'context', patch: sample.context });
      announce(`${sample.label} loaded and situation set. Analysing…`);
      await analyse(sampleText, sample.label, sample.context);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not load the sample.';
      setSampleError(message);
      announce(message);
    } finally {
      setSampleLoading(false);
    }
  }

  if (showResults && state.analysis && state.document) {
    return (
      <div className="flex flex-col gap-8">
        <ResultsView
          analysis={state.analysis}
          documentText={state.document.text}
          onNewDocument={() => {
            dispatch({ type: 'reset-document' });
            setText('');
            setLabel('Your document');
            setEditing(false);
          }}
          onEditText={() => setEditing(true)}
        />
        <Card className="no-print bg-gradient-to-br from-brand-soft to-surface">
          <h3 className="text-lg font-bold text-fg">What next?</h3>
          <p className="mt-1 text-sm text-muted">Both tools build on this analysis.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button icon={MessageCircleQuestion} onClick={() => goTo('ask')}>
              Ask questions about it
            </Button>
            <Button variant="secondary" icon={BriefcaseBusiness} onClick={() => goTo('brief')}>
              Prepare a lawyer brief
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-7">
      <div>
        <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-fg">
          <ScanText aria-hidden className="size-6 text-brand-text" />
          Explain a document
        </h2>
        <p className="mt-1 text-muted">Paste it, or drop a PDF, Word file or a photo of a paper notice.</p>
      </div>

      <DocumentField
        disabled={busy || sampleLoading}
        label="Document text"
        text={text}
        onText={(next, source) => {
          setText(next);
          setTooShort(false);
          setLabel(source?.fileName ? source.fileName.replace(/\.[^.]+$/, '') : 'Your document');
        }}
        error={tooShort ? 'Please paste or upload a longer document (at least a couple of sentences).' : undefined}
      />

      <SampleGrid onPick={(sample) => void pickSample(sample)} disabled={busy || sampleLoading} />

      {sampleError ? <Callout tone="danger" role="alert">{sampleError} Try again, or paste your own document.</Callout> : null}

      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" icon={Sparkles} busy={busy || sampleLoading} disabled={text.length > config.limits.maxDocChars}>
          {busy ? 'Analysing…' : sampleLoading ? 'Loading sample…' : 'Explain this document'}
        </Button>
        {busy && settings.mode === 'ai' ? <span className="text-sm text-muted">Reading with AI, up to a minute…</span> : null}
        {config.ai.enabled ? null : <span className="text-sm text-muted">Private, on-device analysis. No account needed.</span>}
      </div>
    </form>
  );
}
