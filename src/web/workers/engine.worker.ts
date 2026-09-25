/**
 * "On this device only" engine. Runs the same deterministic analysis as the
 * server, inside a Web Worker, so nothing leaves the browser and the UI thread
 * stays responsive even for a 150k-character document.
 */

import type { Context } from '../../shared/options.js';
import { analyzeLocally, askLocally, compareLocally } from '../../shared/offline.js';
import type { Analysis, Answer, Comparison } from '../../shared/types.js';

export type WorkerRequest =
  | { id: number; type: 'analyze'; text: string; context: Context }
  | { id: number; type: 'compare'; a: { label: string; text: string }; b: { label: string; text: string }; context: Context }
  | { id: number; type: 'ask'; text: string; question: string };

export type WorkerResponse =
  | { id: number; ok: true; result: Analysis | Comparison | Answer }
  | { id: number; ok: false; message: string };

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result =
      request.type === 'analyze'
        ? analyzeLocally(request.text, request.context)
        : request.type === 'compare'
          ? compareLocally(request.a, request.b, request.context)
          : askLocally(request.text, request.question);
    self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, message: error instanceof Error ? error.message : 'The analysis failed.' } satisfies WorkerResponse);
  }
});
