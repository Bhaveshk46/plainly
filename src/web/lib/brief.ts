/**
 * Lawyer-brief builder. Pure functions (no DOM) so the same brief can be
 * previewed, copied as Markdown, downloaded, printed, encrypted for sharing -
 * and unit-tested.
 */

import type { LanguageId, Risk } from '../../shared/options.js';
import type { Analysis } from '../../shared/types.js';

export const PRIORITY_LABELS: Readonly<Record<Risk, string>> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
  info: 'For information',
};

const KEY_TERM_LIMIT = 10;
const RISK_RANK: Readonly<Record<Risk, number>> = { high: 3, medium: 2, low: 1, info: 0 };

export interface BriefTerm {
  title: string;
  risk: Risk;
  location: string;
  quote: string;
  whyItMatters: string;
}

export interface Brief {
  title: string;
  generated: string;
  situation: { role: string; stage: string; jurisdiction: string };
  documentType: string;
  riskLevel: 'high' | 'medium' | 'low';
  riskRationale: string;
  summary: string[];
  keyFacts: Array<{ label: string; value: string }>;
  keyTerms: BriefTerm[];
  missing: string[];
  questions: string[];
  nextSteps: string[];
  notes: string;
  preparedBy: string;
  disclaimer: string;
  language: LanguageId;
}

export interface BriefInput {
  analysis: Analysis;
  docLabel: string;
  notes?: string;
  labels: { role: string; stage: string; jurisdiction: string };
  now?: Date;
}

export function buildBrief({ analysis, docLabel, notes = '', labels, now = new Date() }: BriefInput): Brief {
  const keyTerms = analysis.clauses
    .filter((clause) => clause.risk === 'high' || clause.risk === 'medium')
    .sort((a, b) => RISK_RANK[b.risk] - RISK_RANK[a.risk])
    .slice(0, KEY_TERM_LIMIT)
    .map((clause) => ({
      title: clause.title,
      risk: clause.risk,
      location: clause.location,
      quote: clause.quote,
      whyItMatters: clause.whyItMatters || clause.explanation,
    }));

  return {
    title: `Lawyer brief: ${docLabel || analysis.document.typeLabel}`,
    generated: now.toISOString().slice(0, 10),
    situation: labels,
    documentType: analysis.document.typeLabel,
    riskLevel: analysis.risk.level,
    riskRationale: analysis.risk.rationale,
    summary: analysis.summary.plain,
    keyFacts: analysis.keyFacts.map(({ label, value }) => ({ label, value })),
    keyTerms,
    missing: analysis.missing.map(({ item }) => item),
    questions: analysis.questionsForLawyer,
    nextSteps: analysis.nextSteps.map(({ step }) => step),
    notes: notes.trim(),
    preparedBy: analysis.mode === 'ai' ? 'AI-assisted analysis (Gemini) with rule-based checks' : 'Rule-based analysis',
    disclaimer: analysis.disclaimer,
    language: analysis.outputLanguage,
  };
}

const bullets = (items: readonly string[]): string => items.map((item) => `- ${item}`).join('\n');
const quoted = (text: string): string =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

/** Plain Markdown that pastes cleanly into email, Docs or Notes. */
export function briefToMarkdown(brief: Brief): string {
  const out: string[] = [];
  out.push(`# ${brief.title}`, `Prepared ${brief.generated} · ${brief.preparedBy}`);
  out.push(
    '## My situation',
    bullets([
      `Role: ${brief.situation.role}`,
      `Stage: ${brief.situation.stage}`,
      `Where it applies: ${brief.situation.jurisdiction}`,
      `Document type: ${brief.documentType}`,
      `Overall assessment: ${brief.riskLevel} risk. ${brief.riskRationale}`,
    ]),
  );

  if (brief.notes) out.push('## My notes', brief.notes);
  if (brief.summary.length) out.push('## Summary', bullets(brief.summary));
  if (brief.keyFacts.length) out.push('## Key details', bullets(brief.keyFacts.map((fact) => `${fact.label}: ${fact.value}`)));

  if (brief.keyTerms.length) {
    out.push('## Terms I would like reviewed');
    for (const term of brief.keyTerms) {
      const where = term.location ? ` (${term.location})` : '';
      out.push(`### ${term.title}${where} - ${PRIORITY_LABELS[term.risk]}`, quoted(term.quote), `Why it matters: ${term.whyItMatters}`);
    }
  }

  if (brief.missing.length) out.push('## Not found in the document', bullets(brief.missing));
  if (brief.questions.length) out.push('## Questions for you', brief.questions.map((question, index) => `${index + 1}. ${question}`).join('\n'));
  if (brief.nextSteps.length) out.push('## What I plan to do next', bullets(brief.nextSteps));
  out.push('---', `_${brief.disclaimer}_`);

  return `${out.join('\n\n')}\n`;
}

export const briefFilename = (brief: Pick<Brief, 'title' | 'generated'>): string =>
  `${
    brief.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'lawyer-brief'
  }-${brief.generated}.md`;

/** What gets encrypted and shared. Versioned so old links keep working. */
export interface SharePayload {
  version: 1;
  brief: Brief;
}
