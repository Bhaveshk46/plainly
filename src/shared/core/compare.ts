/**
 * Deterministic comparison of two documents: aligned clause categories, key
 * figures side by side, an overall "more favourable to you" verdict, and a
 * paragraph-level change list. The AI layer can enrich this but never replaces
 * the verdict inputs (risk scores) computed here.
 */

import { DEFAULT_CONTEXT, DISCLAIMER, type Context, type Risk } from '../options.js';
import type { Clause, CompareRow, CompareSide, CoreComparison, FactComparison, KeyFact, RiskSummary, Verdict } from '../types.js';
import { computeRisk, scanClauses, type PreparedDocument } from './analyze.js';
import { diffSegments } from './diff.js';
import { detectDocumentType } from './doctype.js';
import { extractKeyFacts } from './facts.js';

const RISK_ORDER: Readonly<Record<Risk, number>> = { high: 3, medium: 2, low: 1, info: 0 };
const SCORE_MARGIN = 8;
const TALLY_MARGIN = 3;

export interface Labels {
  a: string;
  b: string;
}

/** Highest-risk clause per category. */
function bestByCategory(clauses: readonly Clause[]): Map<string, Clause> {
  const best = new Map<string, Clause>();
  for (const clause of clauses) {
    const current = best.get(clause.category);
    if (!current || RISK_ORDER[clause.risk] > RISK_ORDER[current.risk]) best.set(clause.category, clause);
  }
  return best;
}

const side = (clause: Clause | undefined): CompareSide =>
  clause
    ? { present: true, risk: clause.risk, quote: clause.quote, value: clause.value, location: clause.location }
    : { present: false, risk: null, quote: '', value: '', location: '' };

function buildRow(category: string, a: Clause | undefined, b: Clause | undefined, labels: Labels): CompareRow {
  const title = (a ?? b)?.title ?? category;
  const row: CompareRow = { category, title, a: side(a), b: side(b), difference: 'same', better: 'neither', comment: '' };

  if (a && !b) {
    row.difference = 'only_a';
    if (RISK_ORDER[a.risk] >= RISK_ORDER.medium) {
      row.better = 'b';
      row.comment = `Only ${labels.a} has this term (${a.risk} priority).`;
    } else row.comment = `Only ${labels.a} mentions this.`;
  } else if (b && !a) {
    row.difference = 'only_b';
    if (RISK_ORDER[b.risk] >= RISK_ORDER.medium) {
      row.better = 'a';
      row.comment = `Only ${labels.b} has this term (${b.risk} priority).`;
    } else row.comment = `Only ${labels.b} mentions this.`;
  } else if (a && b) {
    const riskGap = RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
    const valuesDiffer = Boolean(a.value && b.value && a.value !== b.value);
    if (riskGap !== 0 || valuesDiffer) {
      row.difference = 'differs';
      if (riskGap !== 0) row.better = riskGap > 0 ? 'b' : 'a';
      row.comment = valuesDiffer
        ? `${labels.a}: ${a.value} vs ${labels.b}: ${b.value}.`
        : `The wording is riskier in ${riskGap > 0 ? labels.a : labels.b}.`;
    }
  }
  return row;
}

function compareFacts(factsA: readonly KeyFact[], factsB: readonly KeyFact[]): FactComparison[] {
  const wanted = ['money', 'duration', 'percent'];
  const group = (facts: readonly KeyFact[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const fact of facts.filter((f) => wanted.includes(f.kind))) {
      map.set(fact.label, [...(map.get(fact.label) ?? []), fact.value]);
    }
    return map;
  };
  const a = group(factsA);
  const b = group(factsB);
  return [...new Set([...a.keys(), ...b.keys()])]
    .map((label) => {
      const left = a.get(label)?.join(', ') ?? '';
      const right = b.get(label)?.join(', ') ?? '';
      return { label, a: left, b: right, differs: left !== right };
    })
    .sort((x, y) => Number(y.differs) - Number(x.differs));
}

