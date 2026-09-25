/** Small formatting helpers shared by the UI (pure, DOM-free). */

import type { Risk } from '../../shared/options.js';
import type { Confidence, StepWhen } from '../../shared/types.js';

export const RISK_META: Readonly<Record<Risk, { label: string; order: number }>> = {
  high: { label: 'High risk', order: 3 },
  medium: { label: 'Medium risk', order: 2 },
  low: { label: 'Low risk', order: 1 },
  info: { label: 'For information', order: 0 },
};

export const RISK_ORDER: readonly Risk[] = ['high', 'medium', 'low', 'info'];

export const CONFIDENCE_LABELS: Readonly<Record<Confidence, string>> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  not_found: 'Not found in document',
};

export const WHEN_LABELS: Readonly<Record<StepWhen, string>> = {
  now: 'Do now',
  before_signing: 'Before you sign',
  soon: 'Soon',
  later: 'Later',
};

const PII_NAMES: Readonly<Record<string, readonly [string, string]>> = {
  EMAIL: ['email', 'emails'],
  PHONE: ['phone number', 'phone numbers'],
  AADHAAR: ['Aadhaar number', 'Aadhaar numbers'],
  PAN: ['PAN', 'PANs'],
  SSN: ['SSN', 'SSNs'],
  CARD: ['card number', 'card numbers'],
  IBAN: ['IBAN', 'IBANs'],
  NAME: ['name', 'names'],
};

/** "2 emails, 1 phone number" from {EMAIL: 2, PHONE: 1}. */
export function describeRedactions(counts: Readonly<Record<string, number>>): string {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${(PII_NAMES[kind] ?? [kind, kind])[count === 1 ? 0 : 1]}`)
    .join(', ');
}

export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** BCP-47 tags for the Web Speech API. */
export const SPEECH_LANG: Readonly<Record<string, string>> = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  ta: 'ta-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-PT',
  ar: 'ar-SA',
};

/** "in 23 hours", "in 6 days" from an ISO timestamp. */
export function timeUntil(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'expired';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'in under an hour';
  if (hours < 48) return `in ${plural(hours, 'hour')}`;
  return `in ${plural(Math.round(hours / 24), 'day')}`;
}
