/**
 * The deterministic engine, packaged as full API responses. The server uses it
 * when AI is off or fails; the browser (in a Web Worker) uses it for "on this
 * device only" mode. One implementation, so both give identical results.
 */

import type { Context } from './options.js';
import { analyzeOffline, prepareDocument } from './core/analyze.js';
import { answerOffline } from './core/ask.js';
import { compareOffline } from './core/compare.js';
import type { Analysis, Answer, Comparison, Privacy } from './types.js';

export const NO_PRIVACY: Privacy = Object.freeze({ redactions: {}, totalRedactions: 0, sentToAI: false });

export function analyzeLocally(text: string, context: Context, notice: string | null = null): Analysis {
  return { ...analyzeOffline(prepareDocument(text), context), privacy: NO_PRIVACY, notice };
}

export function compareLocally(a: { label: string; text: string }, b: { label: string; text: string }, context: Context, notice: string | null = null): Comparison {
  return { ...compareOffline(prepareDocument(a.text), prepareDocument(b.text), context, { a: a.label, b: b.label }), privacy: NO_PRIVACY, notice };
}

export function askLocally(text: string, question: string, notice: string | null = null): Answer {
  return { ...answerOffline(prepareDocument(text).segments, question), privacy: NO_PRIVACY, outputLanguage: 'en', notice };
}
