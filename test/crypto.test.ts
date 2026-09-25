import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { decryptJson, encryptJson, exportShareKey, fromBase64Url, generateShareKey, importShareKey, toBase64Url } from '../src/shared/crypto.js';

const brief = { title: 'Lawyer brief', notes: 'Landlord promised to fix the AC.', keyTerms: [{ quote: 'The Landlord may enter at any time.' }] };

describe('share encryption (AES-256-GCM, key never leaves the browser)', () => {
  it('round-trips a brief through export/import of the key', async () => {
    const key = await generateShareKey();
    const payload = await encryptJson(key, brief);
    const imported = await importShareKey(await exportShareKey(key));
    assert.deepEqual(await decryptJson(imported, payload), brief);
  });

  it('produces opaque, base64url output that does not contain the plaintext', async () => {
    const payload = await encryptJson(await generateShareKey(), brief);
    assert.match(payload.iv, /^[A-Za-z0-9_-]{16}$/);
    assert.match(payload.ciphertext, /^[A-Za-z0-9_-]+$/);
    const raw = Buffer.from(fromBase64Url(payload.ciphertext)).toString('latin1');
    assert.ok(!raw.includes('Landlord') && !raw.includes('AC'), 'ciphertext must not leak plaintext');
  });

  it('uses a fresh IV every time', async () => {
    const key = await generateShareKey();
    const [a, b] = await Promise.all([encryptJson(key, brief), encryptJson(key, brief)]);
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
  });

  it('refuses the wrong key', async () => {
    const payload = await encryptJson(await generateShareKey(), brief);
    await assert.rejects(decryptJson(await generateShareKey(), payload));
  });

  it('detects tampering with the ciphertext or the IV (authenticated encryption)', async () => {
    const key = await generateShareKey();
    const payload = await encryptJson(key, brief);

    const bytes = fromBase64Url(payload.ciphertext);
    bytes[3] = (bytes[3] ?? 0) ^ 0x01;
    await assert.rejects(decryptJson(key, { ...payload, ciphertext: toBase64Url(bytes) }));

    const iv = fromBase64Url(payload.iv);
    iv[0] = (iv[0] ?? 0) ^ 0x01;
    await assert.rejects(decryptJson(key, { ...payload, iv: toBase64Url(iv) }));
  });

  it('binds ciphertexts to this feature (context data), so they cannot be replayed elsewhere', async () => {
    const key = await generateShareKey();
    const payload = await encryptJson(key, brief);
    // Same key/IV/ciphertext, but decrypting without the context string must fail.
    await assert.rejects(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(payload.iv) }, key, fromBase64Url(payload.ciphertext)),
    );
  });

  it('rejects malformed keys', async () => {
    await assert.rejects(async () => importShareKey(toBase64Url(new Uint8Array(16))), /Invalid share key/);
  });

  it('exports a 256-bit key as 43 base64url characters', async () => {
    assert.match(await exportShareKey(await generateShareKey()), /^[A-Za-z0-9_-]{43}$/);
  });
});

describe('base64url', () => {
  it('round-trips arbitrary bytes, including large arrays and awkward lengths', () => {
    for (const length of [0, 1, 2, 3, 31, 32, 33, 100_000]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) bytes[i] = (i * 31 + 7) % 256;
      const encoded = toBase64Url(bytes);
      assert.match(encoded, /^[A-Za-z0-9_-]*$/);
      assert.deepEqual([...fromBase64Url(encoded)], [...bytes]);
    }
  });
});
