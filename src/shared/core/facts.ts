/**
 * Key-fact extraction: parties, dates, money, durations and percentages, each
 * labelled from the words just before it ("security deposit", "notice period").
 * Heuristic by design - the UI presents these as "detected", not authoritative.
 */

import type { FactKind, KeyFact } from '../types.js';

type LabelTable = ReadonlyArray<readonly [RegExp, string]>;

const MONTHS =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const DATE_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTHS}\\.?,?\\s+\\d{4}\\b`, 'gi'),
  new RegExp(`\\b${MONTHS}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, 'gi'),
  /\b\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
];

const MONEY =
  /(?:₹|Rs\.?|INR|USD|US\$|\$|£|€|EUR|GBP)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakhs?|lacs?|crores?|thousand|million|k)\b)?/gi;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45,
  sixty: 60, ninety: 90,
};
const WORD_ALTERNATION = Object.keys(NUMBER_WORDS).join('|');
// "three months' rent" describes an amount of money, not a time period.
const DURATION = new RegExp(
  `\\b(\\d{1,3}|${WORD_ALTERNATION})\\s*(?:\\(\\s*(\\d{1,3})\\s*\\)\\s*)?(day|week|month|year)s?\\b(?!['’]s?\\s+(?:rent|salary|pay))`,
  'gi',
);
const PERCENT = /\b\d{1,3}(?:\.\d+)?\s*%/g;

const MONEY_LABELS: LabelTable = [
  [/outstanding|arrears|overdue|owed|due\s+from/i, 'Amount outstanding'],
  [/security\s+deposit|caution|deposit/i, 'Security deposit'],
  [/\brent(?:al)?\b/i, 'Rent'],
  [/salary|ctc|remuneration|compensation|stipend/i, 'Pay'],
  [/late|penalt|liquidated|fine/i, 'Late fee / penalty'],
  [/\bfees?\b|charges?|retainer/i, 'Fee'],
  [/price|purchase|consideration|cost/i, 'Price'],
  [/loan|principal|advance|emi|instal/i, 'Loan / instalment'],
  [/bonus|incentive/i, 'Bonus'],
  [/cap|limit|not\s+exceed|maximum/i, 'Liability cap'],
];

const DURATION_LABELS: LabelTable = [
  [/correct|cure|remed/i, 'Cure period'],
  [/lock[- ]?in/i, 'Lock-in period'],
  [/receipt|respond|response|comply|called\s+upon/i, 'Response deadline'],
  [/non[- ]?compet|restrain|restrict/i, 'Restriction period'],
  [/notice|resign/i, 'Notice period'],
  [/probation/i, 'Probation'],
  [/renew|extend/i, 'Renewal term'],
  [/refund|return/i, 'Refund window'],
  [/payable|invoice|due\b|within|respond/i, 'Payment / response window'],
  [/\bterm\b|period|tenure|duration|valid|commenc/i, 'Term / duration'],
];

const DATE_LABELS: LabelTable = [
  [/effective|commenc|start|begin|from|dated?\b/i, 'Start / document date'],
  [/expir|end|until|terminat|valid\s+(?:till|until|through)/i, 'End date'],
  [/due|deadline|on\s+or\s+before|by\b/i, 'Due date'],
];

const PARTY_LABEL =
  /^\s*(landlord|lessor|tenant|lessee|employer|employee|company|client|contractor|consultant|freelancer|service\s+provider|customer|borrower|lender|licensor|licensee|disclosing\s+party|receiving\s+party|seller|buyer|purchaser|vendor)\s*[:–-]\s*(.{2,80})$/gim;

const BETWEEN =
  /\bbetween\s+(?:M\/s\.?\s+)?([A-Z][\w.&'’ -]{2,60}?)\s*(?:\([^)]{0,80}\)\s*)?(?:,\s*)?\band\b\s+(?:M\/s\.?\s+)?([A-Z][\w.&'’ -]{2,60}?)\s*(?:\(|,|\.|\n|$)/;

const GOVERNING_LAW = /\bgoverned\s+by\b(?:\s+and\s+construed\s+in\s+accordance\s+with)?\s+the\s+laws?\s+of\s+([A-Z][\w ]{2,40}?)(?:[.,;]|\s+and\b|$)/;

function labelFor(context: string, table: LabelTable, fallback: string): string {
  for (const [pattern, label] of table) if (pattern.test(context)) return label;
  return fallback;
}

function contextBefore(text: string, index: number, length = 70): string {
  return text.slice(Math.max(0, index - length), index);
}

/** Words on both sides of a match: "…within 60 days' written notice" is a notice period. */
function contextAround(text: string, match: RegExpMatchArray, before: number, after: number): string {
  const start = match.index ?? 0;
  const end = start + match[0].length;
  return `${contextBefore(text, start, before)} ${text.slice(end, end + after)}`;
}

const toNumber = (raw: string): number => (/^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw.toLowerCase()] ?? Number.NaN));

