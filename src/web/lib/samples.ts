/**
 * Fictional sample documents. Choosing one also presets the situation, which
 * shows how role, stage and jurisdiction change the analysis.
 */

import type { Context } from '../../shared/options.js';

export interface Sample {
  id: string;
  label: string;
  blurb: string;
  file: string;
  context: Partial<Context>;
}

export const SAMPLES: readonly Sample[] = [
  { id: 'rental', label: 'Rental agreement', blurb: 'A tenant in India, before signing', file: '/samples/rental-agreement.txt', context: { role: 'tenant', stage: 'before_signing', jurisdiction: 'IN' } },
  { id: 'freelance', label: 'Freelance contract', blurb: 'A designer, before signing', file: '/samples/freelance-contract.txt', context: { role: 'freelancer', stage: 'before_signing', jurisdiction: 'IN' } },
  { id: 'terms', label: 'App terms of service', blurb: 'A US subscriber', file: '/samples/app-terms.txt', context: { role: 'consumer', stage: 'understand', jurisdiction: 'US' } },
  { id: 'notice', label: 'Legal notice', blurb: 'Rent arrears, deadline running', file: '/samples/legal-notice.txt', context: { role: 'tenant', stage: 'notice', jurisdiction: 'IN' } },
];

export const COMPARE_SAMPLE = {
  a: { label: 'Original draft', file: '/samples/rental-agreement.txt' },
  b: { label: 'Revised draft', file: '/samples/rental-agreement-revised.txt' },
  context: { role: 'tenant', stage: 'before_signing', jurisdiction: 'IN' } satisfies Partial<Context>,
};