/** Compare two prepared documents from the reader's point of view. */
export function compareOffline(
  docA: PreparedDocument,
  docB: PreparedDocument,
  context: Context = DEFAULT_CONTEXT,
  labels: Labels = { a: 'Document A', b: 'Document B' },
): CoreComparison {
  const clausesA = scanClauses(docA, context);
  const clausesB = scanClauses(docB, context);
  const riskA = computeRisk(clausesA);
  const riskB = computeRisk(clausesB);
  const typeA = detectDocumentType(docA.text);
  const typeB = detectDocumentType(docB.text);

  const bestA = bestByCategory(clausesA);
  const bestB = bestByCategory(clausesB);
  const categories = [...new Set([...bestA.keys(), ...bestB.keys()])];

  const weight = (row: CompareRow): number => (row.difference === 'same' ? 0 : 10) + Math.max(RISK_ORDER[row.a.risk ?? 'info'], RISK_ORDER[row.b.risk ?? 'info']);
  const rows = categories.map((category) => buildRow(category, bestA.get(category), bestB.get(category), labels)).sort((x, y) => weight(y) - weight(x));

  const warnings: string[] = [];
  if (typeA.id !== typeB.id && typeA.id !== 'other' && typeB.id !== 'other') {
    warnings.push(`These look like different kinds of documents (${typeA.label} vs ${typeB.label}), so the comparison may be less meaningful.`);
  }

  return {
    mode: 'offline',
    notice: null,
    context,
    outputLanguage: 'en',
    labels,
    documents: {
      a: { typeLabel: typeA.label, wordCount: docA.words, risk: riskA },
      b: { typeLabel: typeB.label, wordCount: docB.words, risk: riskB },
    },
    verdict: buildVerdict({ riskA, riskB, rows, labels }),
    facts: compareFacts(extractKeyFacts(docA.text, 40), extractKeyFacts(docB.text, 40)),
    rows,
    changes: diffSegments(docA.segments, docB.segments),
    inconsistencies: [],
    questionsForLawyer: buildCompareQuestions(rows, labels),
    warnings,
    disclaimer: DISCLAIMER,
  };
}

export function buildVerdict({ riskA, riskB, rows, labels }: { riskA: RiskSummary; riskB: RiskSummary; rows: readonly CompareRow[]; labels: Labels }): Verdict {
  // Row evidence first: each row favouring a side counts by how risky the worse side's term is.
  const weight = (row: CompareRow): number => Math.max(RISK_ORDER[row.a.risk ?? 'info'], RISK_ORDER[row.b.risk ?? 'info']);
  const tally = rows.reduce((sum, row) => sum + (row.better === 'a' ? weight(row) : row.better === 'b' ? -weight(row) : 0), 0);
  const gap = riskA.score - riskB.score;

  let favors: Verdict['favors'] = 'neither';
  if (Math.abs(tally) >= TALLY_MARGIN) favors = tally > 0 ? 'a' : 'b';
  else if (Math.abs(gap) >= SCORE_MARGIN) favors = gap > 0 ? 'b' : 'a';

  const reasons = rows
    .filter((row) => row.better !== 'neither')
    .slice(0, 4)
    .map((row) => `${row.title}: ${row.comment}`);

  const headline =
    favors === 'neither'
      ? 'The two documents carry a similar level of risk for you.'
      : `${favors === 'a' ? labels.a : labels.b} looks more favourable to you.`;

  return { favors, headline, reasons };
}

function buildCompareQuestions(rows: readonly CompareRow[], labels: Labels): string[] {
  const questions = rows
    .filter((row) => row.difference !== 'same')
    .slice(0, 5)
    .map((row) => `Why does ${row.title.toLowerCase()} differ between ${labels.a} and ${labels.b}, and can it be aligned in my favour?`);
  questions.push('Which of these documents better protects me, and what would you negotiate first?');
  return questions;
}
