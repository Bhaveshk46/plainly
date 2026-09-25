/**
 * One facade over both engines. "local" runs in a Web Worker on the user's
 * device (nothing is sent anywhere); "ai" calls the server, which masks personal
 * data, asks Gemini, verifies every quote and falls back to rules on any failure.
 */

import type { Context } from '../../shared/options.js';
import type { Analysis, Answer, Comparison } from '../../shared/types.js';
import { api } from './api.js';
import { localEngine } from './localEngine.js';

export type EngineMode = 'local' | 'ai';

export interface EngineSettings {
  mode: EngineMode;
  /** Mask personal identifiers before text goes to the AI. */
  redact: boolean;
}

const aiOptions = (settings: EngineSettings) => ({ redact: settings.redact, useAI: true });

export const engine = {
  analyze(text: string, context: Context, settings: EngineSettings, signal?: AbortSignal): Promise<Analysis> {
    return settings.mode === 'local' ? localEngine.analyze(text, context, signal) : api.analyze({ text, context, options: aiOptions(settings) }, signal);
  },

  compare(
    a: { label: string; text: string },
    b: { label: string; text: string },
    context: Context,
    settings: EngineSettings,
    signal?: AbortSignal,
  ): Promise<Comparison> {
    return settings.mode === 'local' ? localEngine.compare(a, b, context, signal) : api.compare({ a, b, context, options: aiOptions(settings) }, signal);
  },

  ask(
    text: string,
    question: string,
    history: Array<{ q: string; a: string }>,
    context: Context,
    settings: EngineSettings,
    signal?: AbortSignal,
  ): Promise<Answer> {
    return settings.mode === 'local' ? localEngine.ask(text, question, signal) : api.ask({ text, question, history, context, options: aiOptions(settings) }, signal);
  },
};
