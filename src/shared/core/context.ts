/**
 * Context-driven logic: how a clause's risk changes with who you are, what to
 * do next given where you are in the process, and where to get free help.
 */

import type { JurisdictionId, Risk, RoleId, StageId } from '../options.js';
import type { Clause, DocTypeId, NextStep, Resource, RiskSummary } from '../types.js';
import { GLOBAL_AGGRAVATORS, type Rule } from './rules.js';

const LEVELS: readonly Risk[] = ['info', 'low', 'medium', 'high'];

const bump = (level: Risk): Risk => LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)] ?? level;

export interface RiskAssessment {
  risk: Risk;
  favoursYou: boolean;
  /** The one-sided phrase that raised the level, if any. */
  aggravator: string | null;
}

/** Severity of `rule` for `role`, given the actual wording of the clause. */
export function riskFor(rule: Rule, role: RoleId, quote: string): RiskAssessment {
  if (rule.benefits.includes(role)) {
    return { risk: 'low', favoursYou: true, aggravator: null };
  }
  let risk = rule.roleSeverity[role] ?? rule.severity;
  let aggravator: string | null = null;
  if (risk !== 'high') {
    const hit = (rule.plain ? null : GLOBAL_AGGRAVATORS.exec(quote)) ?? rule.aggravators.map((pattern) => pattern.exec(quote)).find(Boolean);
    if (hit) {
      aggravator = hit[0].toLowerCase();
      risk = bump(risk);
    }
  }
  return { risk, favoursYou: false, aggravator };
}

// ---------------------------------------------------------------------------
// Next steps
// ---------------------------------------------------------------------------

const TITLES: Readonly<Record<string, string>> = {
  auto_renewal: 'the automatic renewal',
  unilateral_termination: 'the one-sided right to terminate',
  unilateral_changes: 'the right to change the terms',
  indemnity: 'the indemnity',
  unlimited_liability: 'the unlimited liability',
  non_compete: 'the non-compete',
  ip_assignment: 'the ownership of your work',
  landlord_entry: 'the landlord’s entry rights',
  waiver_of_rights: 'the waiver of your rights',
  deadline_or_threat: 'the deadline in the notice',
  late_fee_penalty: 'the late fees and penalties',
  lock_in: 'the lock-in period',
  eviction_forfeiture: 'the eviction terms',
  arbitration: 'the arbitration clause',
  no_refund: 'the no-refund term',
  data_sharing: 'how your data is shared',
  security_deposit: 'the security deposit terms',
};

type ClauseLike = Pick<Clause, 'risk' | 'category' | 'title'>;

/** "a, b and c" from the first few clauses, de-duplicated by category. */
const describe = (clauses: readonly ClauseLike[], limit = 3): string => {
  const names = [...new Set(clauses.map((clause) => TITLES[clause.category] ?? clause.title.toLowerCase()))].slice(0, limit);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
};

export interface NextStepsInput {
  stage: StageId;
  docType: DocTypeId;
  risk: Pick<RiskSummary, 'level'>;
  clauses: readonly ClauseLike[];
}

