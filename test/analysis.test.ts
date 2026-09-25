import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { analyzeOffline, computeRisk, mergeSharedQuotes, prepareDocument, scanClauses } from '../src/shared/core/analyze.js';
import { detectDocumentType, findMissingItems, legalSignalDensity } from '../src/shared/core/doctype.js';
import { extractKeyFacts, extractValueSummary } from '../src/shared/core/facts.js';
import { context, loadSample } from './helpers.js';
import type { Clause } from '../src/shared/types.js';
import type { Risk } from '../src/shared/options.js';

const byCategory = (clauses: Clause[], category: string) => clauses.find((clause) => clause.category === category);

describe('rule engine: rental agreement', () => {
  const doc = loadSample('rental-agreement');
  const tenant = analyzeOffline(doc, context({ role: 'tenant', stage: 'before_signing', jurisdiction: 'IN' }));

  it('identifies the document type', () => {
    assert.equal(tenant.document.type, 'rental');
    assert.ok(tenant.document.confidence > 0.6);
  });

  it('flags the one-sided terms a tenant should worry about', () => {
    for (const category of ['unilateral_termination', 'landlord_entry', 'lock_in', 'indemnity', 'late_fee_penalty', 'eviction_forfeiture']) {
      assert.equal(byCategory(tenant.clauses, category)?.risk, 'high', `${category} should be high for a tenant`);
    }
  });

  it('escalates an arbitrator appointed by the counterparty', () => {
    const arbitration = byCategory(tenant.clauses, 'arbitration');
    assert.ok(arbitration);
    assert.equal(arbitration.risk, 'high');
    assert.match(arbitration.explanation, /appointed by the landlord/);
  });

  it('attaches a jurisdiction note only for the chosen jurisdiction', () => {
    assert.match(byCategory(tenant.clauses, 'arbitration')?.jurisdictionNote ?? '', /Arbitration and Conciliation Act/);
    const unspecified = analyzeOffline(doc, context({ role: 'tenant' }));
    assert.equal(byCategory(unspecified.clauses, 'arbitration')?.jurisdictionNote, '');
  });

  it('reports what the agreement fails to say', () => {
    assert.ok(tenant.missing.some((item) => /security deposit/i.test(item.item)));
  });

  it('extracts amounts and periods without mistaking "three months\' rent" for a period', () => {
    const facts = Object.fromEntries(tenant.keyFacts.map((fact) => [fact.label, fact.value]));
    assert.equal(facts.Rent, 'Rs. 18,000');
    assert.equal(facts['Security deposit'], 'Rs. 54,000');
    assert.equal(facts['Lock-in period'], '6 months');
    assert.ok(!tenant.keyFacts.some((fact) => fact.kind === 'duration' && fact.value === '3 months'));
  });

  it('quotes are exact substrings of the document', () => {
    for (const clause of tenant.clauses) assert.ok(doc.text.includes(clause.quote), `quote not verbatim: ${clause.quote}`);
  });
});

describe('role-aware severity', () => {
  const doc = loadSample('rental-agreement');

  it('rates the same clause differently for landlord and tenant', () => {
    const asTenant = byCategory(scanClauses(doc, context({ role: 'tenant' })), 'landlord_entry');
    const asLandlord = byCategory(scanClauses(doc, context({ role: 'landlord' })), 'landlord_entry');
    assert.ok(asTenant && asLandlord);
    assert.equal(asTenant.risk, 'high');
    assert.equal(asLandlord.risk, 'low');
    assert.match(asLandlord.explanation, /works in your favour/);
  });

  it('lowers the overall risk for the party the contract favours', () => {
    const tenant = analyzeOffline(doc, context({ role: 'tenant' }));
    const landlord = analyzeOffline(doc, context({ role: 'landlord' }));
    assert.equal(tenant.risk.level, 'high');
    assert.notEqual(landlord.risk.level, 'high');
  });

  it('treats IP assignment as high for a freelancer but favourable for the client', () => {
    const contract = loadSample('freelance-contract');
    assert.equal(byCategory(scanClauses(contract, context({ role: 'freelancer' })), 'ip_assignment')?.risk, 'high');
    assert.equal(byCategory(scanClauses(contract, context({ role: 'client' })), 'ip_assignment')?.risk, 'low');
  });

  it('catches unlimited revisions for freelancers', () => {
    const contract = loadSample('freelance-contract');
    assert.equal(byCategory(scanClauses(contract, context({ role: 'freelancer' })), 'open_ended_work')?.risk, 'high');
  });
});

describe('false-positive control', () => {
  it('ignores "no waiver" boilerplate', () => {
    const doc = prepareDocument('11. General. The failure of either party to enforce any right under this agreement shall not constitute a waiver of any right or remedy, and this agreement is binding on both parties.');
    assert.equal(byCategory(scanClauses(doc, context()), 'waiver_of_rights'), undefined);
  });

  it('does not treat an invoice payment window as a legal-notice deadline', () => {
    const doc = prepareDocument('Each invoice is payable within 60 days of receipt of the invoice by the Client, and payment shall be made by bank transfer.');
    assert.equal(byCategory(scanClauses(doc, context()), 'deadline_or_threat'), undefined);
  });

  it('does not flag "shall not assign without consent" as a free-assignment clause', () => {
    const doc = prepareDocument('Neither party may assign this agreement without the prior written consent of the other party, and any attempt to do so is void.');
    assert.equal(byCategory(scanClauses(doc, context()), 'assignment'), undefined);
  });
});

