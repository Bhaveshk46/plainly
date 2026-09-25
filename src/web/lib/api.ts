/** Typed client for the Plainly JSON API. Types come from src/shared, so a contract change breaks the build. */

import type { Context } from '../../shared/options.js';
import type { Analysis, Answer, AppConfig, Comparison, ExtractResult, ShareCreated, ShareEnvelope } from '../../shared/types.js';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, { code = 'error', status = 0 }: { code?: string; status?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal | undefined;
  headers?: Record<string, string>;
}

async function request<T>(path: string, { method = 'GET', body, signal, headers }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    const init: RequestInit = { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers } };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (signal) init.signal = signal;
    response = await fetch(path, init);
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Check your connection and try again.', { code: 'network' });
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* a non-JSON error page */
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(error?.message ?? `The request failed (HTTP ${response.status}).`, { code: error?.code ?? 'error', status: response.status });
  }
  return payload as T;
}

export interface AiOptions {
  redact: boolean;
  useAI: boolean;
}

export const api = {
  config: (signal?: AbortSignal) => request<AppConfig>('/api/config', { signal }),
  analyze: (body: { text: string; context: Context; options: AiOptions }, signal?: AbortSignal) => request<Analysis>('/api/analyze', { method: 'POST', body, signal }),
  compare: (
    body: { a: { label: string; text: string }; b: { label: string; text: string }; context: Context; options: AiOptions },
    signal?: AbortSignal,
  ) => request<Comparison>('/api/compare', { method: 'POST', body, signal }),
  ask: (body: { text: string; question: string; history: Array<{ q: string; a: string }>; context: Context; options: AiOptions }, signal?: AbortSignal) =>
    request<Answer>('/api/ask', { method: 'POST', body, signal }),
  extract: async (file: File, signal?: AbortSignal) => request<ExtractResult>('/api/extract', { method: 'POST', body: { data: await toBase64(file) }, signal }),

  createShare: (body: { iv: string; ciphertext: string; ttlHours: number }, signal?: AbortSignal) => request<ShareCreated>('/api/shares', { method: 'POST', body, signal }),
  getShare: (id: string, signal?: AbortSignal) => request<ShareEnvelope>(`/api/shares/${encodeURIComponent(id)}`, { signal }),
  deleteShare: (id: string, deleteToken: string) => request<void>(`/api/shares/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${deleteToken}` } }),

  /** A bundled sample document. */
  sample: async (path: string): Promise<string> => {
    const response = await fetch(path);
    if (!response.ok) throw new ApiError('Could not load the sample.', { status: response.status });
    return response.text();
  },
};

/** Read a File as base64 (without the data-URL prefix). */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new ApiError('That file could not be read.', { code: 'read_failed' }));
    reader.readAsDataURL(file);
  });
}
