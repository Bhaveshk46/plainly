/** Client for the local engine worker: promise-based, one shared worker, abortable. */

import type { Context } from '../../shared/options.js';
import type { Analysis, Answer, Comparison } from '../../shared/types.js';
import type { WorkerRequest, WorkerResponse } from '../workers/engine.worker.js';

interface Pending {
  resolve: (value: Analysis | Comparison | Answer) => void;
  reject: (reason: unknown) => void;
}

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.ok) entry.resolve(event.data.result);
    else entry.reject(new Error(event.data.message));
  });
  worker.addEventListener('error', () => {
    for (const entry of pending.values()) entry.reject(new Error('The on-device engine stopped unexpectedly.'));
    pending.clear();
    worker = undefined;
  });
  return worker;
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

function call<T extends Analysis | Comparison | Answer>(message: DistributiveOmit<WorkerRequest, 'id'>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    sequence += 1;
    const id = sequence;
    pending.set(id, { resolve: resolve as Pending['resolve'], reject });
    signal?.addEventListener('abort', () => {
      pending.delete(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
    getWorker().postMessage({ ...message, id } as WorkerRequest);
  });
}

export const localEngine = {
  analyze: (text: string, context: Context, signal?: AbortSignal) => call<Analysis>({ type: 'analyze', text, context }, signal),
  compare: (a: { label: string; text: string }, b: { label: string; text: string }, context: Context, signal?: AbortSignal) =>
    call<Comparison>({ type: 'compare', a, b, context }, signal),
  ask: (text: string, question: string, signal?: AbortSignal) => call<Answer>({ type: 'ask', text, question }, signal),
};