/** "30 days" from a DURATION match; `undefined` when the number is unreadable. */
function describeDuration(match: RegExpMatchArray): string | undefined {
  const amount = toNumber(match[2] ?? match[1] ?? '');
  if (!Number.isFinite(amount)) return undefined;
  return `${amount} ${(match[3] ?? '').toLowerCase()}${amount === 1 ? '' : 's'}`;
}

/**
 * Short comparable value from a clause quote, e.g. "30 days" or "2%".
 * Used by the comparison view to show "30 days vs 60 days".
 */
export function extractValueSummary(text: string): string {
  for (const match of text.matchAll(DURATION)) {
    const described = describeDuration(match);
    if (described) return described;
    break;
  }
  const percent = text.match(PERCENT);
  if (percent?.[0]) return percent[0].replace(/\s+/g, '');
  const money = text.match(MONEY);
  if (money?.[0]) return money[0].replace(/\s+/g, ' ').replace(/[,.]$/, '').trim();
  return '';
}

/** At most `limit` facts, most useful first. */
export function extractKeyFacts(text: string, limit = 14): KeyFact[] {
  const facts: KeyFact[] = [];
  const seen = new Set<string>();

  const add = (kind: FactKind, label: string, value: string): void => {
    // Trim trailing punctuation but keep the dot in "Pvt. Ltd." and "Mr.".
    const cleaned = value
      .replace(/\s+/g, ' ')
      .replace(/[,;]+$/, '')
      .replace(/(?<!\b(?:Ltd|Pvt|Inc|Co|Corp|LLP|Mr|Ms|Mrs|Dr))\.$/, '')
      .trim();
    // Dates are deduplicated by value alone, whatever label the context suggested.
    const key = kind === 'date' ? `date|${cleaned.toLowerCase()}` : `${label}|${cleaned.toLowerCase()}`;
    if (!cleaned || seen.has(key)) return;
    seen.add(key);
    facts.push({ label, value: cleaned, kind });
  };

  for (const match of text.matchAll(PARTY_LABEL)) {
    if (facts.length >= 4) break;
    add('party', capitalize(match[1] ?? ''), (match[2] ?? '').replace(/\s*\([^)]*\)\s*$/, ''));
  }
  if (!facts.length) {
    const between = BETWEEN.exec(text);
    if (between) {
      add('party', 'Party 1', between[1] ?? '');
      add('party', 'Party 2', between[2] ?? '');
    }
  }

  const law = GOVERNING_LAW.exec(text);
  if (law?.[1]) add('law', 'Governing law', law[1]);

  for (const pattern of DATE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      add('date', labelFor(contextBefore(text, match.index ?? 0), DATE_LABELS, 'Date mentioned'), match[0]);
    }
  }

  for (const match of text.matchAll(MONEY)) {
    add('money', labelFor(contextAround(text, match, 70, 26), MONEY_LABELS, 'Amount'), match[0]);
  }

  for (const match of text.matchAll(DURATION)) {
    const described = describeDuration(match);
    if (!described) continue;
    add('duration', labelFor(contextAround(text, match, 50, 28), DURATION_LABELS, 'Time period'), described);
  }

  for (const match of text.matchAll(PERCENT)) {
    const context = contextAround(text, match, 80, 30);
    const label = /interest/i.test(context)
      ? 'Interest rate'
      : /late|penalt/i.test(context)
        ? 'Late fee rate'
        : /increase|escalat|hike|enhance/i.test(context)
          ? 'Increase / escalation'
          : 'Percentage';
    add('percent', label, match[0].replace(/\s+/g, ''));
  }

  // Keep a balanced sample: prefer distinct labels over many of the same one.
  const perLabel = new Map<string, number>();
  return facts
    .filter((fact) => {
      const count = perLabel.get(fact.label) ?? 0;
      perLabel.set(fact.label, count + 1);
      return count < 2;
    })
    .slice(0, limit);
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