/** Deterministic, stage-aware action list. Always returns 3-6 steps. */
export function buildNextSteps({ stage, docType, risk, clauses }: NextStepsInput): NextStep[] {
  const high = clauses.filter((clause) => clause.risk === 'high');
  const medium = clauses.filter((clause) => clause.risk === 'medium');
  const steps: NextStep[] = [];

  if (stage === 'notice' || docType === 'notice') {
    steps.push(
      { step: 'Write down the date you received this and the response deadline. Do not ignore it.', when: 'now' },
      { step: 'Gather related papers (agreements, receipts, messages, payment proofs) before you respond.', when: 'now' },
      { step: 'Contact a lawyer or a free legal-aid service quickly; take the original document with you.', when: 'now' },
      { step: 'Reply in writing (keep a copy and proof of delivery) rather than only over the phone.', when: 'soon' },
    );
  } else if (stage === 'before_signing') {
    if (high.length) {
      steps.push({ step: `Do not sign yet. Ask the other side to change or clarify ${describe(high)}.`, when: 'before_signing' });
    } else if (medium.length) {
      steps.push({ step: `Ask questions about ${describe(medium)} before you sign.`, when: 'before_signing' });
    } else {
      steps.push({ step: 'Read the whole document once more and note anything that is unclear.', when: 'before_signing' });
    }
    steps.push(
      { step: 'Get every promise made to you during discussions written into the document.', when: 'before_signing' },
      { step: 'Ask for time to review; a fair counterparty will not pressure you to sign immediately.', when: 'before_signing' },
    );
    if (risk.level !== 'low') {
      steps.push({ step: 'Have a qualified lawyer review the final version, using the brief this tool prepares for you.', when: 'before_signing' });
    }
  } else if (stage === 'signed') {
    steps.push(
      { step: 'Keep a signed copy safe and note all key dates (renewal, notice, payment) in your calendar.', when: 'now' },
      { step: 'Check the notice period and how to end the agreement in case you need to leave.', when: 'soon' },
    );
    if (high.length) {
      steps.push({ step: `Talk to a lawyer about ${describe(high)}; some terms may be negotiable or unenforceable.`, when: 'soon' });
    }
    steps.push({ step: 'Keep records of payments, messages and any changes agreed later.', when: 'later' });
  } else {
    steps.push(
      { step: 'Read the highlighted terms below and note anything you disagree with.', when: 'now' },
      { step: 'Check the key dates and amounts against what you expected.', when: 'now' },
    );
    if (high.length) steps.push({ step: `Get advice about ${describe(high)} before you act on this document.`, when: 'soon' });
  }

  steps.push({ step: 'Share the “Prepare for a lawyer” brief with a professional to save time and cost.', when: 'later' });
  return steps.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Which side of the contract are you on?  (for obligations)
// ---------------------------------------------------------------------------

export interface PartyNouns {
  you: readonly string[];
  other: readonly string[];
}

export const PARTY_NOUNS: Partial<Record<RoleId, PartyNouns>> = {
  tenant: { you: ['tenant', 'lessee', 'occupant'], other: ['landlord', 'lessor', 'owner'] },
  landlord: { you: ['landlord', 'lessor', 'owner'], other: ['tenant', 'lessee', 'occupant'] },
  employee: { you: ['employee', 'candidate'], other: ['employer', 'company', 'organisation', 'organization'] },
  employer: { you: ['employer', 'company', 'organisation', 'organization'], other: ['employee'] },
  freelancer: { you: ['contractor', 'consultant', 'freelancer', 'service provider'], other: ['client', 'company'] },
  client: { you: ['client', 'company'], other: ['contractor', 'consultant', 'freelancer', 'service provider'] },
  consumer: { you: ['user', 'customer', 'subscriber', 'consumer', 'you'], other: ['company', 'provider', 'we', 'us'] },
  small_business: { you: ['customer', 'client', 'licensee', 'buyer', 'you'], other: ['vendor', 'provider', 'licensor', 'supplier', 'we'] },
  borrower: { you: ['borrower', 'guarantor'], other: ['lender', 'bank'] },
};

// ---------------------------------------------------------------------------
// Free help by jurisdiction (every link below was checked when this was written)
// ---------------------------------------------------------------------------

const RESOURCES: Readonly<Record<JurisdictionId, readonly Resource[]>> = {
  IN: [
    { name: 'NALSA – free legal services (helpline 15100)', url: 'https://nalsa.gov.in', note: 'Free legal aid for eligible people through State/District Legal Services Authorities.' },
    { name: 'Tele-Law', url: 'https://www.tele-law.in', note: 'Free preliminary legal advice by phone/video via Common Service Centres.' },
  ],
  US: [
    { name: 'LawHelp.org', url: 'https://www.lawhelp.org', note: 'Find free legal aid and self-help guides in your state.' },
    { name: 'Legal Services Corporation: get legal help', url: 'https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help', note: 'Find a federally funded civil legal aid provider near you.' },
  ],
  UK: [
    { name: 'Citizens Advice', url: 'https://www.citizensadvice.org.uk', note: 'Free, confidential advice on housing, work, money and consumer rights.' },
    { name: 'Acas', url: 'https://www.acas.org.uk', note: 'Free guidance on employment rights and disputes.' },
  ],
  EU: [
    { name: 'Your Europe – advice', url: 'https://europa.eu/youreurope/advice/index_en.htm', note: 'Free advice on EU rights from legal experts.' },
    { name: 'EU consumer redress', url: 'https://consumer-redress.ec.europa.eu/', note: 'Help with consumer disputes, including cross-border ones.' },
  ],
  unspecified: [
    { name: 'Search “free legal aid” + your country/state', url: '', note: 'Most countries have bar-association or government legal-aid schemes.' },
  ],
};

export const resourcesFor = (jurisdiction: JurisdictionId): Resource[] => [...(RESOURCES[jurisdiction] ?? RESOURCES.unspecified)];
