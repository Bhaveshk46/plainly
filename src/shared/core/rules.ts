/**
 * The clause library: what to look for, how risky it is *for whom*, and how to
 * explain it in plain language.
 *
 * Severity model
 *  - `severity`      what a neutral reader should think of the clause
 *  - `roleSeverity`  overrides for roles that are usually on the weaker side
 *  - `benefits`      roles the clause usually favours; shown as "low" with a note
 *  - `aggravators`   extra wording that makes the clause one-sided (bumps a level)
 *  - `exclude`       boilerplate that looks similar but is harmless
 *  - `plain`         skip the global aggravators (the rule's own trigger words are
 *                    among them, so they would always bump)
 *
 * Patterns use bounded quantifiers only (no nested unbounded repeats) so they
 * stay linear-time on very large documents.
 */

import type { JurisdictionId, Risk, RoleId } from '../options.js';

export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly patterns: readonly RegExp[];
  readonly severity: Risk;
  readonly roleSeverity: Partial<Record<RoleId, Risk>>;
  readonly benefits: readonly RoleId[];
  readonly aggravators: readonly RegExp[];
  readonly exclude: readonly RegExp[];
  readonly plain?: boolean;
  readonly explain: string;
  readonly why: string;
  readonly suggest: string;
  readonly question: string;
  readonly jurisdiction: Partial<Record<JurisdictionId, string>>;
}

/** What a rule author writes: optional fields are filled with empty defaults. */
type RuleInput = Omit<Rule, 'roleSeverity' | 'benefits' | 'aggravators' | 'exclude' | 'jurisdiction'> &
  Partial<Pick<Rule, 'roleSeverity' | 'benefits' | 'aggravators' | 'exclude' | 'jurisdiction'>>;

const rule = (definition: RuleInput): Rule =>
  Object.freeze({ roleSeverity: {}, benefits: [], aggravators: [], exclude: [], jurisdiction: {}, ...definition });

const WEAKER: readonly RoleId[] = ['tenant', 'employee', 'freelancer', 'consumer', 'small_business', 'borrower'];
/** Roles that usually write the contract and benefit from one-sided protections. */
const DRAFTER: readonly RoleId[] = ['landlord', 'employer', 'client'];
const onlyFor = (level: Risk, roles: readonly RoleId[] = WEAKER): Partial<Record<RoleId, Risk>> =>
  Object.fromEntries(roles.map((role) => [role, level]));

/** Wording that makes any clause more one-sided. */
export const GLOBAL_AGGRAVATORS =
  /\b(?:sole(?:\s+and\s+absolute)?\s+discretion|absolute\s+discretion|at\s+any\s+time|without\s+(?:any\s+)?(?:prior\s+)?(?:notice|cause|reason|consent|liability)|any\s+and\s+all|unlimited|perpetual(?:ly)?|irrevocabl[ey]|in\s+perpetuity|non[- ]refundable|forfeit\w*|at\s+its\s+(?:sole\s+)?discretion|whether\s+or\s+not)\b/i;

