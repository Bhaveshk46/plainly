/** Suggested follow-up questions, chosen from what the analysis actually found. */

import type { Analysis } from '../../shared/types.js';

const BY_CATEGORY: Readonly<Record<string, string>> = {
  deadline_or_threat: 'What happens if I miss the deadline?',
  termination_notice: 'How can I end this agreement, and how much notice is needed?',
  unilateral_termination: 'Can the other side end this agreement without a reason?',
  lock_in: 'What happens if I leave early?',
  landlord_entry: 'Can the landlord come in without telling me?',
  security_deposit: 'How do I get my deposit back?',
  auto_renewal: 'How do I stop this from renewing automatically?',
  ip_assignment: 'Who owns the work I create?',
  late_fee_penalty: 'What happens if I pay late?',
  payment_terms: 'When exactly do I have to pay?',
  non_compete: 'Can I work for a competitor afterwards?',
  data_sharing: 'Who can see or use my personal data?',
  arbitration: 'Can I still take this to court?',
  indemnity: 'What could I be made to pay if something goes wrong?',
  limitation_of_liability: 'How much can I recover if the other side causes me a loss?',
  unilateral_changes: 'Can they change the terms after I agree?',
  repairs_maintenance: 'Who pays for repairs?',
  no_refund: 'Can I ever get a refund?',
  open_ended_work: 'Is there a limit to how many changes they can ask for?',
};

const GENERIC = ['What are the biggest risks for me in this document?', 'What must I do, and by when?'];

/** Up to `limit` questions, most important first. */
export function suggestQuestions(analysis: Pick<Analysis, 'clauses'>, limit = 6): string[] {
  if (limit <= 0) return [];
  const questions: string[] = [];
  for (const clause of analysis.clauses) {
    const question = BY_CATEGORY[clause.category];
    if (question && !questions.includes(question)) questions.push(question);
    if (questions.length >= limit - 1) break;
  }
  for (const question of GENERIC) if (questions.length < limit && !questions.includes(question)) questions.push(question);
  return questions;
}
