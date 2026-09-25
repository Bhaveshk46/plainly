/**
 * User-context vocabularies shared by the rules engine, the AI prompts, the
 * request validators and the browser UI. Ids are derived from these lists, so
 * adding a role or language here updates every type that mentions it.
 */

export const ROLES = [
  { id: 'general', label: "I'm not sure / just reading it" },
  { id: 'tenant', label: 'Tenant / renter' },
  { id: 'landlord', label: 'Landlord / property owner' },
  { id: 'employee', label: 'Employee / job candidate' },
  { id: 'employer', label: 'Employer / hiring manager' },
  { id: 'freelancer', label: 'Freelancer / contractor' },
  { id: 'client', label: 'Client hiring a freelancer or vendor' },
  { id: 'consumer', label: 'Consumer / app or service user' },
  { id: 'small_business', label: 'Small business owner' },
  { id: 'borrower', label: 'Borrower' },
] as const;

export const STAGES = [
  { id: 'understand', label: 'I just want to understand it' },
  { id: 'before_signing', label: "I haven't signed yet" },
  { id: 'signed', label: 'I already signed / agreed' },
  { id: 'notice', label: 'I received this as a notice or demand' },
] as const;

export const JURISDICTIONS = [
  { id: 'unspecified', label: 'Not sure / other' },
  { id: 'IN', label: 'India' },
  { id: 'US', label: 'United States' },
  { id: 'UK', label: 'United Kingdom' },
  { id: 'EU', label: 'European Union' },
] as const;

/** Output languages. `dir` lets the UI flip layout for right-to-left scripts. */
export const LANGUAGES = [
  { id: 'en', label: 'English', name: 'English', dir: 'ltr' },
  { id: 'hi', label: 'हिन्दी (Hindi)', name: 'Hindi', dir: 'ltr' },
  { id: 'bn', label: 'বাংলা (Bengali)', name: 'Bengali', dir: 'ltr' },
  { id: 'ta', label: 'தமிழ் (Tamil)', name: 'Tamil', dir: 'ltr' },
  { id: 'es', label: 'Español (Spanish)', name: 'Spanish', dir: 'ltr' },
  { id: 'fr', label: 'Français (French)', name: 'French', dir: 'ltr' },
  { id: 'de', label: 'Deutsch (German)', name: 'German', dir: 'ltr' },
  { id: 'pt', label: 'Português (Portuguese)', name: 'Portuguese', dir: 'ltr' },
  { id: 'ar', label: 'العربية (Arabic)', name: 'Arabic', dir: 'rtl' },
] as const;

export const RISK_LEVELS = ['high', 'medium', 'low', 'info'] as const;

export type RoleId = (typeof ROLES)[number]['id'];
export type StageId = (typeof STAGES)[number]['id'];
export type JurisdictionId = (typeof JURISDICTIONS)[number]['id'];
export type LanguageId = (typeof LANGUAGES)[number]['id'];
export type Direction = (typeof LANGUAGES)[number]['dir'];
export type Risk = (typeof RISK_LEVELS)[number];

export interface Context {
  role: RoleId;
  stage: StageId;
  jurisdiction: JurisdictionId;
  language: LanguageId;
}

const ids = <T extends { readonly id: string }>(list: readonly T[]): ReadonlySet<string> => new Set(list.map((item) => item.id));
export const ROLE_IDS = ids(ROLES);
export const STAGE_IDS = ids(STAGES);
export const JURISDICTION_IDS = ids(JURISDICTIONS);
export const LANGUAGE_IDS = ids(LANGUAGES);

export const DEFAULT_CONTEXT: Readonly<Context> = Object.freeze({
  role: 'general',
  stage: 'understand',
  jurisdiction: 'unspecified',
  language: 'en',
});

export const languageName = (id: LanguageId): string => LANGUAGES.find((language) => language.id === id)?.name ?? 'English';
export const languageDirection = (id: LanguageId): Direction => LANGUAGES.find((language) => language.id === id)?.dir ?? 'ltr';
export const roleLabel = (id: RoleId): string => ROLES.find((role) => role.id === id)?.label ?? 'general reader';
export const stageLabel = (id: StageId): string => STAGES.find((stage) => stage.id === id)?.label ?? id;
export const jurisdictionLabel = (id: JurisdictionId): string =>
  JURISDICTIONS.find((jurisdiction) => jurisdiction.id === id)?.label ?? 'unspecified jurisdiction';

export const DISCLAIMER =
  'Plainly provides general legal information to help you understand a document. ' +
  'It is not legal advice, does not create a lawyer-client relationship, and can make mistakes. ' +
  'For decisions that matter, have a qualified lawyer review the original document.';
