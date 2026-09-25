/**
 * Text utilities: normalisation, clause segmentation, sentence helpers and
 * quote matching. Everything downstream (rules, AI prompts, citation checks)
 * works on the *normalised* document so quotes stay verifiable.
 */

export interface Segment {
  id: number;
  /** "Clause 6" or "Paragraph 3". */
  label: string;
  /** The clause title, when the document has one ("Lock-in Period"). */
  heading: string;
  text: string;
}

export interface QuoteMatch {
  verified: boolean;
  quote: string;
  /** True when the quote was not exact and was replaced by the closest real sentence. */
  repaired: boolean;
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
// Stripping control characters from untrusted text is the point of this pattern.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Canonical form of an uploaded/pasted document. */
export function normalizeDocument(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(ZERO_WIDTH, '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Curly quotes and the family of dashes, written out so they stay visible in review.
const CURLY_SINGLE = /[‘’‚‛]/g;
const CURLY_DOUBLE = /[“”„‟]/g;
const DASHES = /[‐‑‒–—―−]/g;

/** Aggressive form used only for *comparing* strings (quote verification). */
export function foldForMatch(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(CURLY_SINGLE, "'")
    .replace(CURLY_DOUBLE, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export const wordCount = (text: string): number => (text.match(/\S+/g) ?? []).length;

export function truncate(text: unknown, max: number): string {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

const NUMBERED_LINE =
  /^\s*(?:(?:clause|section|article|schedule|annexure|part)\s+[\w.-]+|\(?\d{1,3}(?:\.\d{1,3}){0,4}\)?[.):]?|\([a-z]{1,3}\)|\([ivx]{1,5}\))(?=\s|$)/i;
const HEADING_ONLY = /^\s*(?:[A-Z][A-Z0-9 ,&/'()-]{3,60}|[A-Z][\w ,&/'-]{2,50}:)\s*$/;
const NUMBERING = /^\s*(?:(?:clause|section|article)\s+)?(\d{1,3}(?:\.\d{1,3}){0,4})[.):]?\s/i;
const INLINE_TITLE =
  /^\s*(?:(?:clause|section|article)\s+)?\d{1,3}(?:\.\d{1,3}){0,4}[.):]?\s+([A-Z][A-Za-z0-9 &/,'’()-]{2,60}?)[.:]\s+(?=[A-Z“"(₹$])/;
const MAX_SEGMENT = 900;
const MIN_BODY = 40;

/**
 * Split a document into clause-sized segments. Numbered clauses, headings and
 * blank-line paragraphs all act as boundaries; oversized paragraphs are cut at
 * sentence ends so no single segment dominates a prompt or a match.
 */
export function segmentDocument(text: string): Segment[] {
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length) blocks.push(current.join(' ').replace(/\s+/g, ' ').trim());
    current = [];
  };

  for (const line of text.split('\n')) {
    if (!line.trim()) {
      flush();
    } else if (NUMBERED_LINE.test(line) && current.length) {
      flush();
      current.push(line.trim());
    } else if (HEADING_ONLY.test(line)) {
      flush();
      current.push(line.trim());
      flush();
    } else {
      current.push(line.trim());
    }
  }
  flush();

  const segments: Segment[] = [];
  let pendingHeading = '';
  let paragraph = 0;

  for (const block of blocks.filter(Boolean)) {
    const isHeading = HEADING_ONLY.test(block) || (block.length < MIN_BODY && !/[.;]$/.test(block));
    if (isHeading) {
      pendingHeading = block.replace(/:$/, '');
      continue;
    }
    paragraph += 1;
    const numbering = NUMBERING.exec(block);
    const label = numbering ? `Clause ${numbering[1]}` : `Paragraph ${paragraph}`;

    // "6. Lock-in Period. There is…" -> heading "Lock-in Period", body "There is…"
    const caption = numbering ? INLINE_TITLE.exec(block) : null;
    const heading = caption?.[1] ?? pendingHeading;
    const body = caption ? block.slice(caption[0].length) : block;
    pendingHeading = '';

    for (const piece of splitLong(body, MAX_SEGMENT)) {
      segments.push({ id: segments.length, label, heading, text: piece });
    }
  }
  return segments;
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const pieces: string[] = [];
  let buffer = '';
  for (const sentence of splitSentences(text)) {
    if (buffer && buffer.length + sentence.length + 1 > max) {
      pieces.push(buffer);
      buffer = '';
    }
    buffer = buffer ? `${buffer} ${sentence}` : sentence;
    while (buffer.length > max * 1.5) {
      pieces.push(buffer.slice(0, max));
      buffer = buffer.slice(max);
    }
  }
  if (buffer) pieces.push(buffer);
  return pieces;
}

const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|no|nos|inc|ltd|pvt|co|corp|mr|mrs|ms|dr|rs|art|sec|cl|approx|st)\.$/i;

/** Sentence splitter tolerant of legal abbreviations ("Rs.", "Ltd.", "e.g."). */
export function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?;:])\s+(?=[A-Z0-9(“"'₹$£€])/);
  const sentences: string[] = [];
  for (const part of parts) {
    const previous = sentences[sentences.length - 1];
    if (previous && ABBREVIATIONS.test(previous)) sentences[sentences.length - 1] = `${previous} ${part}`;
    else sentences.push(part);
  }
  return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}

/**
 * The sentence surrounding a match, capped to `max` characters around the hit.
 * Always returns an exact substring of `text` so the quote can be verified.
 */
export function sentenceAround(text: string, index: number, max = 320): string {
  const before = boundaryBefore(text, index);
  let start = before === -1 ? 0 : before + 2;
  const after = boundaryAfter(text, index);
  let end = after === -1 ? text.length : after + 1;

  if (end - start > max) {
    start = Math.max(start, index - Math.floor(max / 3));
    end = Math.min(end, start + max);
    const space = text.lastIndexOf(' ', end);
    if (space > start + max * 0.6) end = space;
    const startSpace = text.indexOf(' ', start);
    if (start > 0 && startSpace !== -1 && startSpace < index) start = startSpace + 1;
  }
  return text.slice(start, end).trim();
}

const STOP_CHARS = new Set(['.', ';', '?', '!']);

/** Is the punctuation at `i` a real sentence end (not "Rs. 5,000" or "Mr. Rao")? */
function isBoundary(text: string, i: number): boolean {
  const char = text[i];
  if (char === undefined || !STOP_CHARS.has(char) || text[i + 1] !== ' ') return false;
  if (char !== '.') return true;
  return !ABBREVIATIONS.test(text.slice(Math.max(0, i - 12), i + 1));
}

function boundaryBefore(text: string, index: number): number {
  for (let i = Math.min(index, text.length - 1); i > 0; i -= 1) if (isBoundary(text, i)) return i;
  return -1;
}

function boundaryAfter(text: string, index: number): number {
  for (let i = index; i < text.length - 1; i += 1) if (isBoundary(text, i)) return i;
  return -1;
}

// ---------------------------------------------------------------------------
// Tokens & quote verification (anti-hallucination)
// ---------------------------------------------------------------------------

const STOPWORDS: ReadonlySet<string> = new Set(
  ('a an and are as at be by for from has have if in into is it its of on or that the their this ' +
    'to was were will with shall may not any all such other than then there these those which who ' +
    'whom you your we our us i me my he she they them his her can could would should do does did ' +
    'under upon per within without').split(' '),
);

/** Lower-cased content words with a light suffix stemmer. */
export function tokenize(text: string): string[] {
  return (foldForMatch(text).match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 1 && !STOPWORDS.has(token)).map(stem);
}

const SUFFIX_RULES: readonly RegExp[] = [/ies$/, /(?:ing|ed|es|s|ly)$/, /(?:ation|ate|ion|ment|able|al|at|e)$/];

/** Conservative suffix stripper: terminate/terminated/termination -> "termin". */
export function stem(token: string): string {
  if (token.length <= 4 || !/^\p{L}+$/u.test(token)) return token;
  let result = token;
  for (const rule of SUFFIX_RULES) {
    const next = result.replace(rule, rule.source.startsWith('ies') ? 'y' : '');
    if (next.length >= 3) result = next;
  }
  return result;
}

/**
 * Check that `quote` really appears in `documentText`.
 * 1. exact (whitespace/case/quote-style insensitive), allowing "…" gaps;
 * 2. otherwise repair to the best-overlapping sentence (>= 0.75 of tokens).
 */
export function locateQuote(documentText: string, quote: unknown, sentences: string[] = splitSentences(documentText)): QuoteMatch {
  const original = String(quote ?? '').trim();
  if (!original) return { verified: false, quote: '', repaired: false };

  const folded = foldForMatch(documentText);
  const fragments = foldForMatch(original)
    .split(/…|\.{3}/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= 8);

  if (fragments.length && fragments.every((fragment) => folded.includes(fragment))) {
    return { verified: true, quote: original, repaired: false };
  }

  const wanted = new Set(tokenize(original));
  if (wanted.size < 4) return { verified: false, quote: original, repaired: false };

  let best = { score: 0, sentence: '' };
  for (const sentence of sentences) {
    const have = new Set(tokenize(sentence));
    let hits = 0;
    for (const token of wanted) if (have.has(token)) hits += 1;
    const score = hits / wanted.size;
    if (score > best.score) best = { score, sentence };
  }
  if (best.score >= 0.75) return { verified: true, quote: truncate(best.sentence, 400), repaired: true };
  return { verified: false, quote: original, repaired: false };
}

// ---------------------------------------------------------------------------
// Highlighting support (used by the document viewer)
// ---------------------------------------------------------------------------

export interface Range {
  start: number;
  end: number;
}

const MIN_QUOTE_CHARS = 8;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex that matches `fragment` regardless of whitespace runs and quote style. */
function flexibleFragment(fragment: string): RegExp {
  const body = fragment
    .trim()
    .split(/\s+/)
    .map((word) => escapeRegex(word).replace(/['‘’]/g, "['‘’]").replace(/["“”]/g, '["“”]'))
    .join('\\s+');
  return new RegExp(body, 'i');
}

/**
 * Where does `quote` sit in `text`? Tolerates whitespace and quote-style
 * differences and "…" gaps. Returns null if it cannot be located.
 */
export function findQuoteRange(text: string, quote: string): Range | null {
  // Very short quotes would highlight arbitrary words, so they are never trusted.
  const exact = quote.length >= MIN_QUOTE_CHARS ? text.indexOf(quote) : -1;
  if (exact !== -1) return { start: exact, end: exact + quote.length };

  const fragments = quote
    .split(/…|\.{3}/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= MIN_QUOTE_CHARS);
  const first = fragments[0];
  const last = fragments[fragments.length - 1];
  if (first === undefined || last === undefined) return null;

  const head = flexibleFragment(first).exec(text);
  if (!head) return null;
  if (fragments.length === 1) return { start: head.index, end: head.index + head[0].length };

  const tail = flexibleFragment(last).exec(text.slice(head.index));
  if (!tail) return null;
  return { start: head.index, end: head.index + tail.index + tail[0].length };
}