describe('document types', () => {
  it('recognises notices, terms and services agreements from their titles', () => {
    assert.equal(detectDocumentType(loadSample('legal-notice').text).id, 'notice');
    assert.equal(detectDocumentType(loadSample('app-terms').text).id, 'terms');
    assert.equal(detectDocumentType(loadSample('freelance-contract').text).id, 'services');
  });

  it('falls back to "other" for unrelated text', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
    assert.equal(detectDocumentType(text).id, 'other');
    assert.ok(legalSignalDensity(text) < 0.012);
  });

  it('warns when text does not look like a legal document', () => {
    const result = analyzeOffline(prepareDocument('The quick brown fox jumps over the lazy dog. '.repeat(20)), context());
    assert.ok(result.warnings.some((warning) => /does not look much like/.test(warning)));
  });

  it('lists expected-but-missing clauses per type', () => {
    const missing = findMissingItems('This is a services agreement with a fee.', 'services');
    assert.ok(missing.some((item) => /scope of work/i.test(item.item)));
  });
});

describe('risk scoring', () => {
  const clause = (risk: Risk) => ({ risk });
  it('uses transparent level rules', () => {
    assert.equal(computeRisk([]).level, 'low');
    assert.equal(computeRisk([clause('medium')]).level, 'low');
    assert.equal(computeRisk([clause('medium'), clause('medium')]).level, 'medium');
    assert.equal(computeRisk([clause('high')]).level, 'medium');
    assert.equal(computeRisk([clause('high'), clause('high')]).level, 'high');
  });

  it('keeps the meter informative (soft cap, monotonic, below 100)', () => {
    const few = computeRisk([clause('high')]).score;
    const many = computeRisk(Array.from({ length: 6 }, () => clause('high'))).score;
    assert.ok(few > 0 && few < many && many < 100);
  });

  it('counts a sentence that trips several rules only once', () => {
    const doc = loadSample('legal-notice');
    const raw = scanClauses(doc, context({ role: 'tenant', stage: 'notice' }));
    const merged = mergeSharedQuotes(raw);
    assert.ok(merged.length < raw.length);
    assert.equal(new Set(merged.map((c) => c.quote)).size, merged.length);
    assert.ok(merged.some((c) => c.related.length > 0));
  });
});

describe('stage-aware next steps', () => {
  const doc = loadSample('legal-notice');

  it('puts the deadline first for a notice', () => {
    const result = analyzeOffline(doc, context({ role: 'tenant', stage: 'notice', jurisdiction: 'IN' }));
    assert.match(result.nextSteps[0].step, /date you received/i);
    assert.equal(result.nextSteps[0].when, 'now');
    assert.ok(result.resources.some((resource) => /NALSA/.test(resource.name)));
  });

  it('advises against signing when a pre-signing document is high risk', () => {
    const result = analyzeOffline(loadSample('rental-agreement'), context({ role: 'tenant', stage: 'before_signing' }));
    assert.match(result.nextSteps[0].step, /Do not sign yet/);
  });

  it('switches to record-keeping advice once signed', () => {
    const result = analyzeOffline(loadSample('rental-agreement'), context({ role: 'tenant', stage: 'signed' }));
    assert.match(result.nextSteps[0].step, /signed copy/i);
  });
});

describe('facts', () => {
  it('summarises comparable values', () => {
    assert.equal(extractValueSummary('by giving thirty (30) days written notice'), '30 days');
    assert.equal(extractValueSummary('a late charge of 3% per month'), '3%');
    assert.equal(extractValueSummary('a fee of Rs. 1,20,000.'), 'Rs. 1,20,000');
    assert.equal(extractValueSummary('nothing numeric here'), '');
  });

  it('labels amounts from surrounding words', () => {
    const facts = extractKeyFacts('The sum of Rs. 54,000 is outstanding and due from you within fifteen (15) days of receipt of this notice.');
    assert.ok(facts.some((fact) => fact.label === 'Amount outstanding' && fact.value === 'Rs. 54,000'));
    assert.ok(facts.some((fact) => fact.label === 'Response deadline' && fact.value === '15 days'));
  });
});

describe('efficiency and robustness', () => {
  it('analyses a maximum-size document quickly (no catastrophic regex backtracking)', () => {
    const big = `${loadSample('rental-agreement').text}\n\n`.repeat(58);
    assert.ok(big.length > 140_000);
    const started = performance.now();
    analyzeOffline(prepareDocument(big), context({ role: 'tenant' }));
    assert.ok(performance.now() - started < 4000, 'analysis of a ~150k-character document should finish in well under 4s');
  });

  it('survives pathological input without hanging', () => {
    const hostile = `${'terminate '.repeat(4000)}${'notice, '.repeat(4000)}${'a'.repeat(30000)}`;
    const started = performance.now();
    analyzeOffline(prepareDocument(hostile), context());
    assert.ok(performance.now() - started < 3000);
  });
});
