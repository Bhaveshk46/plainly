import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  findQuoteRange,
  foldForMatch,
  locateQuote,
  normalizeDocument,
  segmentDocument,
  sentenceAround,
  splitSentences,
  stem,
  tokenize,
  truncate,
} from '../src/shared/core/text.js';
import { loadSample, sampleText } from './helpers.js';

describe('normalizeDocument', () => {
  it('unifies line endings, strips zero-width and control characters, collapses spacing', () => {
    const raw = 'A\u200Bgreement\r\nbetween\t\tus\u00A0now\u0007.\n\n\n\nNext';
    assert.equal(normalizeDocument(raw), 'Agreement\nbetween us now .\n\nNext');
  });

  it('tolerates non-string input', () => {
    assert.equal(normalizeDocument(undefined), '');
    assert.equal(normalizeDocument(null), '');
  });
});

describe('segmentDocument', () => {
  it('splits numbered clauses and keeps their titles as headings', () => {
    const segments = segmentDocument(normalizeDocument(sampleText('rental-agreement')));
    const lockIn = segments.find((segment) => segment.heading === 'Lock-in Period');
    assert.ok(lockIn, 'expected a Lock-in Period segment');
    assert.equal(lockIn.label, 'Clause 6');
    assert.match(lockIn.text, /^There is a lock-in period of six/);
  });

  it('does not let the document title stick to every clause', () => {
    const segments = segmentDocument(normalizeDocument(sampleText('rental-agreement')));
    assert.ok(segments.every((segment) => segment.heading !== 'RESIDENTIAL RENTAL AGREEMENT' || segment.id < 2));
  });

  it('cuts oversized paragraphs at sentence boundaries', () => {
    const sentence = 'The party shall comply with every obligation described in this clause. ';
    const segments = segmentDocument(sentence.repeat(40).trim());
    assert.ok(segments.length > 1);
    assert.ok(segments.every((segment) => segment.text.length <= 1400));
  });
});

describe('sentences and quotes', () => {
  it('does not split on abbreviations such as "Rs." and "Mr."', () => {
    const text = 'Mr. Rao shall pay Rs. 54,000 within 15 days. Failing which, action follows.';
    assert.deepEqual(splitSentences(text), ['Mr. Rao shall pay Rs. 54,000 within 15 days.', 'Failing which, action follows.']);
  });

  it('returns a verbatim substring around a match', () => {
    const text = 'First sentence here. The tenant shall pay Rs. 5,000 as deposit. Last one.';
    const quote = sentenceAround(text, text.indexOf('deposit'));
    assert.equal(quote, 'The tenant shall pay Rs. 5,000 as deposit.');
    assert.ok(text.includes(quote));
  });

  it('truncates on a word boundary with an ellipsis', () => {
    assert.equal(truncate('one two three four five', 14), 'one two three…');
    assert.equal(truncate('short', 14), 'short');
  });
});

describe('locateQuote (anti-hallucination)', () => {
  const doc = loadSample('rental-agreement');

  it('verifies an exact quote regardless of case, spacing and quote style', () => {
    const result = locateQuote(doc.text, '  THE LANDLORD  may terminate this agreement immediately without notice  ', doc.sentences);
    assert.equal(result.verified, true);
    assert.equal(result.repaired, false);
  });

  it('accepts quotes with an ellipsis gap when both fragments exist', () => {
    const result = locateQuote(doc.text, 'The Tenant shall bear all repairs … including structural repairs.', doc.sentences);
    assert.equal(result.verified, true);
  });

  it('repairs a near-miss to the closest real sentence', () => {
    const result = locateQuote(doc.text, 'The landlord or his agents can enter and inspect the premises at any time without any prior notice', doc.sentences);
    assert.equal(result.verified, true);
    assert.equal(result.repaired, true);
    assert.match(result.quote, /may enter and inspect the Premises at any time without prior notice/);
  });

  it('rejects a fabricated quote', () => {
    const result = locateQuote(doc.text, 'The Tenant is entitled to a full refund of the deposit within seven days of moving out.', doc.sentences);
    assert.equal(result.verified, false);
  });

  it('rejects an empty quote', () => {
    assert.equal(locateQuote(doc.text, '   ', doc.sentences).verified, false);
  });
});

describe('tokenizing', () => {
  it('stems inflections of the same word to one form', () => {
    const forms = ['terminate', 'terminated', 'terminates', 'terminating', 'termination'].map(stem);
    assert.equal(new Set(forms).size, 1);
  });

  it('drops stopwords and keeps content words', () => {
    assert.deepEqual(tokenize('The Tenant shall pay the deposit'), ['tenant', 'pay', 'deposit'].map(stem));
  });

  it('folds curly quotes and dashes for matching', () => {
    assert.equal(foldForMatch('“Lock–in”  Period'), '"lock-in" period');
  });
});

describe('findQuoteRange (document highlighting)', () => {
  const text = 'Intro.\nThe Landlord’s agents may   enter and inspect the Premises at any time without prior notice.\nOutro.';

  it('finds an exact quote', () => {
    const quote = 'may   enter and inspect';
    const range = findQuoteRange(text, quote);
    assert.ok(range);
    assert.equal(text.slice(range.start, range.end), quote);
  });

  it('tolerates whitespace, case and quote-style differences', () => {
    const range = findQuoteRange(text, "the landlord's agents MAY enter and inspect the premises");
    assert.ok(range);
    assert.match(text.slice(range.start, range.end), /^The Landlord’s agents may {3}enter and inspect the Premises$/);
  });

  it('spans an ellipsis between two fragments', () => {
    const range = findQuoteRange(text, 'The Landlord’s agents … at any time without prior notice.');
    assert.ok(range);
    assert.equal(text.slice(range.start, range.end), 'The Landlord’s agents may   enter and inspect the Premises at any time without prior notice.');
  });

  it('handles the trailing ellipsis that truncation adds', () => {
    const range = findQuoteRange(text, 'enter and inspect the Premises at any time…');
    assert.ok(range);
    assert.equal(text.slice(range.start, range.end), 'enter and inspect the Premises at any time');
  });

  it('returns null when the quote is not in the text, or too short to trust', () => {
    assert.equal(findQuoteRange(text, 'The tenant may keep pets.'), null);
    assert.equal(findQuoteRange(text, 'the'), null);
    assert.equal(findQuoteRange(text, ''), null);
  });
});
