/**
 * The trust boundary between the model and the rest of the app.
 *
 * Everything the AI returns is treated as untrusted input: strings are
 * cleaned and length-capped, enums are coerced, and every quoted excerpt must
 * be found in the user's document (or repaired to the closest real sentence)
 * or the finding is dropped. Findings from the deterministic rule engine are
 * merged in so the model can refine them but never silently remove a
 * high-priority one.
 */

import type { PreparedDocument } from '../../shared/core/analyze.js';
import { DOC_TYPES, type DetectedType } from '../../shared/core/doctype.js';
import { RULES_BY_ID } from '../../shared/core/rules.js';
import { foldForMatch, locateQuote, tokenize, truncate } from '../../shared/core/text.js';
import { RISK_LEVELS, type Context, type Risk } from '../../shared/options.js';
import type {
  Citation,
  Clause,
  CompareRow,
  CompareSide,
  Confidence,
  CoreAnalysis,
  Difference,
  DocTypeId,
  Grounding,
  KeyFact,
  MissingItem,
  NextStep,
  Obligation,
  Side,
  StepWhen,
  Summary,
  Verdict,
} from '../../shared/types.js';

type Json = Record<string, unknown>;

const RISK_ORDER: Readonly<Record<Risk, number>> = { high: 3, medium: 2, low: 1, info: 0 };
// Model output is untrusted: control characters are stripped on purpose.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const PARTY_LABELS: Readonly<Record<string, string>> = { you: 'You', other: 'Other party', both: 'Both parties' };
const WHEN_VALUES: readonly StepWhen[] = ['now', 'soon', 'before_signing', 'later'];
const DOC_TYPE_IDS = Object.keys(DOC_TYPES) as DocTypeId[];

/** Collapse whitespace, strip control characters, cap the length. */
export const clean = (value: unknown, max = 600): string =>
  typeof value === 'string' ? value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

const asRecord = (value: unknown): Json => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);
const coerceRisk = (value: unknown): Risk => ((RISK_LEVELS as readonly unknown[]).includes(value) ? (value as Risk) : 'info');
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => ((allowed as readonly unknown[]).includes(value) ? (value as T) : fallback);

