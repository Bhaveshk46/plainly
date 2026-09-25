/**
 * Offline question answering: BM25 retrieval over the document's segments.
 * It cannot compose an answer, but it can point at the passages most likely to
 * contain one - and every passage is an exact excerpt, so it is always
 * verifiable.
 */

import type { CoreAnswer } from '../types.js';
import { stem, tokenize, truncate, type Segment } from './text.js';

const K1 = 1.4;
const B = 0.75;

/** Everyday wording -> the words contracts actually use. */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  leave: ['terminate', 'vacate', 'termination', 'notice', 'lock'],
  early: ['lock', 'terminate', 'notice'],
  enter: ['inspect', 'access', 'entry', 'premises'],
  entry: ['inspect', 'enter', 'access'],
  visit: ['inspect', 'enter', 'access'],
  privacy: ['inspect', 'enter', 'personal', 'data'],
  quit: ['terminate', 'resign', 'notice'],
  cancel: ['terminate', 'termination', 'renew', 'refund'],
  fired: ['terminate', 'termination', 'dismiss'],
  fire: ['terminate', 'termination', 'dismiss'],
  evict: ['vacate', 'terminate', 'eviction'],
  money: ['payment', 'fee', 'amount', 'refund', 'deposit'],
  pay: ['payment', 'fee', 'rent', 'invoice'],
  price: ['fee', 'rent', 'charge', 'amount'],
  cost: ['fee', 'charge', 'amount'],
  deposit: ['security', 'refund'],
  refund: ['return', 'deposit'],
  late: ['penalty', 'interest', 'fee'],
  sue: ['court', 'arbitration', 'jurisdiction', 'dispute'],
  court: ['arbitration', 'jurisdiction', 'dispute'],
  data: ['personal', 'information', 'privacy'],
  own: ['intellectual', 'property', 'assign'],
  copyright: ['intellectual', 'property', 'assign'],
  repair: ['maintenance'],
  work: ['services', 'deliverables'],
};

const QUESTION_STOP: ReadonlySet<string> = new Set(['what', 'when', 'where', 'who', 'how', 'why', 'does', 'can', 'happen', 'happens', 'tell', 'explain', 'mean', 'means']);

export function expandQuery(question: string): { base: string[]; all: string[] } {
  const base = tokenize(question).filter((token) => !QUESTION_STOP.has(token));
  const expanded = new Set(base);
  const raw = question.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const word of raw) for (const synonym of SYNONYMS[word] ?? []) expanded.add(stem(synonym));
  return { base, all: [...expanded] };
}

export interface RankedPassage {
  segment: Segment;
  score: number;
}

/** Rank segments against a question, best first. */
export function retrievePassages(segments: readonly Segment[], question: string, limit = 3): RankedPassage[] {
  const { base, all } = expandQuery(question);
  if (!all.length) return [];

  const docs = segments.map((segment) => tokenize(`${segment.heading} ${segment.text}`));
  const averageLength = docs.reduce((sum, tokens) => sum + tokens.length, 0) / (docs.length || 1) || 1;
  const documentFrequency = new Map<string, number>();
  for (const tokens of docs) for (const token of new Set(tokens)) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);

  const scored = segments.map((segment, index): RankedPassage => {
    const tokens = docs[index] ?? [];
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of all) {
      const tf = frequencies.get(term) ?? 0;
      if (!tf) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (segments.length - df + 0.5) / (df + 0.5));
      const weight = base.includes(term) ? 1 : 0.5; // synonyms count for less
      score += weight * idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * tokens.length) / averageLength)));
    }
    return { segment, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Answer without AI: show the closest passages, honestly labelled. */
export function answerOffline(segments: readonly Segment[], question: string): CoreAnswer {
  const passages = retrievePassages(segments, question, 3);
  const caveats = ['Offline mode matches keywords only; it cannot interpret meaning.'];
  const strongest = passages[0]?.score;
  if (strongest === undefined) {
    return {
      mode: 'offline',
      answer:
        'I could not find a passage in the document that relates to that question. It may not be covered, or it may use different wording. Try rephrasing, or ask a lawyer whether it is dealt with elsewhere.',
      confidence: 'not_found',
      citations: [],
      caveats,
      followUps: [],
    };
  }

  return {
    mode: 'offline',
    answer:
      'I can’t compose an answer without the AI service, but these passages from your document look most relevant. Read them closely, or turn on AI for a plain-language explanation.',
    confidence: strongest > 4 ? 'medium' : 'low',
    citations: passages.map(({ segment }) => ({
      quote: truncate(segment.text, 420),
      location: [segment.label, segment.heading].filter(Boolean).join(' – '),
      verified: true,
    })),
    caveats,
    followUps: [],
  };
}
