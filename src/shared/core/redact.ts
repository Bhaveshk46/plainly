/**
 * Privacy layer: mask obvious personal identifiers before a document leaves
 * the server for an AI provider, then restore them in the model's answer so
 * the user sees their own details again.
 *
 * Scope is deliberately honest: this catches *structured* identifiers (emails,
 * phone numbers, government IDs, card/IBAN numbers) and names that follow a
 * title ("Mr.", "Dr.", "Shri") or a party label ("Tenant:"). It cannot find
 * every name or address, and the UI says so.
 */

export type PiiKind = 'EMAIL' | 'IBAN' | 'PAN' | 'SSN' | 'CARD' | 'AADHAAR' | 'PHONE' | 'NAME';

interface Pattern {
  kind: PiiKind;
  regex: RegExp;
  validate?: (candidate: string) => boolean;
}

function passesLuhn(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isPlausibleIban(candidate: string): boolean {
  const compact = candidate.replace(/\s/g, '');
  return compact.length >= 15 && compact.length <= 34 && /\d/.test(compact.slice(2));
}

function isPlausiblePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  // Years, plain amounts and section numbers should not be treated as phones.
  if (/^(?:19|20)\d{2}$/.test(digits)) return false;
  return /[+\s().-]/.test(candidate.trim()) || digits.length >= 10;
}

const TITLES = 'Mr|Mrs|Ms|Miss|Dr|Prof|Shri|Smt|Sri|Kumari';
/** One to three capitalised words, never a title itself ("Mr" is not a name). */
const NAME_WORDS = String.raw`(?!(?:${TITLES})\b)[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2}`;

const PATTERNS: readonly Pattern[] = [
  { kind: 'EMAIL', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: 'IBAN', regex: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g, validate: isPlausibleIban },
  { kind: 'PAN', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { kind: 'SSN', regex: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
  // Cards go before Aadhaar: a 16-digit card contains a 12-digit run that would otherwise be eaten.
  { kind: 'CARD', regex: /\b(?:\d[ -]?){13,19}\b/g, validate: passesLuhn },
  { kind: 'AADHAAR', regex: /(?<![\d-])[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d)/g },
  { kind: 'PHONE', regex: /(?<![\w/])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,5}[\s.-]?\d{3,4}[\s.-]?\d{0,4}(?![\w/])/g, validate: isPlausiblePhone },
  // Only the name is masked; the title / label stays so the sentence still reads.
  { kind: 'NAME', regex: new RegExp(String.raw`(?<=\b(?:${TITLES})\.?[ \t]+)${NAME_WORDS}`, 'g') },
  {
    kind: 'NAME',
    regex: new RegExp(
      String.raw`(?<=\b(?:Landlord|Lessor|Tenant|Lessee|Employer|Employee|Client|Contractor|Consultant|Freelancer|Borrower|Lender|Licensor|Licensee)[ \t]*:[ \t]+)${NAME_WORDS}`,
      'g',
    ),
  },
];

const TOKEN = /\[(?:EMAIL|IBAN|PAN|AADHAAR|SSN|CARD|PHONE|NAME)_\d+\]/g;

export interface Redactor {
  /** Mask identifiers in `text`, reusing tokens for values seen before. */
  apply: (text: string) => string;
  /** token -> original value */
  readonly map: Map<string, string>;
  readonly counts: Record<string, number>;
  readonly total: number;
}

/**
 * A redactor keeps one token space across every string it sees, so the same
 * email gets the same token in a document, its quoted hints and the question
 * about it - and two documents in a comparison never reuse a token.
 */
export function createRedactor(): Redactor {
  const map = new Map<string, string>();
  const seen = new Map<string, string>(); // "KIND:original" -> token
  const counts: Record<string, number> = {};

  const apply = (text: string): string => {
    let output = text;
    for (const { kind, regex, validate } of PATTERNS) {
      output = output.replace(regex, (match) => {
        if (validate && !validate(match)) return match;
        const key = `${kind}:${match}`;
        let token = seen.get(key);
        if (!token) {
          counts[kind] = (counts[kind] ?? 0) + 1;
          token = `[${kind}_${counts[kind]}]`;
          seen.set(key, token);
          map.set(token, match);
        }
        return token;
      });
    }
    return output;
  };

  return {
    apply,
    map,
    counts,
    get total() {
      return map.size;
    },
  };
}

/** Convenience wrapper for a single string. */
export function redact(text: string): { text: string; map: Map<string, string>; counts: Record<string, number>; total: number } {
  const redactor = createRedactor();
  const output = redactor.apply(text);
  return { text: output, map: redactor.map, counts: redactor.counts, total: redactor.total };
}

/** Put original identifiers back into a string produced from redacted input. */
export function restoreText(value: string, map: ReadonlyMap<string, string> | undefined): string {
  if (!map || map.size === 0) return value;
  return value.replace(TOKEN, (token) => map.get(token) ?? token);
}

/** Recursively restore every string inside a JSON-like structure. */
export function restoreDeep<T>(value: T, map: ReadonlyMap<string, string> | undefined): T {
  if (!map || map.size === 0) return value;
  if (typeof value === 'string') return restoreText(value, map) as T;
  if (Array.isArray(value)) return value.map((item) => restoreDeep(item, map)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreDeep(item, map)])) as T;
  }
  return value;
}
