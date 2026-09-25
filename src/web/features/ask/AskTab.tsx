import { Bot, MessageCircleQuestion, Send, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { languageDirection } from '../../../shared/options.js';
import type { Answer } from '../../../shared/types.js';
import { Badge, Button, Callout, Card, Chip, Spinner, TextInput } from '../../components/ui.js';
import { useAnnounce } from '../../hooks/useAnnouncer.js';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery.js';
import { useEngineSettings } from '../../hooks/useEngineSettings.js';
import { cn } from '../../lib/cn.js';
import { engine } from '../../lib/engine.js';
import { CONFIDENCE_LABELS, describeRedactions } from '../../lib/format.js';
import { suggestQuestions } from '../../lib/suggestions.js';
import { useSession, type ChatMessage } from '../../state/session.js';
import { useWorkspace } from '../workspace/WorkspaceContext.js';

const CONFIDENCE_TONE: Record<Answer['confidence'], 'good' | 'neutral'> = { high: 'good', medium: 'neutral', low: 'neutral', not_found: 'neutral' };

function AnswerBody({ answer, onFollowUp }: { answer: Answer; onFollowUp: (question: string) => void }) {
  const masked = describeRedactions(answer.privacy.redactions);
  return (
    <div lang={answer.outputLanguage} dir={languageDirection(answer.outputLanguage)} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={CONFIDENCE_TONE[answer.confidence]}>{CONFIDENCE_LABELS[answer.confidence]}</Badge>
        {answer.mode === 'offline' ? <Badge>Keyword match</Badge> : <Badge tone="brand">AI answer</Badge>}
      </div>
      {answer.notice ? <Callout tone="warn" role="note">{answer.notice}</Callout> : null}
      <p className="text-[0.97rem] leading-relaxed whitespace-pre-wrap text-fg">{answer.answer}</p>
      {answer.citations.length ? (
        <div>
          <p className="mb-1.5 text-[0.7rem] font-bold tracking-wider text-muted uppercase">Supporting text from your document</p>
          <div className="grid gap-2">
            {answer.citations.map((citation) => (
              <blockquote key={citation.quote} className="quote-text rounded-e-lg border-s-4 border-line bg-surface-2 px-3.5 py-2.5 text-sm break-words text-fg">
                {citation.location ? <span className="mb-0.5 block font-sans text-[0.7rem] font-bold text-muted not-italic">{citation.location}</span> : null}“{citation.quote}”
              </blockquote>
            ))}
          </div>
        </div>
      ) : null}
      {answer.caveats.length ? (
        <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
          {answer.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      ) : null}
      {answer.followUps.length ? (
        <ul aria-label="Follow-up questions" className="flex flex-wrap gap-2">
          {answer.followUps.map((question) => (
            <li key={question}>
              <Chip onClick={() => onFollowUp(question)}>{question}</Chip>
            </li>
          ))}
        </ul>
      ) : null}
      {answer.privacy.sentToAI ? <p className="text-xs text-muted">{masked ? `Hid ${masked} before sending to the AI.` : 'This question and your document were sent to the AI service.'}</p> : null}
    </div>
  );
}

function Message({ message, onFollowUp }: { message: ChatMessage; onFollowUp: (question: string) => void }) {
  const isUser = message.role === 'user';
  return (
    <li className={cn('flex gap-3 animate-rise', isUser && 'flex-row-reverse')}>
      <span
        aria-hidden
        className={cn('mt-1 grid size-9 shrink-0 place-content-center rounded-full', isUser ? 'bg-brand text-brand-fg' : 'bg-brand-soft text-brand-text')}
      >
        {isUser ? <UserRound className="size-4" /> : <Bot className="size-4" />}
      </span>
      <div
        className={cn(
          'min-w-0 max-w-[min(100%,44rem)] rounded-2xl border px-4 py-3',
          isUser ? 'border-brand/40 bg-brand-soft' : 'border-line bg-surface shadow-sm',
        )}
      >
        <p className="mb-1 text-[0.7rem] font-bold tracking-wider text-muted uppercase">{isUser ? 'You asked' : 'Plainly'}</p>
        {message.pending ? (
          <p className="flex items-center gap-2 text-muted" aria-busy>
            <Spinner /> Reading your document…
          </p>
        ) : message.error ? (
          <Callout tone="danger" role="alert">
            {message.error}
          </Callout>
        ) : message.answer ? (
          <AnswerBody answer={message.answer} onFollowUp={onFollowUp} />
        ) : (
          <p className="text-[0.97rem] text-fg">{message.text}</p>
        )}
      </div>
    </li>
  );
}

export function AskTab() {
  const { state, dispatch } = useSession();
  const settings = useEngineSettings();
  const announce = useAnnounce();
  const { goTo } = useWorkspace();
  const reduceMotion = usePrefersReducedMotion();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [state.chat, reduceMotion]);

  if (!state.analysis || !state.document) {
    return (
      <Card className="flex flex-col items-start gap-4">
        <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-fg">
          <MessageCircleQuestion aria-hidden className="size-6 text-brand-text" />
          Ask questions about your document
        </h2>
        <Callout tone="info">Add a document in the Explain tab first, then come back here. Questions are answered only from your document, with the supporting text quoted.</Callout>
        <Button onClick={() => goTo('explain')}>Go to Explain</Button>
      </Card>
    );
  }

  const { analysis, document: doc } = state;

  async function ask(text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setTooShort(true);
      announce('Please type a question.');
      inputRef.current?.focus();
      return;
    }
    if (busy) return;
    setTooShort(false);
    setBusy(true);
    setQuestion('');
    const stamp = Date.now();
    const pendingId = `a-${stamp}`;
    // Earlier question/answer pairs give the model context for follow-ups.
    const history: Array<{ q: string; a: string }> = [];
    state.chat.forEach((message, index) => {
      const next = state.chat[index + 1];
      if (message.role === 'user' && next?.role === 'assistant' && next.answer) history.push({ q: message.text ?? '', a: next.answer.answer });
    });

    dispatch({ type: 'chat-add', message: { id: `q-${stamp}`, role: 'user', text: trimmed } });
    dispatch({ type: 'chat-add', message: { id: pendingId, role: 'assistant', pending: true } });
    announce(settings.mode === 'ai' ? 'Reading your document with AI…' : 'Searching your document…');
    try {
      const answer = await engine.ask(doc.text, trimmed, history.slice(-6), state.context, settings);
      dispatch({ type: 'chat-update', id: pendingId, patch: { pending: false, answer } });
      announce(`Answer: ${answer.answer.slice(0, 220)}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Something went wrong. Please try again.';
      dispatch({ type: 'chat-update', id: pendingId, patch: { pending: false, error: message } });
      announce(`Problem: ${message}`);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-fg">
          <MessageCircleQuestion aria-hidden className="size-6 text-brand-text" />
          Ask questions about your document
        </h2>
        <p className="mt-1 text-muted">
          Asking about <strong className="text-fg">{doc.label}</strong> ({analysis.document.wordCount.toLocaleString('en')} words). To use a different document, analyse it in the Explain tab.
        </p>
      </div>

      <div>
        <p id="suggest-label" className="mb-2 text-sm font-semibold text-fg">
          Questions people often ask:
        </p>
        <ul aria-labelledby="suggest-label" className="flex flex-wrap gap-2">
          {suggestQuestions(analysis).map((suggestion) => (
            <li key={suggestion}>
              <Chip disabled={busy} onClick={() => void ask(suggestion)}>
                {suggestion}
              </Chip>
            </li>
          ))}
        </ul>
      </div>

      <div role="log" aria-live="polite" aria-label="Conversation" className="min-h-8">
        <ol className="grid gap-4">
          {state.chat.map((message) => (
            <Message key={message.id} message={message} onFollowUp={(next) => void ask(next)} />
          ))}
        </ol>
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        noValidate
        className="sticky bottom-3 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-3 shadow-pop"
      >
        <div className="min-w-52 flex-1">
          <label htmlFor="ask-input" className="mb-1.5 block text-sm font-semibold text-fg">
            Your question
          </label>
          <TextInput
            id="ask-input"
            ref={inputRef}
            value={question}
            maxLength={600}
            autoComplete="off"
            placeholder="e.g. What happens if I want to leave early?"
            aria-invalid={tooShort || undefined}
            aria-describedby={tooShort ? 'ask-error' : undefined}
            onChange={(event) => {
              setQuestion(event.target.value);
              setTooShort(false);
            }}
          />
          {tooShort ? (
            <p id="ask-error" role="alert" className="mt-1 text-sm font-medium text-high">
              Please type a question.
            </p>
          ) : null}
        </div>
        <Button type="submit" icon={Send} busy={busy}>
          Ask
        </Button>
      </form>
    </div>
  );
}
