import { FileUp, Paperclip } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { Button, Callout, Field, Spinner, TextArea } from '../../components/ui.js';
import { useAnnounce } from '../../hooks/useAnnouncer.js';
import { cn } from '../../lib/cn.js';
import { loadFile } from '../../lib/files.js';
import { useConfig } from '../../state/config.js';
import { useSession } from '../../state/session.js';

interface Props {
  label: string;
  text: string;
  onText: (text: string, source?: { fileName?: string }) => void;
  rows?: number;
  hint?: string;
  error?: string | undefined;
  placeholder?: string;
  disabled?: boolean;
}

const ACCEPT = '.pdf,.docx,.txt,.md,image/png,image/jpeg,image/webp';

/** A textarea that also accepts dropped or chosen files (PDF, Word, photo, text). */
export function DocumentField({ label, text, onText, rows = 12, hint, error, placeholder, disabled }: Props) {
  const { config } = useConfig();
  const { state } = useSession();
  const announce = useAnnounce();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();

  const { maxDocChars, maxUploadBytes } = config.limits;
  const over = text.length > maxDocChars;

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file || disabled || loading) return;
    setProblem(undefined);
    setNote(undefined);
    setLoading(true);
    announce(`Reading ${file.name}…`);
    try {
      const loaded = await loadFile(file, { maxBytes: maxUploadBytes, maxChars: maxDocChars });
      onText(loaded.text, { fileName: file.name });
      const bits = [`Loaded ${file.name}, ${loaded.text.length.toLocaleString('en')} characters.`];
      if (loaded.truncated) bits.push('The document was longer than the limit, so only the first part was kept.');
      if (loaded.viaServer && state.mode === 'local') bits.push('This file type was read by the server (it is not stored).');
      setNote(bits.join(' '));
      announce(bits.join(' '));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That file could not be read.';
      setProblem(message);
      announce(`Problem: ${message}`);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = ''; // allow choosing the same file again
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint={hint ?? 'Paste the agreement, policy or notice here, or drop a file onto the box.'} error={error ?? problem}>
        {(props) => (
          <div className="relative">
            <TextArea
              {...props}
              rows={rows}
              value={text}
              disabled={disabled || loading}
              spellCheck={false}
              placeholder={placeholder ?? 'Paste your document here…'}
              onChange={(event) => onText(event.target.value)}
              onDragOver={(event) => {
                event.preventDefault();
                if (disabled || loading) return;
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              aria-busy={loading || undefined}
              className={cn(dragging && 'border-dashed border-brand bg-brand-soft')}
            />
            {dragging ? (
              <div aria-hidden className="pointer-events-none absolute inset-0 grid place-content-center rounded-xl text-brand-text">
                <span className="flex items-center gap-2 text-lg font-bold">
                  <FileUp className="size-6" /> Drop to load
                </span>
              </div>
            ) : null}
          </div>
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          ref={inputRef}
          id={fileId}
          type="file"
          disabled={disabled || loading}
          accept={ACCEPT}
          className="sr-only peer"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <label
          htmlFor={fileId}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-brand bg-surface px-4 text-sm font-semibold text-brand-text transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand hover:bg-brand-soft"
        >
          {loading ? <Spinner /> : <Paperclip aria-hidden className="size-4" />}
          Upload a file
        </label>
        <span className="text-[0.82rem] text-muted">PDF, Word (.docx), photo or text · up to {Math.floor(maxUploadBytes / 1024 / 1024)} MB</span>
        <span className={cn('ms-auto text-[0.82rem] tabular-nums', over ? 'font-semibold text-high' : 'text-muted')}>
          {text.length.toLocaleString('en')} / {maxDocChars.toLocaleString('en')} characters
        </span>
      </div>

      {note ? <Callout tone="info" role="status">{note}</Callout> : null}
      {text ? (
        <div>
          <Button variant="ghost" size="sm" disabled={disabled || loading} onClick={() => onText('')}>
            Clear text
          </Button>
        </div>
      ) : null}
    </div>
  );
}
