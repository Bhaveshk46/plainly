/**
 * The API contract. Server and browser import the same types, so a change to a
 * response shape is a compile error on both sides instead of a runtime surprise.
 */

import type { Context, LanguageId, Risk } from './options.js';

export type Mode = 'ai' | 'offline';
export type DocTypeId = 'rental' | 'employment' | 'services' | 'nda' | 'terms' | 'loan' | 'notice' | 'partnership' | 'other';
export type StepWhen = 'now' | 'soon' | 'before_signing' | 'later';
export type Confidence = 'high' | 'medium' | 'low' | 'not_found';
export type Side = 'a' | 'b';

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface Clause {
  id: string;
  category: string;
  title: string;
  risk: Risk;
  /** Verbatim excerpt from the user's document. */
  quote: string;
  location: string;
  explanation: string;
  whyItMatters: string;
  suggestion: string;
  question: string;
  /** A short comparable value such as "30 days" or "3%". */
  value: string;
  jurisdictionNote: string;
  source: 'rule' | 'ai';
  verified: boolean;
  repaired?: boolean;
  /** Titles of other findings that share this exact sentence. */
  related: string[];
  hintId?: string;
}

export type FactKind = 'party' | 'law' | 'date' | 'money' | 'duration' | 'percent' | 'ai';

export interface KeyFact {
  label: string;
  value: string;
  kind: FactKind;
}

export interface Obligation {
  party: string;
  text: string;
  when: string;
}

export interface MissingItem {
  item: string;
  why: string;
}

export interface NextStep {
  step: string;
  when: StepWhen;
}

export interface Resource {
  name: string;
  url: string;
  note: string;
}

export interface RiskSummary {
  level: 'high' | 'medium' | 'low';
  score: number;
  counts: Record<Risk, number>;
  rationale: string;
}

export interface DocumentInfo {
  type: DocTypeId;
  typeLabel: string;
  confidence: number;
  wordCount: number;
}

export interface Summary {
  headline: string;
  plain: string[];
}

export interface Privacy {
  redactions: Record<string, number>;
  totalRedactions: number;
  sentToAI: boolean;
}

export interface Grounding {
  checked: number;
  verified: number;
  dropped: number;
}

/** What the deterministic engine produces on its own (no AI, no privacy report). */
export interface CoreAnalysis {
  mode: Mode;
  notice: string | null;
  context: Context;
  /** The language the text is actually written in (English when AI is off). */
  outputLanguage: LanguageId;
  document: DocumentInfo;
  summary: Summary;
  keyFacts: KeyFact[];
  risk: RiskSummary;
  clauses: Clause[];
  obligations: Obligation[];
  missing: MissingItem[];
  questionsForLawyer: string[];
  nextSteps: NextStep[];
  resources: Resource[];
  warnings: string[];
  disclaimer: string;
}

export interface Analysis extends CoreAnalysis {
  privacy: Privacy;
  grounding?: Grounding;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface CompareSide {
  present: boolean;
  risk: Risk | null;
  quote: string;
  value: string;
  location: string;
}

export type Difference = 'same' | 'differs' | 'only_a' | 'only_b';

export interface CompareRow {
  category: string;
  title: string;
  a: CompareSide;
  b: CompareSide;
  difference: Difference;
  better: Side | 'neither';
  comment: string;
}

export interface FactComparison {
  label: string;
  a: string;
  b: string;
  differs: boolean;
}

export interface DiffPart {
  type: 'same' | 'del' | 'ins';
  text: string;
}

export interface Change {
  type: 'added' | 'removed' | 'modified';
  a?: string;
  b?: string;
  locationA?: string;
  locationB?: string;
  parts?: DiffPart[];
}

export interface Verdict {
  favors: Side | 'neither';
  headline: string;
  reasons: string[];
}

export interface CoreComparison {
  mode: Mode;
  notice: string | null;
  context: Context;
  outputLanguage: LanguageId;
  labels: { a: string; b: string };
  documents: {
    a: { typeLabel: string; wordCount: number; risk: RiskSummary };
    b: { typeLabel: string; wordCount: number; risk: RiskSummary };
  };
  verdict: Verdict;
  facts: FactComparison[];
  rows: CompareRow[];
  changes: Change[];
  inconsistencies: string[];
  questionsForLawyer: string[];
  warnings: string[];
  disclaimer: string;
}

export interface Comparison extends CoreComparison {
  privacy: Privacy;
  grounding?: Grounding;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface Citation {
  quote: string;
  location?: string;
  verified: boolean;
}

export interface CoreAnswer {
  mode: Mode;
  answer: string;
  confidence: Confidence;
  citations: Citation[];
  caveats: string[];
  followUps: string[];
}

export interface Answer extends CoreAnswer {
  privacy: Privacy;
  notice: string | null;
  outputLanguage: LanguageId;
}

// ---------------------------------------------------------------------------
// Files & sharing
// ---------------------------------------------------------------------------

export interface ExtractResult {
  text: string;
  method: 'text' | 'pdf' | 'docx' | 'image' | 'ocr';
  pages?: number;
  truncated: boolean;
}

/** Response of POST /api/shares. The delete token is shown to the creator only. */
export interface ShareCreated {
  id: string;
  deleteToken: string;
  expiresAt: string;
}

/** Response of GET /api/shares/:id: opaque to the server, decrypted in the browser. */
export interface ShareEnvelope {
  id: string;
  iv: string;
  ciphertext: string;
  expiresAt: string;
}

export interface AppConfig {
  ai: { enabled: boolean; provider: string };
  limits: { maxDocChars: number; maxUploadBytes: number; maxQuestionChars: number; maxShareBytes: number };
  shares: { enabled: boolean; ttlHours: number[] };
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