export const RULES: readonly Rule[] = [
  rule({
    id: 'deadline_or_threat',
    title: 'Deadline or threatened legal action',
    patterns: [
      /\bwithin\s+(?:\d+|\w+)\s*(?:\(\d+\)\s*)?(?:days?|hours?)\b[^.]{0,40}\b(?:receipt|service|date)\s+of\s+(?:this|the)\s+(?:notice|letter|summons|demand)/i,
      /\bfailing\s+which\b/i,
      /\bshow[- ]cause\b/i,
      /\bcease\s+and\s+desist\b/i,
      /\b(?:summons|legal\s+notice|demand\s+notice)\b/i,
      /\b(?:legal|civil|criminal)\s+(?:action|proceedings?)\b[^.]{0,60}\b(?:initiate|instituted?|commence|take|file)/i,
    ],
    severity: 'high',
    explain: 'This sets a deadline, or says legal action will follow if you do not respond or comply.',
    why: 'Missing a stated deadline can weaken your position or let the other side get a decision without hearing from you.',
    suggest: 'Note the date you received it, respond in writing before the deadline, and speak to a lawyer or a legal-aid service quickly.',
    question: 'What is the exact deadline, and what happens if I respond late or not at all?',
  }),
  rule({
    id: 'auto_renewal',
    title: 'Automatic renewal',
    patterns: [
      /\bauto[- ]?renew\w*/i,
      /\b(?:automatically|auto)\s+(?:be\s+)?(?:renew|extend)\w*/i,
      /\b(?:shall|will|would)\s+(?:be\s+)?(?:renewed|extended)\s+(?:automatically|for\s+(?:a\s+)?(?:successive|further|another|additional))/i,
      /\brenews?\s+(?:automatically|for\s+(?:successive|further|another|additional))/i,
      /\bevergreen\b/i,
      /\bfree\s+trial\b[^.]{0,120}\b(?:convert|charged|billed|automatically)\b/i,
    ],
    severity: 'medium',
    explain: 'The agreement rolls into a new term on its own unless you cancel before a deadline.',
    why: 'If you miss the cancellation window you can be locked in for another full term and keep paying.',
    suggest: 'Put the opt-out date in your calendar and cancel in writing before it. Ask the other side for a reminder.',
    question: 'What is the exact deadline and method for stopping automatic renewal?',
    jurisdiction: {
      US: 'Many US states have automatic-renewal laws requiring clear disclosure and an easy way to cancel.',
      UK: 'UK consumer law requires subscription terms to be transparent and fair.',
    },
  }),
  rule({
    id: 'unilateral_changes',
    title: 'One side can change the terms',
    patterns: [
      /\b(?:reserves?|reserving)\s+the\s+right\s+to\s+(?:change|modify|amend|update|revise|vary|alter)\b/i,
      /\b(?:may|can)\s+(?:change|modify|amend|update|revise|vary)\s+(?:these|this|the)\s+(?:terms|agreement|policy|fees|prices?|charges)\b[^.]{0,80}(?:at\s+any\s+time|from\s+time\s+to\s+time|without)/i,
      /\bsubject\s+to\s+change\s+without\s+(?:prior\s+)?notice/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high'),
    benefits: DRAFTER,
    explain: 'One party can change the agreement, prices or policies after you have agreed to it.',
    why: 'You may be bound by terms you never saw or agreed to, and continuing to use the service can count as accepting them.',
    suggest: 'Ask for changes to require advance written notice and your consent, or a right to cancel without penalty if you disagree.',
    question: 'How much notice will I get of a change, and can I exit without penalty if I disagree?',
    jurisdiction: {
      EU: 'Under the EU Unfair Terms Directive, one-sided rights to change terms without a valid reason can be unenforceable against consumers.',
      UK: 'Under the Consumer Rights Act 2015, unfair terms in consumer contracts are not binding on the consumer.',
    },
  }),
  rule({
    id: 'unilateral_termination',
    title: 'Ended quickly without a reason',
    patterns: [
      /\b(?:may|can|shall\s+be\s+entitled\s+to|reserves?\s+the\s+right\s+to)\s+(?:immediately\s+)?(?:terminate|cancel|suspend|discontinue)\b[^.;]{0,140}?(?:at\s+any\s+time|without\s+(?:any\s+)?(?:prior\s+)?(?:notice|cause|reason|liability)|sole\s+(?:and\s+absolute\s+)?discretion|for\s+any\s+reason)/i,
      /\bterminat\w+\b[^.;]{0,60}\bat\s+its\s+(?:sole\s+)?discretion/i,
    ],
    severity: 'high',
    benefits: DRAFTER,
    explain: 'One side (check which) can end or suspend the agreement quickly, without giving a reason or much warning.',
    why: 'You could lose your home, job, service or income at short notice with little recourse.',
    suggest: 'Ask that the right to end the agreement is mutual, requires written notice, and only for stated reasons.',
    question: 'Does both sides have the same right to terminate, and what notice is required?',
  }),
  rule({
    id: 'termination_notice',
    title: 'Notice period to leave or end it',
    patterns: [
      /\bterminat\w*\b[^.;]{0,120}?\bnotice\b/i,
      /\bnotice\b[^.;]{0,120}?\bterminat\w*/i,
      /\bnotice\s+period\b/i,
      /\b(?:vacate|resign|quit)\b[^.;]{0,80}\bnotice\b/i,
    ],
    severity: 'info',
    explain: 'Sets how much warning is needed before either side can end the agreement.',
    why: 'A long notice period on your side, or a short one on theirs, decides how easily you can leave and how safe your position is.',
    suggest: 'Check the notice period is the same for both sides, and note the exact number of days.',
    question: 'What notice must each side give, and does it have to be in writing?',
  }),
  rule({
    id: 'arbitration',
    title: 'Disputes go to arbitration',
    patterns: [/\barbitrat\w+/i],
    severity: 'medium',
    benefits: DRAFTER,
    aggravators: [/\b(?:arbitrator|tribunal)\b[^.]{0,60}\bappointed\s+by\s+(?:the\s+)?(?:landlord|company|employer|client|licensor|provider|lender|bank|us)\b/i],
    explain: 'Disputes are decided by a private arbitrator instead of a court.',
    why: 'You may give up the right to go to court or appeal, and arbitration fees and venue can be costly or inconvenient.',
    suggest: 'Check who pays the arbitration fees, where it takes place, who picks the arbitrator, and whether small-claims court is still available.',
    question: 'Who appoints the arbitrator, who pays the fees, and where would hearings take place?',
    jurisdiction: {
      IN: 'Arbitration in India is governed by the Arbitration and Conciliation Act, 1996. Indian courts have in several cases refused to accept one-sided arbitrator appointment; a lawyer can tell you if that applies.',
      US: 'In the US, arbitration clauses are often enforceable under the Federal Arbitration Act, even for consumers and employees.',
    },
  }),
  rule({
    id: 'class_action_waiver',
    title: 'Give up group lawsuits or jury trial',
    patterns: [
      /\bclass[- ]action\b/i,
      /\bjury\s+trial\b/i,
      /\bwaive\w*\b[^.]{0,60}\b(?:class|jury|collective|representative)\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['consumer', 'employee', 'tenant', 'small_business']),
    benefits: DRAFTER,
    explain: 'You give up the right to join a group lawsuit or to have a jury decide a dispute.',
    why: 'Small individual claims are often not worth pursuing alone, so this can make it practically impossible to challenge the other side.',
    suggest: 'If you can, ask to remove it or keep an opt-out right; note any opt-out deadline.',
    question: 'Is there a way to opt out of this waiver, and by when?',
  }),
  rule({
    id: 'governing_law',
    title: 'Which law and courts apply',
    patterns: [
      /\bgoverned\s+by\b[^.]{0,60}\blaws?\s+of\b/i,
      /\b(?:exclusive\s+)?jurisdiction\s+of\s+the\s+courts?\b/i,
      /\bsubject\s+to\s+the\s+(?:exclusive\s+)?jurisdiction\b/i,
      /\bvenue\b[^.]{0,40}\b(?:courts?|county|state)\b/i,
    ],
    severity: 'info',
    explain: 'Says whose law applies and which courts can hear a dispute.',
    why: 'If the courts are far from you, a dispute can become expensive or impractical to pursue.',
    suggest: 'Check whether the named courts are somewhere you could realistically attend.',
    question: 'Which courts would handle a dispute, and is that practical for me?',
  }),
  rule({
    id: 'indemnity',
    title: 'You may have to cover the other side’s losses',
    patterns: [/\bindemnif\w+/i, /\bhold\s+harmless\b/i],
    severity: 'medium',
    roleSeverity: onlyFor('high'),
    benefits: DRAFTER,
    explain: 'You promise to compensate the other side for losses, claims or legal costs, sometimes even ones you did not cause.',
    why: 'An indemnity can expose you to costs far bigger than the agreement’s value, especially if it covers “any and all” claims.',
    suggest: 'Ask to limit it to losses caused by your own breach or negligence, make it mutual, and cap the amount.',
    question: 'Is the indemnity limited to my own fault and is there a cap on the amount?',
  }),
  rule({
    id: 'limitation_of_liability',
    title: 'Limits on what the other side pays for',
    patterns: [
      /\blimitations?\s+of\s+liability\b/i,
      /\bin\s+no\s+event\s+shall\b[^.]{0,80}\bliab\w+/i,
      /\b(?:aggregate|total|maximum)\s+liability\b[^.]{0,80}\b(?:shall\s+not\s+exceed|limited\s+to|capped)\b/i,
      /\b(?:shall|will)\s+not\s+be\s+(?:held\s+)?liable\b/i,
      /\bnot\s+(?:be\s+)?responsible\s+for\s+any\s+(?:loss|damage)/i,
    ],
    severity: 'medium',
    benefits: DRAFTER,
    explain: 'Caps or excludes what one side must pay if something goes wrong.',
    why: 'If the other side causes you harm, you may only be able to recover a small amount, or nothing at all.',
    suggest: 'Check whether the limit applies to both sides equally and whether it is high enough to cover a realistic loss.',
    question: 'Does the liability cap apply equally to both sides, and what is the amount?',
    jurisdiction: {
      UK: 'In the UK, liability for death or personal injury caused by negligence cannot be excluded, and consumer contracts are subject to a fairness test.',
      EU: 'In the EU, liability limits in consumer contracts can be unenforceable if they are unfair.',
    },
  }),
  rule({
    id: 'unlimited_liability',
    title: 'Unlimited personal liability',
    patterns: [
      /\bunlimited\s+liab\w+/i,
      /\bliable\s+for\s+(?:any\s+and\s+)?all\s+(?:losses|damages|costs|claims)\b/i,
      /\bfull\s+liab\w+/i,
    ],
    severity: 'high',
    explain: 'You could be responsible for all losses with no upper limit.',
    why: 'There is no ceiling on what you might owe, which can be far larger than what you earn or pay under the agreement.',
    suggest: 'Ask for a cap tied to the fees paid or another fixed amount, and for exclusions of indirect losses.',
    question: 'Can my liability be capped at a fixed amount?',
  }),
  rule({
    id: 'warranty_disclaimer',
    title: '“As is”, no promises about quality',
    patterns: [
      /\b(?:as[- ]is|as[- ]available)\b/i,
      /\bdisclaims?\s+(?:all|any)\s+(?:express\s+or\s+implied\s+)?warrant\w+/i,
      /\bwithout\s+(?:any\s+)?warrant\w+/i,
    ],
    severity: 'medium',
    explain: 'What you get is provided as it is, with no promise that it works or is fit for your purpose.',
    why: 'If it turns out to be defective or unsuitable, you may have limited grounds to ask for a fix or refund.',
    suggest: 'Ask for basic promises (works as described, lawful, free of hidden defects) and a remedy if it does not.',
    question: 'What can I do if the product or service does not work as described?',
    jurisdiction: {
      UK: 'UK consumers keep statutory rights (e.g. goods of satisfactory quality) that a contract cannot take away.',
      EU: 'EU consumers keep legal guarantee rights that a contract cannot waive.',
    },
  }),
  rule({
    id: 'non_compete',
    title: 'Restriction on working for competitors',
    patterns: [
      /\bnon[- ]?compet\w+/i,
      /\bnot\s+(?:to\s+)?(?:directly\s+or\s+indirectly\s+)?(?:compete|engage\s+in|be\s+engaged\s+in|carry\s+on|work\s+for)\b[^.]{0,100}\b(?:competitor|competing|similar\s+business|any\s+business)/i,
      /\brestraint\s+of\s+trade\b/i,
      /\brestrictive\s+covenants?\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['employee', 'freelancer']),
    benefits: ['employer', 'client'],
    explain: 'After (or while) working here you are limited in taking similar work or starting a competing business.',
    why: 'It can restrict your income and career options, sometimes for a long period or a wide area.',
    suggest: 'Ask for a shorter duration, a narrower area and scope, and pay during the restricted period.',
    question: 'How long does the restriction last, how wide is it, and is it enforceable where I live?',
    jurisdiction: {
      IN: 'In India, agreements restraining trade are void under Section 27 of the Contract Act, 1872; post-employment non-competes are generally unenforceable, though confidentiality duties may still apply.',
      US: 'In the US, enforceability varies by state; California, for example, largely voids employee non-competes.',
      UK: 'In the UK, non-competes are enforceable only if reasonable and protecting a legitimate business interest.',
    },
  }),
  rule({
    id: 'non_solicit',
    title: 'Cannot approach staff or customers',
    patterns: [
      /\bnon[- ]?solicit\w*/i,
      /\bshall\s+not\b[^.]{0,80}\bsolicit\w*\b[^.]{0,80}\b(?:employees?|customers?|clients?|staff)/i,
    ],
    severity: 'medium',
    benefits: ['employer', 'client'],
    explain: 'You cannot recruit the other side’s staff or approach their customers for a period of time.',
    why: 'It can limit where you work next or which clients you can serve, depending on how broadly it is written.',
    suggest: 'Check the duration, and that it only covers people you actually dealt with.',
    question: 'How long does the non-solicitation last and who exactly does it cover?',
  }),
  rule({
    id: 'confidentiality',
    title: 'Confidentiality duty',
    patterns: [
      /\bconfidential\s+information\b/i,
      /\bnon[- ]disclosure\b/i,
      /\bshall\s+(?:keep|hold|maintain)\b[^.]{0,40}\bconfidential\b/i,
    ],
    severity: 'info',
    explain: 'You must keep certain information private and not use it for other purposes.',
    why: 'Breaking confidentiality can lead to damages; very broad or endless duties are hard to comply with.',
    suggest: 'Check how “confidential information” is defined, how long the duty lasts, and the usual exceptions (already public, legally required).',
    question: 'How long does the confidentiality duty last and what is excluded?',
  }),
  rule({
    id: 'ip_assignment',
    title: 'Who owns the work you create',
    patterns: [
      /\bassigns?\b[^.]{0,60}\ball\s+(?:right|title|interest)\b/i,
      /\bwork(?:s)?\s+(?:made\s+)?for[- ]hire\b/i,
      /\b(?:shall|will)\s+(?:be\s+)?(?:the\s+)?(?:exclusive\s+)?(?:property|owned)\s+(?:of|by)\b[^.]{0,80}\b(?:intellectual|work\s+product|inventions?|deliverables)/i,
      /\b(?:intellectual\s+property|work\s+product|inventions?|deliverables)\b[^.]{0,100}\b(?:vest|belong|owned|assign)\w*/i,
      /\bmoral\s+rights\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['freelancer', 'employee']),
    benefits: ['employer', 'client'],
    aggravators: [/\b(?:outside\s+(?:of\s+)?(?:working|office|normal)\s+hours|prior\s+inventions|before\s+payment)\b/i],
    explain: 'Ownership of what you create (designs, code, writing, inventions) passes to the other party.',
    why: 'You may lose the right to reuse your own work, or the transfer may cover work you did outside this job or before you were paid.',
    suggest: 'Limit the transfer to work created for this engagement, make it effective only after full payment, and keep rights to your pre-existing tools.',
    question: 'Does the ownership transfer cover only work made for this project, and only after I am paid?',
    jurisdiction: {
      IN: 'Under India’s Copyright Act, an assignment that does not state a duration is treated as lasting five years, and if no territory is stated it covers India only. A lawyer can confirm how that applies here.',
    },
  }),
  rule({
    id: 'payment_terms',
    title: 'When and how payment is due',
    patterns: [
      /\bpayment\s+(?:terms?|schedule)\b/i,
      /\b(?:invoices?|fees?|amounts?|rent)\b[^.]{0,60}\b(?:due|payable)\b[^.]{0,40}\bwithin\b/i,
      /\bpay(?:able|ment)?\b[^.]{0,50}\bwithin\s+(?:\d+|\w+)\s*(?:\(\d+\)\s*)?(?:days?|weeks?)\b/i,
      /\bnet\s*\d{2}\b/i,
    ],
    severity: 'info',
    explain: 'Sets when money must be paid, how, and to whom.',
    why: 'Unclear or slow payment terms are a leading cause of disputes; deadlines here often trigger late fees.',
    suggest: 'Note every due date and payment method, and get payment milestones in writing.',
    question: 'What are the exact due dates, and what happens if a payment is disputed or late?',
  }),
  rule({
    id: 'late_fee_penalty',
    title: 'Late fees, interest or penalties',
    patterns: [
      /\blate\s+(?:fee|payment\s+(?:fee|charge)|charges?)\b/i,
      /\binterest\s+(?:at|of)\s+[^.]{0,30}%/i,
      /\b\d+(?:\.\d+)?\s*%\s*(?:per\s+(?:month|annum|year|week|day)|monthly|p\.?a\.?)\b/i,
      /\bpenalt(?:y|ies)\b/i,
      /\bliquidated\s+damages\b/i,
    ],
    severity: 'medium',
    benefits: DRAFTER,
    aggravators: [/\b(?:[3-9]|\d{2,})(?:\.\d+)?\s*%\s*(?:per\s+(?:month|week|day)|monthly)\b/i, /\bper\s+day\b/i],
    explain: 'Extra money is charged if you pay late or break a term.',
    why: 'High or compounding charges can quickly exceed the original amount.',
    suggest: 'Check the rate, whether there is a grace period, and ask for a reasonable cap.',
    question: 'Is there a grace period, and is the total penalty capped?',
    jurisdiction: {
      IN: 'In India, courts (Section 74, Contract Act) generally award only reasonable compensation up to the stated amount, not the full penalty as written.',
      UK: 'In the UK, penalty clauses that go beyond protecting a legitimate interest may be unenforceable.',
    },
  }),
  rule({
    id: 'security_deposit',
    title: 'Security deposit',
    patterns: [/\b(?:security\s+deposit|caution\s+(?:money|deposit)|refundable\s+deposit|advance\s+deposit)\b/i],
    severity: 'low',
    benefits: ['landlord'],
    explain: 'Money you pay upfront as security, meant to be returned at the end of the agreement.',
    why: 'The rules on deductions and how fast it must be returned decide whether you actually get it back.',
    suggest: 'Get the deposit amount, allowed deductions and refund deadline in writing, and photograph the condition at move-in.',
    question: 'What deductions are allowed and within how many days is the deposit returned?',
    jurisdiction: {
      IN: 'The Model Tenancy Act, 2021 suggests capping residential deposits at two months’ rent, but it applies only where a state has adopted it.',
      UK: 'In England, tenancy deposits must generally be protected in a government-approved scheme.',
      US: 'Most US states limit deposits and set a deadline for returning them.',
    },
  }),
  rule({
    id: 'rent_escalation',
    title: 'Rent or fees can go up',
    patterns: [
      /\b(?:rent|rental|fees?|charges?)\b[^.]{0,80}\b(?:increase[ds]?|escalat\w+|enhance\w*|revis\w+)\b/i,
      /\b(?:annual|yearly)\s+(?:increase|escalation|hike)\b/i,
      /\b\d+(?:\.\d+)?\s*%\s*(?:increase|hike|escalation|enhancement)\b/i,
    ],
    severity: 'medium',
    benefits: ['landlord'],
    explain: 'The amount you pay can increase during the term.',
    why: 'Uncapped or discretionary increases make your costs unpredictable.',
    suggest: 'Ask for a fixed percentage cap and a fixed schedule, with advance written notice.',
    question: 'By how much and how often can the amount increase?',
  }),
  rule({
    id: 'lock_in',
    title: 'Minimum commitment (lock-in)',
    patterns: [
      /\block[- ]?in\b/i,
      /\bminimum\s+(?:commitment|term|period|stay|tenure)\b/i,
      /\bnot\s+(?:be\s+)?(?:entitled\s+to|permitted\s+to|able\s+to)\s+(?:terminate|vacate|leave)\b[^.]{0,80}\b(?:before|until|prior)\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['tenant', 'employee', 'consumer']),
    benefits: ['landlord', 'employer'],
    explain: 'For a minimum period you cannot leave without paying a penalty or the remaining amount.',
    why: 'If your situation changes, you could still owe money for the whole lock-in period.',
    suggest: 'Ask for a shorter lock-in or a fixed early-exit fee (e.g. one month) instead of the full remaining amount.',
    question: 'What exactly do I owe if I leave during the lock-in period?',
  }),
  rule({
    id: 'early_exit_charge',
    title: 'Fee for leaving or paying early',
    patterns: [
      /\b(?:early\s+termination|cancell?ation|exit|foreclosure|pre-?closure|prepayment|break)\s+(?:fee|charge|penalty|payment|premium)s?\b/i,
    ],
    severity: 'medium',
    explain: 'You pay an extra charge if you end the agreement or repay early.',
    why: 'The charge may be large relative to what you are actually leaving behind.',
    suggest: 'Ask for the exact formula and whether it reduces over time.',
    question: 'How is the early-exit charge calculated?',
  }),
  rule({
    id: 'no_refund',
    title: 'No refunds / money is forfeited',
    patterns: [/\bnon[- ]refundable\b/i, /\bno\s+refunds?\b/i, /\bnot\s+(?:be\s+)?refund\w+/i, /\bforfeit\w*/i],
    severity: 'medium',
    benefits: DRAFTER,
    plain: true, // the trigger words ("non-refundable", "forfeit") are the rule itself, not aggravation
    explain: 'Money you pay may not be returned, or can be kept by the other side in some situations.',
    why: 'You could lose money even if the service is not delivered or you have a good reason to cancel.',
    suggest: 'Ask when refunds are possible (e.g. non-delivery, cancellation within a short window).',
    question: 'In what situations, if any, can I get a refund?',
  }),
  rule({
    id: 'recurring_payments',
    title: 'Recurring charges to your account',
    patterns: [
      /\b(?:recurring|standing|auto[- ]?debit|automatic)\s+(?:payments?|charges?|billing|debits?|instructions?|mandates?)\b/i,
      /\bauthori[sz]e\w*\b[^.]{0,80}\b(?:charge|debit|bill)\b[^.]{0,60}\b(?:card|account|bank|payment\s+method)\b/i,
      /\b(?:NACH|ECS|e-?mandate|direct\s+debit)\b/i,
    ],
    severity: 'medium',
    explain: 'You allow the other side to take payments from your card or bank account automatically.',
    why: 'Charges can continue after you stop using the service, and disputing them can be hard.',
    suggest: 'Note the amount and date of each charge, and check how to cancel the mandate.',
    question: 'How do I stop the automatic payments, and will I be notified before each charge?',
    jurisdiction: {
      IN: 'In India, RBI rules require advance notification and extra authentication for many recurring card payments.',
    },
  }),
  rule({
    id: 'data_sharing',
    title: 'Your personal data may be shared or sold',
    patterns: [
      /\b(?:share|disclose|transfer|provide|sell|sale\s+of)\b[^.]{0,80}\b(?:personal\s+(?:data|information)|your\s+(?:data|information)|user\s+data)\b[^.]{0,80}\b(?:third[- ]part(?:y|ies)|affiliates?|partners?|advertisers?|marketing)/i,
      /\b(?:third[- ]part(?:y|ies)|affiliates?|partners?|advertisers?)\b[^.]{0,80}\b(?:personal\s+(?:data|information)|your\s+(?:data|information))/i,
      /\bsell\w*\s+(?:your\s+)?(?:personal\s+)?(?:data|information)\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['consumer']),
    explain: 'Your personal information can be passed to other companies, possibly for marketing.',
    why: 'Once shared, you lose control over how your data is used, stored or sold.',
    suggest: 'Look for an opt-out for marketing/sharing and a way to request deletion of your data.',
    question: 'Who exactly receives my data, and how can I opt out or have it deleted?',
    jurisdiction: {
      EU: 'Under the GDPR you have rights to access, correct, delete and object to processing of your personal data.',
      IN: 'India’s Digital Personal Data Protection Act, 2023 requires clear consent and lets you withdraw it; check which provisions apply to you.',
      US: 'Some US states (e.g. California) give you a right to opt out of the sale of your personal information.',
    },
  }),
  rule({
    id: 'broad_license',
    title: 'Broad licence over your content',
    patterns: [
      /\b(?:grants?|hereby\s+grant)\b[^.]{0,60}\b(?:perpetual|irrevocable|worldwide|royalty[- ]free|sublicensable)\b[^.]{0,80}\blicen[sc]e\b/i,
      /\blicen[sc]e\b[^.]{0,60}\b(?:perpetual|irrevocable|worldwide|royalty[- ]free)\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['consumer', 'freelancer']),
    explain: 'You allow the other side to use, copy or reuse your content, often forever and anywhere.',
    why: 'Even if you still “own” the content, they may keep using it after you leave.',
    suggest: 'Ask to limit the licence to operating the service and to end when you delete your content.',
    question: 'Does this licence end if I delete my content or close my account?',
  }),
  rule({
    id: 'open_ended_work',
    title: 'Unlimited revisions or open-ended scope',
    patterns: [
      /\bunlimited\s+(?:revisions?|changes|amendments?|iterations?|rounds)\b/i,
      /\buntil\s+(?:the\s+)?(?:client|customer|company)\s+is\s+(?:fully\s+)?satisfied\b/i,
      /\bto\s+the\s+(?:client|customer|company)['’]s\s+(?:sole\s+)?satisfaction\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['freelancer']),
    benefits: ['client'],
    explain: 'There is no limit on how much rework the other side can ask for before the job counts as finished.',
    why: 'Endless changes can turn a fixed fee into unpaid work, and payment may be held back until they are “satisfied”.',
    suggest: 'Cap the number of revision rounds, define what “done” means, and charge for extra changes.',
    question: 'How many revision rounds are included, and what happens to payment if the client keeps asking for changes?',
  }),
  rule({
    id: 'assignment',
    title: 'Contract can be passed to someone else',
    patterns: [
      /\b(?:may|can|is\s+free\s+to|shall\s+be\s+entitled\s+to)\s+(?:freely\s+)?(?:assign|transfer|sub-?contract)\b[^.]{0,80}\b(?:without|at\s+any\s+time)/i,
    ],
    // "Neither party may assign … without consent" *restricts* assignment: not a risk.
    exclude: [/\b(?:neither\s+party|no\s+party|(?:shall|may|can)\s+not|cannot)\s+(?:\w+\s+){0,2}?(?:assign|transfer|sub-?contract)/i],
    severity: 'medium',
    explain: 'One side can hand the agreement, or their duties, to another company or person.',
    why: 'You could end up dealing with a party you did not choose and may not trust.',
    suggest: 'Ask that transfers need your written consent, or at least notice and a right to exit.',
    question: 'Can I object if the agreement is transferred to someone else?',
  }),
  rule({
    id: 'exclusivity',
    title: 'Exclusive engagement / no other work',
    patterns: [
      /\bexclusiv\w+\b[^.]{0,80}\b(?:services?|engage\w*|work|basis)\b/i,
      /\bshall\s+not\b[^.]{0,80}\b(?:work\s+for|provide\s+services\s+to|engage\s+with)\b[^.]{0,40}\b(?:any\s+other|third)/i,
      /\bshall\s+not\b[^.]{0,60}\b(?:any\s+other|other)\s+(?:employment|business|work|engagement|assignment)/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['freelancer']),
    benefits: ['employer', 'client'],
    explain: 'You may not take other jobs or clients while this agreement is running.',
    why: 'It limits your ability to earn income elsewhere, which matters most if payment is irregular.',
    suggest: 'Ask to restrict it to direct competitors, or to be paid a retainer that reflects the exclusivity.',
    question: 'Does “exclusive” stop me from side work or other clients that do not compete?',
  }),
  rule({
    id: 'employment_bond',
    title: 'Bond, training cost or repayment on leaving',
    patterns: [
      /\b(?:service|training|employment)\s+bond\b/i,
      /\b(?:reimburse|repay|refund|recover)\b[^.]{0,80}\b(?:training|joining|relocation|sign[- ]?on)\b/i,
      /\bminimum\s+(?:service|tenure|period\s+of\s+service)\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['employee']),
    benefits: ['employer'],
    explain: 'If you leave before a set period you must repay money (training, joining bonus, relocation) or pay a sum.',
    why: 'You may owe a large amount that makes leaving a bad job financially difficult.',
    suggest: 'Ask that repayment reduces each month you stay and is limited to the actual cost.',
    question: 'How is the repayment amount calculated, and does it reduce over time?',
    jurisdiction: {
      IN: 'In India, courts generally enforce such clauses only to the extent of reasonable, actual loss (Section 74, Contract Act).',
    },
  }),
  rule({
    id: 'waiver_of_rights',
    title: 'You give up rights or claims',
    patterns: [
      /\bwaive\w*\b[^.]{0,80}\b(?:any|all)\s+(?:right|claim|remed)\w*/i,
      /\bwaiver\s+of\s+(?:rights?|claims?)\b/i,
      /\breleas\w+\b[^.]{0,60}\b(?:from|of)\s+(?:any\s+and\s+all|all)\s+(?:claims|liab)/i,
    ],
    exclude: [
      /\b(?:no\s+waiver|failure\s+(?:or\s+delay\s+)?to\s+(?:enforce|exercise)|not\s+(?:constitute|operate\s+as)\s+a\s+waiver|shall\s+not\s+be\s+(?:deemed|construed)\s+(?:as\s+)?a\s+waiver)/i,
      /\b(?:jury|class[- ]action)\b/i, // reported separately by class_action_waiver
    ],
    severity: 'high',
    benefits: DRAFTER,
    explain: 'You give up legal rights or claims you would otherwise have.',
    why: 'Once waived, you generally cannot bring these claims later, even if you discover a problem.',
    suggest: 'Ask to narrow it to specific, known claims and to remove waivers of rights the law protects.',
    question: 'Exactly which rights am I giving up, and can I still make a claim for future problems?',
  }),
  rule({
    id: 'personal_guarantee',
    title: 'Joint or personal responsibility for the whole amount',
    patterns: [
      /\bpersonal\s+guarant\w+/i,
      /\bguarantor\b/i,
      /\bjointly\s+and\s+severally\b/i,
      /\bjoint\s+and\s+several\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['borrower', 'small_business']),
    benefits: ['landlord'],
    explain: 'You (or a guarantor) can be made to pay the whole debt or obligation, not just your share.',
    why: 'If a co-signer, co-tenant or the business fails to pay, you can be chased for everything.',
    suggest: 'Ask to limit the guarantee to a fixed amount and time, or to replace it with a security deposit.',
    question: 'What is the maximum I could owe, and when does the guarantee end?',
  }),
  rule({
    id: 'landlord_entry',
    title: 'Landlord entry without proper notice',
    patterns: [
      /\b(?:landlord|lessor|owner)\b[^.]{0,80}\b(?:enter|inspect|access)\b[^.]{0,80}\b(?:at\s+any\s+time|without\s+(?:prior\s+)?notice|any\s+time)/i,
      /\b(?:enter|inspect)\b[^.]{0,60}\b(?:premises|property|unit)\b[^.]{0,60}\b(?:at\s+any\s+time|without\s+(?:prior\s+)?(?:notice|consent))/i,
    ],
    severity: 'high',
    benefits: ['landlord'],
    explain: 'The landlord can enter your home whenever they like, without telling you first.',
    why: 'It undermines your privacy and quiet enjoyment of the home you are paying for.',
    suggest: 'Ask for reasonable advance notice (e.g. 24 hours) except in genuine emergencies.',
    question: 'How much notice must the landlord give before entering?',
    jurisdiction: {
      UK: 'In England, landlords usually need to give reasonable (often 24 hours’) notice before entering a rented home.',
      US: 'Many US states require advance notice before a landlord may enter, except in emergencies.',
    },
  }),
  rule({
    id: 'repairs_maintenance',
    title: 'Who pays for repairs',
    patterns: [
      /\b(?:tenant|lessee)\b[^.]{0,60}\b(?:shall|will|must|agrees\s+to)\b[^.]{0,60}\b(?:bear|pay|be\s+responsible\s+for)\b[^.]{0,60}\b(?:repairs?|maintenance|damage)/i,
      /\b(?:all|any)\s+(?:repairs?|maintenance)\b[^.]{0,60}\b(?:tenant|lessee)\b/i,
    ],
    severity: 'medium',
    benefits: ['landlord'],
    explain: 'The tenant is made responsible for repair and maintenance costs.',
    why: 'If this includes structural or major repairs, you could face large unexpected bills for problems not of your making.',
    suggest: 'Limit your duty to minor day-to-day repairs and damage you cause; structural repairs should stay with the owner.',
    question: 'Which repairs am I responsible for, and is there a cost limit?',
  }),
  rule({
    id: 'eviction_forfeiture',
    title: 'Eviction or immediate move-out',
    patterns: [
      /\bevict\w*/i,
      /\bre-?enter\b/i,
      /\bvacate\b[^.]{0,80}\b(?:forthwith|immediately|within\s+(?:\d+|\w+)\s*(?:days?|hours?))/i,
      /\bforfeiture\s+of\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['tenant']),
    benefits: ['landlord'],
    explain: 'Sets out when you can be made to leave, sometimes very quickly.',
    why: 'A short or one-sided move-out trigger can leave you without housing and with lost deposits or advance rent.',
    suggest: 'Check the reasons allowed, the notice required and whether a court process must be followed.',
    question: 'On what grounds can I be required to leave, and with how much notice?',
    jurisdiction: {
      IN: 'In India, a landlord generally cannot evict by force; a court or rent authority process is normally required.',
      US: 'In every US state, evictions require a formal legal process; “self-help” lockouts are generally unlawful.',
      UK: 'In England, landlords must follow strict legal procedures to end a tenancy.',
    },
  }),
  rule({
    id: 'variable_interest',
    title: 'Interest rate can change',
    patterns: [
      /\b(?:floating|variable)\s+(?:interest|rate)/i,
      /\binterest\s+rate\b[^.]{0,60}\b(?:reset|revised?|reviewed|changed?|varied)\b/i,
      /\bcompound\w*\s+(?:interest|monthly|quarterly)/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['borrower']),
    explain: 'The interest you pay can change over time or be charged on unpaid interest.',
    why: 'Your monthly payment or total cost can rise well above what you first expected.',
    suggest: 'Ask what the rate is linked to, how often it can change, and see a repayment schedule.',
    question: 'What benchmark drives the rate, and what is the worst-case repayment?',
  }),
  rule({
    id: 'acceleration_default',
    title: 'Full amount due if you default',
    patterns: [
      /\b(?:accelerat\w+|entire\s+outstanding|all\s+sums)\b[^.]{0,80}\b(?:immediately|forthwith)\s+(?:due|payable)/i,
      /\bevent\s+of\s+default\b/i,
      /\bdefault\b[^.]{0,80}\b(?:entire|whole|full)\s+(?:amount|outstanding|balance)\b/i,
    ],
    severity: 'medium',
    roleSeverity: onlyFor('high', ['borrower', 'small_business']),
    explain: 'If you miss a payment or break a term, the whole remaining amount can become due immediately.',
    why: 'A single missed instalment could trigger a demand for the entire balance, plus charges.',
    suggest: 'Ask for a written warning and a cure period (e.g. 15–30 days) before this can happen.',
    question: 'What counts as default, and do I get a chance to fix it first?',
  }),
  rule({
    id: 'force_majeure',
    title: 'Force majeure (unforeseeable events)',
    patterns: [/\bforce\s+majeure\b/i, /\bact\s+of\s+god\b/i],
    severity: 'info',
    explain: 'Excuses a party from its obligations when extraordinary events (disasters, war, pandemics) prevent performance.',
    why: 'Check whether it excuses payment duties and what happens if the event lasts a long time.',
    suggest: 'Make sure it applies to both sides and lets either side exit after an extended event.',
    question: 'Does force majeure excuse payment, and can I end the agreement if it lasts long?',
  }),
  rule({
    id: 'entire_agreement',
    title: 'Only what’s written counts',
    patterns: [/\bentire\s+agreement\b/i, /\bsupersedes?\s+all\s+prior\b/i, /\bno\s+(?:oral|verbal)\s+(?:agreements?|representations?|promises?)\b/i],
    severity: 'low',
    explain: 'Anything promised verbally or by message that is not in this document may not count.',
    why: 'If someone promised you something (a repair, a discount, a start date) but it is not written here, you may not be able to rely on it.',
    suggest: 'Get every promise you are relying on written into the document before you sign.',
    question: 'Can we add the promises made to me during discussions into the document?',
  }),
];

export const RULES_BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map((entry) => [entry.id, entry]));
