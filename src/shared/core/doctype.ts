/**
 * Document-type detection and the "what should be here but isn't" checklist.
 * Scoring is signal-word based; the title (first ~300 chars) counts triple.
 */

import type { DocTypeId, MissingItem } from '../types.js';

export interface ExpectedItem {
  item: string;
  pattern: RegExp;
  why: string;
}

export interface DocTypeDefinition {
  label: string;
  signals: readonly string[];
  expected: readonly ExpectedItem[];
}

export const DOC_TYPES: Record<DocTypeId, DocTypeDefinition> = {
  rental: {
    label: 'Rental / lease agreement',
    signals: ['tenant', 'landlord', 'lessor', 'lessee', 'lease', 'rent', 'premises', 'security deposit', 'tenancy', 'licensor', 'licensee', 'caution money'],
    expected: [
      { item: 'Refund timeline for the security deposit', pattern: /\b(?:deposit|caution)\b[^\n]{0,240}\b(?:refund\w*|return\w*)\b[^\n]{0,120}\bwithin\s+\S+\s*(?:\(\d+\)\s*)?(?:days?|weeks?|months?)/i, why: 'Without a stated deadline it is easy for a deposit to be delayed or disputed.' },
      { item: 'Who is responsible for repairs and maintenance', pattern: /\b(?:repairs?|maintenance)\b/i, why: 'Unclear responsibility is a common source of disputes and unexpected bills.' },
      { item: 'Notice period to end the tenancy', pattern: /\bnotice\b/i, why: 'You need to know how much warning either side must give.' },
      { item: 'Rules on rent increases', pattern: /\b(?:increase|escalat\w+|revis\w+|enhanc\w+)\b/i, why: 'If nothing is stated, the amount can be disputed at renewal.' },
    ],
  },
  employment: {
    label: 'Employment / job offer',
    signals: ['employee', 'employer', 'employment', 'salary', 'probation', 'designation', 'ctc', 'notice period', 'appointment', 'remuneration', 'leave', 'gratuity', 'joining'],
    expected: [
      { item: 'Notice period and how either side can end employment', pattern: /\bnotice\b/i, why: 'It decides how quickly you can leave and how quickly you can be let go.' },
      { item: 'Salary / pay structure and payment date', pattern: /\b(?:salary|ctc|remuneration|compensation|wages?)\b/i, why: 'You should be able to see exactly what you will be paid and when.' },
      { item: 'Leave, working hours or overtime rules', pattern: /\b(?:leave|working\s+hours|overtime|holidays?)\b/i, why: 'These are basic conditions of the job and should not be left to unwritten practice.' },
      { item: 'Confidentiality terms', pattern: /\bconfidential/i, why: 'Most jobs include one; check how far it extends.' },
    ],
  },
  services: {
    label: 'Freelance / services agreement',
    signals: ['independent contractor', 'freelancer', 'consultant', 'services agreement', 'statement of work', 'deliverables', 'scope of work', 'client', 'milestone', 'invoice', 'services'],
    expected: [
      { item: 'Clear scope of work and deliverables', pattern: /\b(?:scope\s+of\s+work|deliverables?|statement\s+of\s+work|services\s+to\s+be)\b/i, why: 'Vague scope leads to unpaid extra work (“scope creep”).' },
      { item: 'Payment schedule and due dates', pattern: /\b(?:payment|invoice|milestone|fees?)\b[^.]{0,120}\b(?:within|due|schedule|upon|per)\b/i, why: 'Late or conditional payment is the most common freelancer complaint.' },
      { item: 'Who owns the work product', pattern: /\b(?:intellectual\s+property|ownership|copyright|work\s+product|assign\w*)\b/i, why: 'Ownership decides what you may reuse and what the client may resell.' },
      { item: 'How the agreement can be ended and what is paid then', pattern: /\bterminat\w+/i, why: 'You need to know what you are paid for work done if the client cancels.' },
      { item: 'Number of revisions / change process', pattern: /\b(?:revisions?|change\s+(?:request|order)s?|amendments?)\b/i, why: 'Without limits, a client can ask for endless changes.' },
    ],
  },
  nda: {
    label: 'Non-disclosure agreement (NDA)',
    signals: ['non-disclosure', 'confidential information', 'disclosing party', 'receiving party', 'nda', 'confidentiality'],
    expected: [
      { item: 'How long the confidentiality lasts', pattern: /\b(?:period|years?|term|surviv\w+|perpetu\w+)\b/i, why: 'Endless duties are hard to comply with; a time limit is normal.' },
      { item: 'Exclusions (already public, independently developed, legally required)', pattern: /\b(?:public\s+domain|already\s+known|independently\s+developed|required\s+by\s+law)\b/i, why: 'Standard carve-outs protect you from breaching by accident.' },
    ],
  },
  terms: {
    label: 'Terms of service / privacy policy',
    signals: ['terms of service', 'terms of use', 'privacy policy', 'our services', 'user', 'account', 'cookies', 'personal data', 'personal information', 'subscription', 'platform'],
    expected: [
      { item: 'How to cancel or close your account', pattern: /\b(?:cancel\w*|delete\s+your\s+account|close\s+your\s+account|terminate\s+your)\b/i, why: 'If cancelling is hard or unstated, you can be charged for longer than you want.' },
      { item: 'How to request deletion or access to your data', pattern: /\b(?:delete|erasure|access|request)\b[^.]{0,80}\b(?:data|information)\b/i, why: 'You should know how to see and remove the information held about you.' },
      { item: 'Refund policy', pattern: /\brefund\w*/i, why: 'Without one you may have no route to money back.' },
    ],
  },
  loan: {
    label: 'Loan / credit agreement',
    signals: ['loan', 'borrower', 'lender', 'principal', 'interest rate', 'emi', 'repayment', 'prepayment', 'guarantor', 'instalment', 'installment', 'sanction'],
    expected: [
      { item: 'Total cost of credit / repayment schedule', pattern: /\b(?:repayment\s+schedule|amortization|emi|instal?lments?|total\s+(?:cost|amount)\s+payable)\b/i, why: 'You should be able to see what you will pay in total, not just the monthly figure.' },
      { item: 'Interest rate and how it is calculated', pattern: /\binterest\b/i, why: 'The rate and method (fixed/floating, reducing/flat) change the cost dramatically.' },
      { item: 'Conditions and charges for early repayment', pattern: /\b(?:pre-?payment|foreclos\w+|pre-?clos\w+)\b/i, why: 'Hidden early-repayment fees make it costly to refinance.' },
    ],
  },
  notice: {
    label: 'Legal notice / demand / summons',
    signals: ['legal notice', 'hereby notified', 'demand notice', 'failing which', 'show cause', 'summons', 'eviction notice', 'cease and desist', 'you are hereby', 'advocate', 'court', 'notice is hereby given'],
    expected: [
      { item: 'A clear deadline to respond', pattern: /\bwithin\s+\S+\s*(?:\(\d+\)\s*)?(?:days?|hours?)\b|\bon\s+or\s+before\b|\bby\s+\d/i, why: 'You need to know exactly when you must respond.' },
      { item: 'Who is sending it and their contact details', pattern: /\b(?:advocate|solicitor|attorney|counsel|on\s+behalf\s+of|address)\b/i, why: 'You need a way to respond and to check the notice is genuine.' },
    ],
  },
  partnership: {
    label: 'Partnership / shareholder agreement',
    signals: ['partnership', 'partners', 'profit sharing', 'shareholder', 'capital contribution', 'equity', 'founders', 'vesting'],
    expected: [
      { item: 'How profits, losses and decisions are shared', pattern: /\b(?:profits?|losses|voting|decisions?)\b/i, why: 'These are the core of the arrangement and the usual cause of disputes.' },
      { item: 'How a partner can exit and how their share is valued', pattern: /\b(?:exit|withdraw\w*|retire\w*|valuation|buy-?out)\b/i, why: 'Without an exit route, disagreements can trap everyone.' },
    ],
  },
  other: {
    label: 'Legal document',
    signals: [],
    expected: [
      { item: 'How the agreement can be ended', pattern: /\bterminat\w+|\bcancel\w+/i, why: 'Every ongoing agreement should say how it ends.' },
      { item: 'How disputes are resolved', pattern: /\b(?:dispute|jurisdiction|governing\s+law|arbitrat\w+|courts?)\b/i, why: 'Knowing where and how disagreements are handled avoids surprises.' },
    ],
  },
};

