/**
 * Orchestration: rules engine + (optional) Gemini + privacy + graceful
 * degradation. The HTTP layer talks only to this module.
 *
 * Flow for every request
 *   1. run the deterministic engine (always; it is fast and offline)
 *   2. if AI is requested and configured: mask personal identifiers, call the
 *      model with a fenced, schema-constrained prompt, un-mask, verify every
 *      quote against the document, and merge with step 1
 *   3. if the AI step fails for any reason, return step 1 with a clear notice
 */

import { analyzeOffline, buildAnalysis, mergeSharedQuotes, prepareDocument, scanClauses, type PreparedDocument } from '../../shared/core/analyze.js';
import { compareOffline } from '../../shared/core/compare.js';
import { createRedactor, restoreDeep, type Redactor } from '../../shared/core/redact.js';
import { NO_PRIVACY, askLocally } from '../../shared/offline.js';
import type { Context } from '../../shared/options.js';
import type { Analysis, Answer, Clause, Comparison, Privacy } from '../../shared/types.js';
import { LlmError, type LlmClient } from '../ai/gemini.js';
import { mergeAnalysis, mergeComparison, normalizeAnswer } from '../ai/merge.js';
import { analysisPrompt, askPrompt, comparePrompt, newBoundary, type PromptHint } from '../ai/prompts.js';
import { ANALYSIS_SCHEMA, ASK_SCHEMA, COMPARE_SCHEMA } from '../ai/schemas.js';
import type { Logger } from '../http/errors.js';

export interface Options {
  redact: boolean;
  useAI: boolean;
}

export interface AnalyzeInput {
  text: string;
  context: Context;
  options: Options;
}

export interface CompareInput {
  a: { label: string; text: string };
  b: { label: string; text: string };
  context: Context;
  options: Options;
}

export interface AskInput {
  text: string;
  question: string;
  history: Array<{ q: string; a: string }>;
  context: Context;
  options: Options;
}

export interface Assistant {
  analyze: (input: AnalyzeInput) => Promise<Analysis>;
  compare: (input: CompareInput) => Promise<Comparison>;
  ask: (input: AskInput) => Promise<Answer>;
  aiAvailable: () => boolean;
}

const NOT_CONFIGURED = 'AI is not configured on this server, so rule-based results are shown.';

const compactHint = (clause: Clause): PromptHint => ({
  hintId: clause.id,
  category: clause.category,
  title: clause.title,
  risk: clause.risk,
  quote: clause.quote,
});

function aiNotice(error: unknown): string {
  const reason = error instanceof LlmError ? error.message : 'The AI step failed unexpectedly.';
  return `${reason} Showing rule-based results instead.`;
}

const errorTag = (error: unknown): string => (error instanceof LlmError ? error.code : error instanceof Error ? error.name : 'unknown');

