import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { answerOffline, retrievePassages } from '../src/shared/core/ask.js';
import { compareOffline } from '../src/shared/core/compare.js';
import { diffSegments, wordDiff } from '../src/shared/core/diff.js';
import { context, loadSample } from './helpers.js';

const tenant = context({ role: 'tenant', stage: 'before_signing', jurisdiction: 'IN' });

describe('word diff', () => {
  it('marks removed and added words', () => {
    const parts = wordDiff('pay within 30 days of receipt', 'pay within 60 days of invoice');
    assert.deepEqual(
      parts.map((part) => [part.type, part.text]),
      [
        ['same', 'pay within'],
        ['del', '30'],
        ['ins', '60'],
        ['same', 'days of'],
        ['del', 'receipt'],
        ['ins', 'invoice'],
      ],
    );
  });

  it('degrades gracefully for very long paragraphs', () => {
    const long = 'word '.repeat(600).trim();
    assert.equal(wordDiff(long, `${long} extra`).length, 2);
  });
});

describe('diffSegments', () => {
  it('pairs revised clauses and reports removed and added ones', () => {
    const a = [{ label: 'Clause 1', text: 'The Landlord may enter the Premises at any time without notice.' }, { label: 'Clause 2', text: 'Rent is payable monthly in advance.' }];
    const b = [{ label: 'Clause 1', text: 'The Landlord may enter the Premises after 24 hours notice.' }, { label: 'Clause 9', text: 'A brand new clause about pets and parking.' }];
    const changes = diffSegments(a, b);
    assert.deepEqual(changes.map((change) => change.type).sort(), ['added', 'modified', 'removed']);
  });

  it('ignores identical clauses', () => {
    const same = [{ label: 'Clause 1', text: 'Identical text in both documents.' }];
    assert.deepEqual(diffSegments(same, same), []);
  });
});

describe('compareOffline', () => {
  const original = loadSample('rental-agreement');
  const revised = loadSample('rental-agreement-revised');
  const result = compareOffline(original, revised, tenant, { a: 'Original', b: 'Revised' });

  it('favours the revised draft for the tenant and explains why', () => {
    assert.equal(result.verdict.favors, 'b');
    assert.ok(result.verdict.reasons.length >= 2);
    assert.ok(result.documents.a.risk.score >= result.documents.b.risk.score);
  });

  it('aligns clauses by category and shows what only one side has', () => {
    const entry = result.rows.find((row) => row.category === 'landlord_entry');
    assert.ok(entry);
    assert.equal(entry.difference, 'only_a');
    assert.equal(entry.better, 'b');
    const lateFee = result.rows.find((row) => row.category === 'late_fee_penalty');
    assert.ok(lateFee);
    assert.equal(lateFee.difference, 'differs');
    assert.match(lateFee.comment, /3% vs Revised: 1%/);
  });

  it('lists differing key figures side by side', () => {
    const rent = result.facts.find((fact) => fact.label === 'Rent');
    assert.ok(rent);
    assert.deepEqual([rent.a, rent.b, rent.differs], ['Rs. 18,000', 'Rs. 19,500', true]);
    const deposit = result.facts.find((fact) => fact.label === 'Security deposit');
    assert.ok(deposit);
    assert.equal(deposit.b, 'Rs. 39,000');
  });

  it('produces a change list with word-level diffs', () => {
    assert.ok(result.changes.some((change) => change.type === 'modified' && change.parts?.some((part) => part.type === 'ins')));
  });

  it('calls identical documents equal', () => {
    const same = compareOffline(original, original, tenant, { a: 'A', b: 'B' });
    assert.equal(same.verdict.favors, 'neither');
    assert.equal(same.changes.length, 0);
  });

  it('warns when the documents are different kinds', () => {
    const mixed = compareOffline(original, loadSample('app-terms'), tenant, { a: 'Lease', b: 'Terms' });
    assert.ok(mixed.warnings.some((warning) => /different kinds of documents/.test(warning)));
  });
});

describe('offline question answering', () => {
  const doc = loadSample('rental-agreement');
  const top = (question: string) => {
    const result = retrievePassages(doc.segments, question, 1)[0]?.segment;
    assert.ok(result);
    return result;
  };

  it('maps everyday wording onto contract wording', () => {
    assert.equal(top('What happens if I want to leave early?').heading, 'Termination');
    assert.equal(top('Can the landlord enter my flat?').heading, 'Inspection');
    assert.equal(top('Who pays for repairs?').heading, 'Repairs and Maintenance');
  });

  it('returns verifiable excerpts, labelled honestly as keyword matches', () => {
    const answer = answerOffline(doc.segments, 'How do I get my deposit back?');
    assert.equal(answer.mode, 'offline');
    assert.ok(answer.citations.length > 0);
    assert.ok(answer.citations.every((citation) => citation.verified));
    assert.match(answer.caveats.join(' '), /keywords only/);
  });

  it('says so when nothing relevant exists', () => {
    const answer = answerOffline(doc.segments, 'What is the airspeed velocity of an unladen swallow?');
    assert.equal(answer.confidence, 'not_found');
    assert.deepEqual(answer.citations, []);
  });
});
