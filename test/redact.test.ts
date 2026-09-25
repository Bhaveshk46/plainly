import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createRedactor, redact, restoreDeep, restoreText } from '../src/shared/core/redact.js';

describe('redact', () => {
  it('masks structured identifiers', () => {
    const text = [
      'Email ramesh.sharma@example.com',
      'phone +91 98765 43210',
      'Aadhaar 2345 6789 0123',
      'PAN ABCDE1234F',
      'SSN 123-45-6789',
      'card 4111 1111 1111 1111',
    ].join('; ');
    const result = redact(text);
    for (const secret of ['ramesh.sharma@example.com', '98765 43210', '2345 6789 0123', 'ABCDE1234F', '123-45-6789', '4111 1111 1111 1111']) {
      assert.ok(!result.text.includes(secret), `${secret} should be masked`);
    }
    assert.deepEqual(Object.keys(result.counts).sort(), ['AADHAAR', 'CARD', 'EMAIL', 'PAN', 'PHONE', 'SSN']);
    assert.equal(result.total, 6);
  });

  it('leaves amounts, dates, years and clause numbers alone', () => {
    const text = 'Rent is Rs. 18,000 from 1 April 2026 under clause 12.3, renewed in 2027 for USD 1,200,000.';
    assert.equal(redact(text).text, text);
  });

  it('does not treat a random 16-digit number as a card (Luhn check)', () => {
    const text = 'Reference 1234 5678 9012 3456.';
    assert.ok(!redact(text).counts.CARD);
  });

  it('uses one stable token per distinct value', () => {
    const result = redact('a@x.com wrote to b@y.org, then a@x.com again.');
    assert.equal(result.text, '[EMAIL_1] wrote to [EMAIL_2], then [EMAIL_1] again.');
  });

  it('round-trips: restoring the masked text yields the original', () => {
    const original = 'Contact priya@example.com or +91 91234 56789 about PAN ABCDE1234F.';
    const { text, map } = redact(original);
    assert.equal(restoreText(text, map), original);
  });

  it('restores identifiers anywhere inside nested AI output', () => {
    const { map } = redact('Reach me at me@site.com');
    const restored = restoreDeep({ a: ['see [EMAIL_1]'], b: { c: 'x [EMAIL_1] y', n: 3 } }, map);
    assert.deepEqual(restored, { a: ['see me@site.com'], b: { c: 'x me@site.com y', n: 3 } });
  });

  it('leaves unknown tokens untouched', () => {
    assert.equal(restoreText('[EMAIL_9]', new Map([['[EMAIL_1]', 'a@b.co']])), '[EMAIL_9]');
  });

  it('shares one token space across several documents', () => {
    const redactor = createRedactor();
    const first = redactor.apply('first@a.com');
    const second = redactor.apply('second@b.com and first@a.com');
    assert.equal(first, '[EMAIL_1]');
    assert.equal(second, '[EMAIL_2] and [EMAIL_1]');
    assert.equal(redactor.total, 2);
  });
});

describe('redact: names', () => {
  it('masks names after a title or a party label, leaving the title readable', () => {
    const result = redact('Mr. Ramesh Sharma (the Landlord) and Dr Anita Verma agree.\nTenant: Priya Nair\nClient: Ms. Rekha Rao');
    assert.ok(!/Ramesh|Sharma|Anita|Verma|Priya|Nair|Rekha|Rao/.test(result.text));
    assert.match(result.text, /Mr\. \[NAME_1\]/);
    assert.match(result.text, /Dr \[NAME_2\]/);
    // Title-based names are numbered first, then label-based ones.
    assert.match(result.text, /Tenant: \[NAME_4\]/);
    assert.match(result.text, /Client: Ms\. \[NAME_3\]/);
    assert.equal(result.counts['NAME'], 4);
  });

  it('never masks the title itself when it follows a party label', () => {
    const result = redact('Landlord: Mr. Ramesh Sharma');
    assert.equal(result.text, 'Landlord: Mr. [NAME_1]');
  });

  it('restores names in the model output', () => {
    const { text, map } = redact('Mr. Ramesh Sharma may enter.');
    assert.equal(restoreText(text, map), 'Mr. Ramesh Sharma may enter.');
  });

  it('does not mask ordinary capitalised words', () => {
    const text = 'The Landlord and the Tenant agree. Premises are in Jaipur.';
    assert.equal(redact(text).text, text);
  });
});