export function createAssistant({ llm, logger = console }: { llm: LlmClient; logger?: Logger }): Assistant {
  const privacyFor = (redactor: Redactor, sentToAI: boolean): Privacy => ({
    redactions: { ...redactor.counts },
    totalRedactions: redactor.total,
    sentToAI,
  });

  /** Masks identifiers when the user asked for it, otherwise passes text through. */
  const masker = (redactor: Redactor, redact: boolean) => (value: string): string => (redact ? redactor.apply(value) : value);

  const hintsFor = (doc: PreparedDocument, context: Context, limit: number, mask: (value: string) => string): PromptHint[] =>
    mergeSharedQuotes(scanClauses(doc, context))
      .slice(0, limit)
      .map((clause) => ({ ...compactHint(clause), quote: mask(clause.quote) }));

  async function analyze({ text, context, options }: AnalyzeInput): Promise<Analysis> {
    const doc = prepareDocument(text);
    const offline = analyzeOffline(doc, context);

    if (!options.useAI || !llm.enabled) {
      return { ...offline, privacy: NO_PRIVACY, notice: options.useAI ? NOT_CONFIGURED : null };
    }

    const redactor = createRedactor();
    const mask = masker(redactor, options.redact);
    const hints = offline.clauses.slice(0, 30).map((clause) => ({ ...compactHint(clause), quote: mask(clause.quote) }));
    const { system, user } = analysisPrompt({ text: mask(doc.text), context, hints, boundary: newBoundary() });

    try {
      const raw = await llm.generateJson({ system, prompt: user, schema: ANALYSIS_SCHEMA });
      const ai = restoreDeep(raw, redactor.map);
      const merged = mergeAnalysis({ ai, doc, context, ruleClauses: offline.clauses, offline });
      const analysis = buildAnalysis({
        doc,
        context,
        type: merged.type,
        keyFacts: merged.keyFacts,
        clauses: merged.clauses,
        obligations: merged.obligations,
        missing: merged.missing,
        summary: merged.summary,
        questions: merged.questions,
        nextSteps: merged.nextSteps,
        mode: 'ai',
        outputLanguage: context.language,
      });
      return { ...analysis, grounding: merged.grounding, privacy: privacyFor(redactor, true) };
    } catch (error) {
      logger.warn?.(`analyze: AI step failed (${errorTag(error)})`);
      return { ...offline, privacy: privacyFor(redactor, true), notice: aiNotice(error) };
    }
  }

  async function compare({ a, b, context, options }: CompareInput): Promise<Comparison> {
    const docA = prepareDocument(a.text);
    const docB = prepareDocument(b.text);
    const labels = { a: a.label, b: b.label };
    const offline = compareOffline(docA, docB, context, labels);

    if (!options.useAI || !llm.enabled) {
      return { ...offline, privacy: NO_PRIVACY, notice: options.useAI ? NOT_CONFIGURED : null };
    }

    const redactor = createRedactor();
    const mask = masker(redactor, options.redact);
    const { system, user } = comparePrompt({
      textA: mask(docA.text),
      textB: mask(docB.text),
      labels,
      context,
      hints: { a: hintsFor(docA, context, 20, mask), b: hintsFor(docB, context, 20, mask) },
      boundary: newBoundary(),
    });

    try {
      const raw = await llm.generateJson({ system, prompt: user, schema: COMPARE_SCHEMA });
      const merged = mergeComparison({ ai: restoreDeep(raw, redactor.map), docA, docB });
      if (!merged) throw new LlmError('bad_response', 'The AI returned an empty comparison.');
      return { ...offline, ...merged, mode: 'ai', outputLanguage: context.language, privacy: privacyFor(redactor, true) };
    } catch (error) {
      logger.warn?.(`compare: AI step failed (${errorTag(error)})`);
      return { ...offline, privacy: privacyFor(redactor, true), notice: aiNotice(error) };
    }
  }

  async function ask({ text, question, history, context, options }: AskInput): Promise<Answer> {
    const doc = prepareDocument(text);

    if (!options.useAI || !llm.enabled) {
      return askLocally(text, question, options.useAI ? 'AI is not configured on this server, so only matching passages are shown.' : null);
    }

    const redactor = createRedactor();
    const mask = masker(redactor, options.redact);
    const { system, user } = askPrompt({
      text: mask(doc.text),
      question: mask(question),
      history: history.map((turn) => ({ q: mask(turn.q), a: mask(turn.a) })),
      context,
      boundary: newBoundary(),
    });

    try {
      const raw = await llm.generateJson({ system, prompt: user, schema: ASK_SCHEMA, maxOutputTokens: 8_192 });
      const answer = normalizeAnswer({ ai: restoreDeep(raw, redactor.map), doc });
      return { mode: 'ai', ...answer, privacy: privacyFor(redactor, true), outputLanguage: context.language, notice: null };
    } catch (error) {
      logger.warn?.(`ask: AI step failed (${errorTag(error)})`);
      return { ...askLocally(text, question, aiNotice(error)), privacy: privacyFor(redactor, true) };
    }
  }

  return { analyze, compare, ask, aiAvailable: () => llm.enabled };
}