function jaccard(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function overlaps(a: string, b: string): boolean {
  const [x, y] = [foldForMatch(a), foldForMatch(b)];
  return x.includes(y) || y.includes(x) || jaccard(a, b) >= 0.5;
}

/** Digits must all appear in the document; words must appear verbatim. */
function factSupported(value: string, foldedText: string): boolean {
  const digits = value.match(/\d+/g);
  if (digits) return digits.every((group) => foldedText.includes(group));
  return foldedText.includes(foldForMatch(value));
}

const uniqueBy = <T>(items: readonly T[], keyOf: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface MergeAnalysisInput {
  /** Parsed model output (already un-redacted). */
  ai: Json;
  doc: PreparedDocument;
  context: Context;
  ruleClauses: readonly Clause[];
  /** The full offline analysis: source of fallback values. */
  offline: CoreAnalysis;
}

export interface MergedAnalysis {
  type: DetectedType;
  keyFacts: KeyFact[];
  clauses: Clause[];
  obligations: Obligation[];
  missing: MissingItem[];
  summary: Summary;
  questions: string[];
  nextSteps: NextStep[];
  grounding: Grounding;
}

export function mergeAnalysis({ ai, doc, context, ruleClauses, offline }: MergeAnalysisInput): MergedAnalysis {
  const grounding: Grounding = { checked: 0, verified: 0, dropped: 0 };
  const foldedSegments = doc.segments.map((segment) => foldForMatch(segment.text));
  const foldedText = foldForMatch(doc.text);
  const dismissed = new Set(list(ai['dismissedHintIds'], 60).map((id) => clean(id, 80)));
  const hintById = new Map(ruleClauses.map((clause) => [clause.id, clause]));

  const locate = (quote: string): string => {
    const folded = foldForMatch(quote);
    const segment = doc.segments[foldedSegments.findIndex((text) => text.includes(folded))];
    return segment ? [segment.label, segment.heading].filter(Boolean).join(' – ') : '';
  };

  // 1. AI clauses, grounded in the document
  const clauses: Clause[] = [];
  for (const item of list(ai['clauses'], 40)) {
    const raw = asRecord(item);
    grounding.checked += 1;
    const located = locateQuote(doc.text, clean(raw['quote'], 700), doc.sentences);
    if (!located.verified) {
      grounding.dropped += 1;
      continue;
    }
    grounding.verified += 1;
    if (clauses.some((existing) => foldForMatch(existing.quote) === foldForMatch(located.quote))) continue;

    const hint = hintById.get(clean(raw['hintId'], 80));
    const requested = clean(raw['category'], 60);
    const category = RULES_BY_ID.has(requested) ? requested : (hint?.category ?? 'other');
    let risk = coerceRisk(raw['risk']);
    if (hint?.risk === 'high') risk = 'high'; // never downplay a rule-detected high-priority term

    clauses.push({
      id: `ai-${clauses.length}`,
      category,
      title: clean(raw['title'], 120) || hint?.title || 'Term to review',
      risk,
      quote: truncate(located.quote, 420),
      location: locate(located.quote),
      explanation: clean(raw['explanation'], 700),
      whyItMatters: clean(raw['whyItMatters'], 500),
      suggestion: clean(raw['suggestion'], 500),
      question: hint?.question ?? '',
      value: hint?.value ?? '',
      jurisdictionNote: RULES_BY_ID.get(category)?.jurisdiction[context.jurisdiction] ?? '',
      source: 'ai',
      verified: true,
      repaired: located.repaired,
      related: [],
      hintId: hint?.id ?? '',
    });
  }

  // 2. Reconcile with rule findings
  for (const rule of ruleClauses) {
    const match = clauses.find((clause) => clause.hintId === rule.id || (clause.category === rule.category && overlaps(clause.quote, rule.quote)));
    if (match) {
      if (rule.risk === 'high') match.risk = 'high';
      match.hintId ||= rule.id;
      match.value ||= rule.value;
      match.question ||= rule.question;
      match.jurisdictionNote ||= rule.jurisdictionNote;
    } else if (!dismissed.has(rule.id) || rule.risk === 'high') {
      clauses.push({ ...rule, related: [...rule.related] });
    }
  }
  clauses.sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk]);

  // 3. Facts the model reports must be present in the document
  const aiFacts: KeyFact[] = list(ai['keyFacts'], 16)
    .map((item) => {
      const fact = asRecord(item);
      return { label: clean(fact['label'], 60), value: clean(fact['value'], 140), kind: 'ai' as const };
    })
    .filter((fact) => fact.label && fact.value && factSupported(fact.value, foldedText));
  const keyFacts = uniqueBy([...aiFacts, ...offline.keyFacts], (fact) => foldForMatch(fact.value)).slice(0, 16);

  // 4. Remaining sections, each falling back to the offline result
  const obligations: Obligation[] = list(ai['obligations'], 10)
    .map((item) => {
      const obligation = asRecord(item);
      return {
        party: PARTY_LABELS[String(obligation['party'])] ?? 'Other party',
        text: clean(obligation['text'], 320),
        when: clean(obligation['when'], 80),
      };
    })
    .filter((item) => item.text);

  const extraMissing: MissingItem[] = list(ai['missing'], 4)
    .map((item) => {
      const entry = asRecord(item);
      return { item: clean(entry['item'], 200), why: clean(entry['why'], 300) };
    })
    .filter((entry) => entry.item && !offline.missing.some((known) => jaccard(known.item, entry.item) >= 0.5));

  const aiQuestions = list(ai['questionsForLawyer'], 10).map((question) => clean(question, 300)).filter(Boolean);
  const questions = aiQuestions.length >= 3 ? aiQuestions.slice(0, 8) : uniqueBy([...aiQuestions, ...offline.questionsForLawyer], (q) => q).slice(0, 8);

  const aiSteps: NextStep[] = list(ai['nextSteps'], 6)
    .map((item) => {
      const step = asRecord(item);
      return { step: clean(step['step'], 300), when: pick(step['when'], WHEN_VALUES, 'soon') };
    })
    .filter((item) => item.step);

  const aiTypeId = pick(ai['documentType'], DOC_TYPE_IDS, offline.document.type);
  const type: DetectedType = {
    id: aiTypeId,
    label: clean(ai['documentTypeLabel'], 80) || DOC_TYPES[aiTypeId].label,
    confidence: aiTypeId === offline.document.type ? Math.max(offline.document.confidence, 0.9) : 0.7,
  };

  const points = list(ai['summaryPoints'], 6).map((point) => clean(point, 400)).filter(Boolean);
  const headline = clean(ai['headline'], 220);

  return {
    type,
    keyFacts,
    clauses,
    obligations: obligations.length ? obligations : offline.obligations,
    missing: [...offline.missing, ...extraMissing].slice(0, 6),
    summary: headline && points.length ? { headline, plain: points } : offline.summary,
    questions,
    nextSteps: aiSteps.length >= 3 ? aiSteps : offline.nextSteps,
    grounding,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface MergedComparison {
  rows: CompareRow[];
  verdict: Verdict;
  inconsistencies: string[];
  questionsForLawyer: string[];
  grounding: Grounding;
}

/** Returns null when the model produced nothing usable. */
export function mergeComparison({ ai, docA, docB }: { ai: Json; docA: PreparedDocument; docB: PreparedDocument }): MergedComparison | null {
  const grounding: Grounding = { checked: 0, verified: 0, dropped: 0 };

  const sideOf = (summary: unknown, quote: unknown, risk: unknown, doc: PreparedDocument): CompareSide => {
    const present = risk !== 'absent';
    let verifiedQuote = '';
    if (present && clean(quote, 700)) {
      grounding.checked += 1;
      const located = locateQuote(doc.text, clean(quote, 700), doc.sentences);
      if (located.verified) {
        grounding.verified += 1;
        verifiedQuote = truncate(located.quote, 420);
      } else grounding.dropped += 1;
    }
    return { present, risk: present ? coerceRisk(risk) : null, quote: verifiedQuote, value: clean(summary, 300), location: '' };
  };

  const rows: CompareRow[] = list(ai['rows'], 20)
    .map((item): CompareRow => {
      const row = asRecord(item);
      return {
        category: 'ai',
        title: clean(row['topic'], 100),
        a: sideOf(row['aSummary'], row['aQuote'], row['aRisk'], docA),
        b: sideOf(row['bSummary'], row['bQuote'], row['bRisk'], docB),
        difference: pick<Difference>(row['difference'], ['same', 'differs', 'only_a', 'only_b'], 'differs'),
        better: pick<Side | 'neither'>(row['better'], ['a', 'b', 'neither'], 'neither'),
        comment: clean(row['comment'], 400),
      };
    })
    .filter((row) => row.title);
  if (!rows.length) return null;

  const verdict = asRecord(ai['verdict']);
  return {
    rows,
    verdict: {
      favors: pick<Side | 'neither'>(verdict['favors'], ['a', 'b', 'neither'], 'neither'),
      headline: clean(verdict['headline'], 300),
      reasons: list(verdict['reasons'], 5).map((reason) => clean(reason, 400)).filter(Boolean),
    },
    inconsistencies: list(ai['inconsistencies'], 8).map((entry) => clean(entry, 400)).filter(Boolean),
    questionsForLawyer: list(ai['questionsForLawyer'], 8).map((entry) => clean(entry, 300)).filter(Boolean),
    grounding,
  };
}

// ---------------------------------------------------------------------------
// Question answering
// ---------------------------------------------------------------------------

export interface NormalizedAnswer {
  answer: string;
  confidence: Confidence;
  citations: Citation[];
  caveats: string[];
  followUps: string[];
}

export function normalizeAnswer({ ai, doc }: { ai: Json; doc: PreparedDocument }): NormalizedAnswer {
  const citations: Citation[] = [];
  let dropped = 0;
  for (const item of list(ai['citations'], 4)) {
    const located = locateQuote(doc.text, clean(asRecord(item)['quote'], 700), doc.sentences);
    if (located.verified) {
      const quote = truncate(located.quote, 420);
      if (!citations.some((existing) => existing.quote === quote)) citations.push({ quote, verified: true, location: '' });
    } else dropped += 1;
  }

  const caveats = list(ai['caveats'], 5).map((item) => clean(item, 300)).filter(Boolean);
  let confidence = pick<Confidence>(ai['confidence'], ['high', 'medium', 'low', 'not_found'], 'low');

  // An answer with no verifiable support is downgraded rather than trusted.
  if (confidence !== 'not_found' && citations.length === 0) {
    confidence = 'low';
    caveats.unshift('No supporting quote could be verified in your document, so treat this answer with caution.');
  } else if (dropped > 0) {
    caveats.push(`${dropped} quoted excerpt${dropped === 1 ? '' : 's'} could not be found in your document and ${dropped === 1 ? 'was' : 'were'} removed.`);
  }

  return {
    answer: clean(ai['answer'], 1800) || 'The AI did not return an answer.',
    confidence,
    citations,
    caveats,
    followUps: list(ai['followUps'], 3).map((item) => clean(item, 200)).filter(Boolean),
  };
}
