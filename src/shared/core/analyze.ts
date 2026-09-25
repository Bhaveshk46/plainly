/**
 * The deterministic analysis engine. It runs with no network and no API key,
 * and it is also the guardrail layer under the AI: the AI can explain and
 * extend these findings, but it cannot silently remove a high-risk one.
 */

import { DEFAULT_CONTEXT, DISCLAIMER, jurisdictionLabel, roleLabel, type Context, type LanguageId, type Risk } from '../options.js';
import type { Clause, KeyFact, Mode, MissingItem, NextStep, Obligation, RiskSummary, Summary, CoreAnalysis } from '../types.js';
import { PARTY_NOUNS, buildNextSteps, resourcesFor, riskFor } from './context.js';
import { DOC_TYPES, detectDocumentType, findMissingItems, legalSignalDensity, type DetectedType } from './doctype.js';
import { extractKeyFacts, extractValueSummary } from './facts.js';
import { RULES, type Rule } from './rules.js';
import { normalizeDocument, segmentDocument, sentenceAround, splitSentences, truncate, wordCount, type Segment } from './text.js';

const RISK_ORDER: Readonly<Record<Risk, number>> = { high: 3, medium: 2, low: 1, info: 0 };
const POINTS: Readonly<Record<Risk, number>> = { high: 18, medium: 8, low: 2, info: 0 };
const MAX_PER_RULE = 2;

export interface PreparedDocument {
  text: string;
  segments: Segment[];
  sentences: string[];
  words: number;
}

/** Normalise once; every later stage reuses the same text and segments. */
export function prepareDocument(raw: string): PreparedDocument {
  const text = normalizeDocument(raw);
  return { text, segments: segmentDocument(text), sentences: splitSentences(text), words: wordCount(text) };
}

// ---------------------------------------------------------------------------
// Clause scanning
// ---------------------------------------------------------------------------

/** Run the rule library over the document. Most severe findings first. */
export function scanClauses(doc: PreparedDocument, context: Context = DEFAULT_CONTEXT): Clause[] {
  const found: Clause[] = [];

  for (const rule of RULES) {
    const hits: Clause[] = [];
    for (const segment of doc.segments) {
      const match = firstMatch(rule.patterns, segment.text);
      if (!match) continue;
      const quote = sentenceAround(segment.text, match.index);
      if (rule.exclude.some((pattern) => pattern.test(quote))) continue;
      const { risk, favoursYou, aggravator } = riskFor(rule, context.role, quote);
      hits.push(toClause({ rule, segment, quote, risk, favoursYou, aggravator, context }));
    }
    hits.sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk]);
    found.push(...hits.slice(0, MAX_PER_RULE));
  }

  return found.sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk]);
}

function firstMatch(patterns: readonly RegExp[], text: string): RegExpExecArray | null {
  let best: RegExpExecArray | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && (!best || match.index < best.index)) best = match;
  }
  return best;
}

interface ClauseInput {
  rule: Rule;
  segment: Segment;
  quote: string;
  risk: Risk;
  favoursYou: boolean;
  aggravator: string | null;
  context: Context;
}

function toClause({ rule, segment, quote, risk, favoursYou, aggravator, context }: ClauseInput): Clause {
  let explanation = rule.explain;
  if (favoursYou) explanation = `This term usually works in your favour as ${roleLabel(context.role).toLowerCase()}. ${explanation}`;
  if (aggravator) explanation += ` The wording (“${aggravator}”) makes it more one-sided.`;

  return {
    id: `${rule.id}-${segment.id}`,
    category: rule.id,
    title: rule.title,
    risk,
    quote,
    location: [segment.label, segment.heading].filter(Boolean).join(' – '),
    explanation,
    whyItMatters: rule.why,
    suggestion: rule.suggest,
    question: rule.question,
    value: extractValueSummary(quote),
    jurisdictionNote: rule.jurisdiction[context.jurisdiction] ?? '',
    source: 'rule',
    verified: true,
    related: [],
  };
}

// ---------------------------------------------------------------------------
// Risk score
// ---------------------------------------------------------------------------

