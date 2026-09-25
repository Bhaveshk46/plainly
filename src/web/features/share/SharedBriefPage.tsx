import { Clock, LockKeyhole, Printer, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { decryptJson, importShareKey } from '../../../shared/crypto.js';
import { Button, Callout, Spinner } from '../../components/ui.js';
import { api, ApiError } from '../../lib/api.js';
import type { Brief, SharePayload } from '../../lib/brief.js';
import { timeUntil } from '../../lib/format.js';
import { BriefPreview } from '../brief/BriefPreview.js';

type State =
  | { status: 'loading' }
  | { status: 'ready'; brief: Brief; expiresAt: string }
  | { status: 'error'; title: string; message: string };

/** "/s/<id>" -> "<id>" */
export const shareIdFromPath = (pathname: string): string => /^\/s\/([A-Za-z0-9_-]{22})\/?$/.exec(pathname)?.[1] ?? '';

/**
 * Read-only view of a shared brief. The key lives in the URL fragment, which
 * the browser never sends to any server: the ciphertext is fetched, then
 * decrypted right here.
 */
export function SharedBriefPage({ id, keyFragment }: { id: string; keyFragment: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    document.title = 'Shared brief – Plainly';

    (async () => {
      if (!id) {
        setState({ status: 'error', title: 'This link is not valid', message: 'The address looks incomplete. Ask the sender for the full link.' });
        return;
      }
      if (!keyFragment) {
        setState({ status: 'error', title: 'This link is missing its key', message: 'The part of the link after the “#” holds the decryption key. Ask the sender to copy the whole link.' });
        return;
      }
      try {
        const key = await importShareKey(keyFragment);
        const envelope = await api.getShare(id, controller.signal);
        const payload = await decryptJson<SharePayload>(key, envelope);
        if (payload.version !== 1) throw new Error('unsupported');
        setState({ status: 'ready', brief: payload.brief, expiresAt: envelope.expiresAt });
      } catch (caught) {
        if ((caught as { name?: string }).name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 404) {
          setState({ status: 'error', title: 'This link has expired', message: 'Shared briefs are deleted automatically, or the sender may have revoked it. Ask them to send a new one.' });
        } else if (caught instanceof ApiError) {
          setState({ status: 'error', title: 'We could not load the brief', message: caught.message });
        } else {
          setState({ status: 'error', title: 'This link cannot be opened', message: 'The key in the link does not match this brief, or the link was changed. Ask the sender to copy the whole link again.' });
        }
      }
    })();

    return () => controller.abort();
  }, [id, keyFragment]);

  return (
    <main id="main" className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      {state.status === 'loading' ? (
        <p role="status" className="flex items-center gap-2.5 py-16 text-muted">
          <Spinner /> Decrypting in your browser…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className="mx-auto max-w-xl py-10 text-center">
          <span className="mx-auto grid size-14 place-content-center rounded-2xl bg-high-bg text-high">
            <TriangleAlert aria-hidden className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-fg">{state.title}</h1>
          <p className="mt-2 text-muted">{state.message}</p>
          <p className="mt-6">
            <a href="/" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-brand-fg hover:bg-brand-hover">
              Go to Plainly
            </a>
          </p>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div className="flex flex-col gap-5">
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-fg">
              <LockKeyhole aria-hidden className="size-6 text-brand-text" />
              Shared brief
            </h1>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
              Print / save as PDF
            </Button>
          </div>
          <Callout tone="good" className="no-print">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck aria-hidden className="size-4" /> Decrypted in your browser. The server never saw its contents.
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock aria-hidden className="size-4" /> Expires {timeUntil(state.expiresAt)}.
              </span>
            </span>
          </Callout>
          <BriefPreview brief={state.brief} />
        </div>
      ) : null}
    </main>
  );
}
