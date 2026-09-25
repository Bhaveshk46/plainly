/**
 * "What changed?" between two versions of a document: segments are paired by
 * token similarity, then paired segments get a word-level diff for display.
 */

import type { Change, DiffPart } from '../types.js';
import { tokenize } from './text.js';

const MATCH_THRESHOLD = 0.4;
const MAX_WORDS_FOR_DIFF = 500;
export const MAX_CHANGES = 40;

const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/** Word-level diff using a longest-common-subsequence table. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  if (a.length > MAX_WORDS_FOR_DIFF || b.length > MAX_WORDS_FOR_DIFF) {
    return [
      { type: 'del', text: before },
      { type: 'ins', text: after },
    ];
  }

  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  const at = (i: number, j: number): number => table[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const parts: DiffPart[] = [];
  const push = (type: DiffPart['type'], word: string): void => {
    const last = parts[parts.length - 1];
    if (last?.type === type) last.text += ` ${word}`;
    else parts.push({ type, text: word });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i] as string);
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      push('del', a[i] as string);
      i += 1;
    } else {
      push('ins', b[j] as string);
      j += 1;
    }
  }
  while (i < a.length) push('del', a[i++] as string);
  while (j < b.length) push('ins', b[j++] as string);
  return parts;
}

interface Piece {
  label: string;
  text: string;
}

/** Pair up similar paragraphs, then report what was modified, removed or added. */
export function diffSegments(segmentsA: readonly Piece[], segmentsB: readonly Piece[]): Change[] {
  const tokensA = segmentsA.map((segment) => new Set(tokenize(segment.text)));
  const tokensB = segmentsB.map((segment) => new Set(tokenize(segment.text)));

  const pairs: Array<{ i: number; j: number; score: number }> = [];
  for (let i = 0; i < segmentsA.length; i += 1) {
    for (let j = 0; j < segmentsB.length; j += 1) {
      const score = jaccard(tokensA[i] as Set<string>, tokensB[j] as Set<string>);
      if (score >= MATCH_THRESHOLD) pairs.push({ i, j, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const matched: Array<{ i: number; j: number }> = [];
  for (const pair of pairs) {
    if (usedA.has(pair.i) || usedB.has(pair.j)) continue;
    usedA.add(pair.i);
    usedB.add(pair.j);
    matched.push(pair);
  }

  const changes: Change[] = [];
  for (const { i, j } of matched.sort((x, y) => x.i - y.i)) {
    const a = segmentsA[i] as Piece;
    const b = segmentsB[j] as Piece;
    if (a.text === b.text) continue;
    changes.push({
      type: 'modified',
      a: a.text,
      b: b.text,
      locationA: a.label,
      locationB: b.label,
      parts: wordDiff(a.text, b.text),
    });
  }
  segmentsA.forEach((segment, i) => {
    if (!usedA.has(i)) changes.push({ type: 'removed', a: segment.text, locationA: segment.label });
  });
  segmentsB.forEach((segment, j) => {
    if (!usedB.has(j)) changes.push({ type: 'added', b: segment.text, locationB: segment.label });
  });

  return changes.slice(0, MAX_CHANGES);
}