/** Transparent, deterministic score: the AI never gets to change it. */
export function computeRisk(clauses: ReadonlyArray<Pick<Clause, 'risk'>>): RiskSummary {
  const counts: Record<Risk, number> = { high: 0, medium: 0, low: 0, info: 0 };
  let points = 0;
  for (const clause of clauses) {
    counts[clause.risk] += 1;
    points += POINTS[clause.risk];
  }
  // Soft-capped so the meter stays informative for very one-sided documents.
  const score = Math.round(100 * (1 - Math.exp(-points / 60)));
  // The level is rule-based (and documented in the README), not a threshold on
  // the score, so a single high-priority term is never rated "low".
  const level = counts.high >= 2 ? 'high' : counts.high === 1 || counts.medium >= 2 ? 'medium' : 'low';

  const parts: string[] = [];
  if (counts.high) parts.push(`${counts.high} high-priority`);
  if (counts.medium) parts.push(`${counts.medium} medium`);
  const rationale = parts.length
    ? `${parts.join(' and ')} term${counts.high + counts.medium === 1 ? '' : 's'} found.`
    : 'No high or medium-priority terms were detected.';

  return { level, score, counts, rationale };
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

const OBLIGATION = /\b(?:shall|must|agrees?\s+to|(?:is|are)\s+(?:required|obliged|obligated)\s+to|will\s+be\s+responsible\s+for|responsible\s+for)\b/i;
const BOTH = /\b(?:both\s+parties|each\s+party|either\s+party|the\s+parties)\b/i;
const ALL_NOUNS = [
  ...new Set(
    Object.values(PARTY_NOUNS)
      .filter((nouns) => nouns !== undefined)
      .flatMap((nouns) => [...nouns.you, ...nouns.other]),
  ),
].filter((noun) => !['you', 'we', 'us'].includes(noun));
const NOUN_PATTERN = new RegExp(`\\b(${ALL_NOUNS.join('|')})\\b`, 'i');

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export function extractObligations(doc: PreparedDocument, context: Context, limit = 8): Obligation[] {
  const roleNouns = PARTY_NOUNS[context.role];
  const items: Array<Obligation & { weight: number }> = [];

  for (const sentence of doc.sentences) {
    if (sentence.length < 25 || sentence.length > 420 || !OBLIGATION.test(sentence)) continue;
    const beforeVerb = sentence.slice(0, sentence.search(OBLIGATION));
    const noun = NOUN_PATTERN.exec(beforeVerb)?.[1]?.toLowerCase();
    const both = BOTH.test(beforeVerb);
    if (!noun && !both) continue;

    let party = both || !noun ? 'Both parties' : capitalize(noun);
    if (roleNouns && noun) {
      if (roleNouns.you.includes(noun)) party = 'You';
      else if (roleNouns.other.includes(noun)) party = 'Other party';
    }
    const when = /\b(?:day|week|month|year)s?\b/i.test(sentence) ? extractValueSummary(sentence) : '';
    items.push({ party, text: truncate(sentence, 240), when, weight: when ? 2 : 1 });
  }

  return items
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(({ party, text, when }) => ({ party, text, when }));
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const HEADLINES: Readonly<Record<RiskSummary['level'], string>> = {
  high: 'Several terms deserve careful attention',
  medium: 'Some terms are worth a closer look',
  low: 'Mostly standard, with few red flags',
};

/** Questions a lawyer would want answered, drawn from the findings. */
export function buildQuestions({
  clauses,
  missing,
  context,
  limit = 8,
}: {
  clauses: readonly Clause[];
  missing: readonly MissingItem[];
  context: Context;
  limit?: number;
}): string[] {
  const questions: string[] = [];
  const add = (question: string): void => {
    if (question && !questions.includes(question)) questions.push(question);
  };

  for (const clause of clauses.filter((c) => c.risk === 'high' || c.risk === 'medium')) add(clause.question);
  for (const { item } of missing.slice(0, 2)) add(`The document does not seem to cover: ${item.toLowerCase()}. Is that handled elsewhere?`);
  if (context.jurisdiction !== 'unspecified') {
    add(`Are any of these terms unenforceable or restricted under the law of ${jurisdictionLabel(context.jurisdiction)}?`);
  }
  add('Is there anything in this document that I should negotiate before I agree to it?');
  return questions.slice(0, limit);
}

/**
 * One sentence can trip several rules (e.g. a threat *and* an eviction term).
 * Show it once, keep the most severe finding, and list the others as related
 * so the same wording is neither repeated nor double-counted in the score.
 */
export function mergeSharedQuotes(clauses: readonly Clause[]): Clause[] {
  const byQuote = new Map<string, Clause>();
  for (const clause of clauses) {
    const existing = byQuote.get(clause.quote);
    if (existing) {
      if (!existing.related.includes(clause.title)) existing.related.push(clause.title);
    } else {
      byQuote.set(clause.quote, { ...clause, related: [...clause.related] });
    }
  }
  return [...byQuote.values()];
}

export interface AnalysisParts {
  doc: PreparedDocument;
  context: Context;
  type: DetectedType;
  keyFacts: KeyFact[];
  clauses: readonly Clause[];
  obligations: Obligation[];
  missing: MissingItem[];
  summary: Summary;
  questions?: string[];
  nextSteps?: NextStep[];
  mode: Mode;
  /** The language the prose is written in. English unless the AI translated it. */
  outputLanguage?: LanguageId;
}

/**
 * Assemble the canonical analysis. Both the offline engine and the AI merge
 * step call this so the shape (and the risk score) is always identical.
 */
export function buildAnalysis({
  doc,
  context,
  type,
  keyFacts,
  clauses: rawClauses,
  obligations,
  missing,
  summary,
  questions,
  nextSteps,
  mode,
  outputLanguage = 'en',
}: AnalysisParts): CoreAnalysis {
  const clauses = mergeSharedQuotes(rawClauses);
  const risk = computeRisk(clauses);
  const warnings: string[] = [];
  if (legalSignalDensity(doc.text) < 0.012 && type.id === 'other') {
    warnings.push('This text does not look much like a contract or legal notice, so results may be limited.');
  }
  if (doc.words < 60) warnings.push('The text is very short; the analysis may miss context.');

  return {
    mode,
    notice: null,
    context,
    outputLanguage,
    document: {
      type: type.id,
      typeLabel: type.label,
      confidence: type.confidence,
      wordCount: doc.words,
    },
    summary,
    keyFacts,
    risk,
    clauses,
    obligations,
    missing,
    questionsForLawyer: questions ?? buildQuestions({ clauses, missing, context }),
    nextSteps: nextSteps ?? buildNextSteps({ stage: context.stage, docType: type.id, risk, clauses }),
    resources: resourcesFor(context.jurisdiction),
    warnings,
    disclaimer: DISCLAIMER,
  };
}

/** Full offline analysis of a prepared document. */
export function analyzeOffline(doc: PreparedDocument, context: Context = DEFAULT_CONTEXT): CoreAnalysis {
  const type = detectDocumentType(doc.text);
  const clauses = mergeSharedQuotes(scanClauses(doc, context));
  const keyFacts = extractKeyFacts(doc.text);
  const missing = findMissingItems(doc.text, type.id);
  const obligations = extractObligations(doc, context);
  const risk = computeRisk(clauses);

  const summary = offlineSummary({ type, risk, keyFacts, clauses, missing, context });
  return buildAnalysis({ doc, context, type, keyFacts, clauses, obligations, missing, summary, mode: 'offline' });
}

function offlineSummary({
  type,
  risk,
  keyFacts,
  clauses,
  missing,
  context,
}: {
  type: DetectedType;
  risk: RiskSummary;
  keyFacts: readonly KeyFact[];
  clauses: readonly Clause[];
  missing: readonly MissingItem[];
  context: Context;
}): Summary {
  const plain: string[] = [];
  const perspective = context.role === 'general' ? '' : ` It is read from the point of view of: ${roleLabel(context.role).toLowerCase()}.`;
  plain.push(`This looks like a ${DOC_TYPES[type.id].label.toLowerCase()}.${perspective}`);

  // Amounts and time periods are the most useful at-a-glance details.
  const facts = keyFacts
    .filter((fact) => ['money', 'duration', 'percent'].includes(fact.kind))
    .slice(0, 5)
    .map((fact) => `${fact.label}: ${fact.value}`);
  if (facts.length) plain.push(`Key details found: ${facts.join('; ')}.`);

  const notable = clauses.filter((c) => c.risk === 'high' || c.risk === 'medium').slice(0, 4);
  if (notable.length) {
    plain.push(`Terms to look at first: ${notable.map((c) => c.title.toLowerCase()).join('; ')}.`);
  } else {
    plain.push('No clearly one-sided terms were detected by the pattern checks.');
  }
  if (missing.length) plain.push(`Not found in this text: ${missing.slice(0, 3).map((m) => m.item.toLowerCase()).join('; ')}.`);

  return { headline: `${DOC_TYPES[type.id].label}: ${HEADLINES[risk.level].toLowerCase()}`, plain };
}