/** A matching document title is far stronger evidence than body vocabulary. */
const TITLE_SIGNALS: Partial<Record<DocTypeId, RegExp>> = {
  notice: /legal\s+notice|demand\s+notice|notice\s+of\s+(?:default|eviction|termination|demand)|eviction\s+notice|summons|show[- ]cause|cease\s+and\s+desist/i,
  rental: /rental\s+agreement|lease\s+(?:agreement|deed)|leave\s+and\s+licen[cs]e|tenancy\s+agreement|rent\s+agreement/i,
  employment: /offer\s+letter|employment\s+(?:agreement|contract)|appointment\s+letter|letter\s+of\s+appointment/i,
  services: /services\s+agreement|consult(?:ing|ancy)\s+agreement|contractor\s+agreement|freelance\s+agreement|statement\s+of\s+work/i,
  nda: /non[- ]disclosure|confidentiality\s+agreement/i,
  terms: /terms\s+(?:of\s+(?:service|use)|and\s+conditions)|privacy\s+policy/i,
  loan: /loan\s+agreement|credit\s+agreement|promissory\s+note/i,
  partnership: /partnership\s+(?:deed|agreement)|shareholders?['’]?\s+agreement/i,
};
const TITLE_BONUS = 8;

const GENERIC_LEGAL_SIGNALS =
  /\b(?:agreement|contract|hereby|hereinafter|party|parties|shall|whereas|covenant|liab\w+|indemnif\w+|terminat\w+|governing\s+law|jurisdiction|clause|witness(?:eth)?|terms\s+and\s+conditions|obligations?|breach|notice|consent)\b/gi;

/** Does this text look like a legal document at all? */
export function legalSignalDensity(text: string): number {
  const words = (text.match(/\S+/g) ?? []).length || 1;
  const hits = (text.match(GENERIC_LEGAL_SIGNALS) ?? []).length;
  return hits / words;
}

export interface DetectedType {
  id: DocTypeId;
  label: string;
  confidence: number;
}

export function detectDocumentType(text: string): DetectedType {
  const lower = text.toLowerCase();
  const head = lower.slice(0, 300);
  const scores: Array<{ id: DocTypeId; score: number }> = [];

  for (const [id, definition] of Object.entries(DOC_TYPES) as Array<[DocTypeId, DocTypeDefinition]>) {
    if (!definition.signals.length) continue;
    let score = TITLE_SIGNALS[id]?.test(head) ? TITLE_BONUS : 0;
    for (const signal of definition.signals) {
      const occurrences = countOccurrences(lower, signal);
      if (occurrences) score += 1 + Math.min(occurrences, 5) * 0.4;
      if (head.includes(signal)) score += 3;
    }
    scores.push({ id, score });
  }

  scores.sort((a, b) => b.score - a.score);
  const [top, second] = scores;
  if (!top || top.score < 3) return { id: 'other', label: DOC_TYPES.other.label, confidence: 0.2 };
  // (scores are only built for typed entries, so the id is always a DocTypeId)

  const confidence = Math.min(0.95, top.score / (top.score + (second?.score ?? 0) * 0.8 + 2));
  return { id: top.id, label: DOC_TYPES[top.id].label, confidence: Math.round(confidence * 100) / 100 };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < 6) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Expected-but-absent items for a document type. */
export function findMissingItems(text: string, typeId: DocTypeId): MissingItem[] {
  const definition = DOC_TYPES[typeId] ?? DOC_TYPES.other;
  return definition.expected
    .filter(({ pattern }) => !pattern.test(text))
    .map(({ item, why }) => ({ item, why }));
}
