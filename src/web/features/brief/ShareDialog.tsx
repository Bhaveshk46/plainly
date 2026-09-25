import { Dialog, RadioGroup } from 'radix-ui';
import { Check, Clock, Copy, KeyRound, Link2, ShieldCheck, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { encryptJson, exportShareKey, generateShareKey } from '../../../shared/crypto.js';
import { Button, Callout } from '../../components/ui.js';
import { useAnnounce } from '../../hooks/useAnnouncer.js';
import { api } from '../../lib/api.js';
import { copyText } from '../../lib/clipboard.js';
import { cn } from '../../lib/cn.js';
import { timeUntil } from '../../lib/format.js';
import type { Brief, SharePayload } from '../../lib/brief.js';

export interface CreatedShare {
  id: string;
  deleteToken: string;
  expiresAt: string;
  url: string;
}

const LABELS: Record<number, string> = { 1: '1 hour', 24: '24 hours', 168: '7 days' };

interface Props {
  brief: Brief;
  ttlHours: readonly number[];
  created: CreatedShare | null;
  onCreated: (share: CreatedShare | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create an end-to-end-encrypted link. The brief is encrypted here, in the
 * browser, with a new key that goes only into the URL fragment; the server
 * receives and stores ciphertext it can never read.
 */
export function ShareDialog({ brief, ttlHours, created, onCreated, open, onOpenChange }: Props) {
  const announce = useAnnounce();
  const [ttl, setTtl] = useState<number>(ttlHours.includes(24) ? 24 : (ttlHours[0] ?? 24));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  async function create(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const key = await generateShareKey();
      const payload: SharePayload = { version: 1, brief };
      const encrypted = await encryptJson(key, payload);
      const result = await api.createShare({ ...encrypted, ttlHours: ttl });
      const url = `${window.location.origin}/s/${result.id}#${await exportShareKey(key)}`;
      onCreated({ ...result, url });
      announce('Secure link created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(): Promise<void> {
    if (!created) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.deleteShare(created.id, created.deleteToken);
      onCreated(null);
      announce('Link revoked. It no longer works.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke the link.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(): Promise<void> {
    if (!created) return;
    const ok = await copyText(created.url);
    setCopied(ok);
    announce(ok ? 'Link copied to the clipboard.' : 'Copying was blocked by your browser.');
    if (ok) setTimeout(() => setCopied(false), 2500);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[92vh] w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-pop">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-fg">
                <Link2 aria-hidden className="size-5 text-brand-text" /> Share securely
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                Send this brief to a lawyer or a trusted person. It is encrypted before it leaves your browser.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className="grid size-10 shrink-0 place-content-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-fg">
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-fg">
            <li className="flex gap-2">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-low" />
              Encrypted with a new key that only exists in the link. Plainly’s server stores unreadable data and cannot open it.
            </li>
            <li className="flex gap-2">
              <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-low" />
              Anyone with the full link can read it, so share it like a password.
            </li>
            <li className="flex gap-2">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-low" />
              It is deleted automatically when the time is up. You can also revoke it below.
            </li>
          </ul>

          {created ? (
            <div className="mt-5 flex flex-col gap-4">
              <div>
                <label htmlFor="share-url" className="mb-1.5 block text-sm font-semibold text-fg">
                  Your private link
                </label>
                <input
                  id="share-url"
                  readOnly
                  value={created.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-h-11 w-full rounded-xl border-[1.5px] border-line bg-surface-2 px-3.5 font-mono text-xs text-fg"
                />
                <p className="mt-1.5 text-[0.82rem] text-muted">Expires {timeUntil(created.expiresAt)}.</p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Button icon={copied ? Check : Copy} onClick={() => void copy()}>
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
                <Button variant="danger" icon={Trash2} busy={busy} onClick={() => void revoke()}>
                  Revoke link now
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              <div>
                <p id="ttl-label" className="mb-2 text-sm font-semibold text-fg">
                  How long should it work?
                </p>
                <RadioGroup.Root value={String(ttl)} onValueChange={(value) => setTtl(Number(value))} aria-labelledby="ttl-label" className="grid grid-cols-3 gap-2.5">
                  {ttlHours.map((hours) => (
                    <RadioGroup.Item
                      key={hours}
                      value={String(hours)}
                      className={cn(
                        'min-h-11 rounded-xl border-[1.5px] border-line bg-surface px-3 text-sm font-semibold text-fg transition-colors forced-border',
                        'hover:border-brand/60 data-[state=checked]:border-brand data-[state=checked]:bg-brand-soft data-[state=checked]:text-brand-text',
                      )}
                    >
                      {LABELS[hours] ?? `${hours} hours`}
                    </RadioGroup.Item>
                  ))}
                </RadioGroup.Root>
              </div>
              <div>
                <Button icon={Link2} busy={busy} onClick={() => void create()}>
                  {busy ? 'Encrypting…' : 'Create secure link'}
                </Button>
              </div>
            </div>
          )}

          {error ? (
            <Callout tone="danger" role="alert" className="mt-4">
              {error}
            </Callout>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
