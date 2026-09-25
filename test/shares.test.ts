import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { ShareCapacityError, ShareStore } from '../src/server/db/shares.js';
import { encryptJson, generateShareKey, decryptJson, fromBase64Url } from '../src/shared/crypto.js';
import { json, startApp, type TestServer } from './helpers.js';

const HOUR = 3_600_000;
const iv = 'AAAAAAAAAAAAAAAA';
const cipher = 'A'.repeat(64);

/** A clock the tests can move forward. */
function clock(start = Date.parse('2026-09-25T10:00:00Z')) {
  let now = start;
  return { now: () => now, advance: (ms: number) => void (now += ms) };
}

describe('ShareStore', () => {
  it('creates a share with an unguessable id and delete token', () => {
    const store = new ShareStore(':memory:');
    const created = store.create({ iv, ciphertext: cipher, ttlHours: 24 });
    assert.match(created.id, /^[A-Za-z0-9_-]{22}$/);
    assert.match(created.deleteToken, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(created.id, store.create({ iv, ciphertext: cipher, ttlHours: 24 }).id);
    store.close();
  });

  it('returns the stored envelope until it expires, then removes it', () => {
    const time = clock();
    const store = new ShareStore(':memory:', { now: time.now });
    const { id, expiresAt } = store.create({ iv, ciphertext: cipher, ttlHours: 1 });
    assert.equal(expiresAt, new Date(time.now() + HOUR).toISOString());
    assert.deepEqual(store.get(id), { id, iv, ciphertext: cipher, expiresAt });

    time.advance(HOUR - 1);
    assert.ok(store.get(id), 'still readable a millisecond before expiry');
    time.advance(1);
    assert.equal(store.get(id), undefined, 'unreadable the moment it expires');
    assert.equal(store.count(), 0, 'and deleted');
    store.close();
  });

  it('treats malformed ids as missing rather than querying with them', () => {
    const store = new ShareStore(':memory:');
    for (const id of ['', 'short', "x' OR '1'='1", '../etc/passwd', 'A'.repeat(23)]) assert.equal(store.get(id), undefined);
    store.close();
  });

  it('deletes only with the right token; unknown ids and wrong tokens look the same', () => {
    const store = new ShareStore(':memory:');
    const { id, deleteToken } = store.create({ iv, ciphertext: cipher, ttlHours: 24 });
    assert.equal(store.delete(id, 'wrong-token'), false);
    assert.equal(store.delete(id, ''), false);
    assert.equal(store.delete('A'.repeat(22), deleteToken), false);
    assert.ok(store.get(id), 'a wrong token must not delete');
    assert.equal(store.delete(id, deleteToken), true);
    assert.equal(store.get(id), undefined);
    assert.equal(store.delete(id, deleteToken), false, 'already gone');
    store.close();
  });

  it('caps the number of live shares, and frees space when they expire', () => {
    const time = clock();
    const store = new ShareStore(':memory:', { maxRows: 2, now: time.now });
    store.create({ iv, ciphertext: cipher, ttlHours: 1 });
    store.create({ iv, ciphertext: cipher, ttlHours: 24 });
    assert.throws(() => store.create({ iv, ciphertext: cipher, ttlHours: 1 }), ShareCapacityError);

    time.advance(2 * HOUR);
    assert.doesNotThrow(() => store.create({ iv, ciphertext: cipher, ttlHours: 1 }), 'the expired share was purged to make room');
    store.close();
  });

  it('purges expired rows in bulk', () => {
    const time = clock();
    const store = new ShareStore(':memory:', { now: time.now });
    for (let i = 0; i < 5; i += 1) store.create({ iv, ciphertext: cipher, ttlHours: 1 });
    store.create({ iv, ciphertext: cipher, ttlHours: 168 });
    time.advance(2 * HOUR);
    assert.equal(store.purgeExpired(), 5);
    assert.equal(store.count(), 1);
    store.close();
  });
});

describe('share API', () => {
  const servers: TestServer[] = [];
  afterEach(async () => {
    while (servers.length) await servers.pop()?.close();
  });
  const start = async (options: Parameters<typeof startApp>[0] = {}): Promise<TestServer> => {
    const server = await startApp(options);
    servers.push(server);
    return server;
  };
  const validBody = { iv, ciphertext: cipher, ttlHours: 24 };

  it('creates, fetches and revokes a share', async () => {
    const server = await start();
    const created = await server.post('/api/shares', validBody);
    assert.equal(created.status, 201);
    const { id, deleteToken, expiresAt } = await json(created);
    assert.ok(Date.parse(expiresAt) > Date.now());

    const fetched = await server.get(`/api/shares/${id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await json(fetched), { id, iv, ciphertext: cipher, expiresAt });

    const revoked = await server.request(`/api/shares/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${deleteToken}` } });
    assert.equal(revoked.status, 204);
    assert.equal((await server.get(`/api/shares/${id}`)).status, 404);
  });

  it('refuses to revoke without the right token, without revealing whether the share exists', async () => {
    const server = await start();
    const { id } = await json(await server.post('/api/shares', validBody));
    const attempts: Array<Record<string, string>> = [{}, { authorization: 'Bearer nope' }, { authorization: 'Basic abc' }];
    for (const headers of attempts) {
      const response = await server.request(`/api/shares/${id}`, { method: 'DELETE', headers });
      assert.equal(response.status, 404);
      assert.equal((await json(response)).error.code, 'share_not_found');
    }
    const missing = await server.request(`/api/shares/${'B'.repeat(22)}`, { method: 'DELETE', headers: { authorization: 'Bearer nope' } });
    assert.equal(missing.status, 404, 'same answer for an id that never existed');
    assert.equal((await server.get(`/api/shares/${id}`)).status, 200, 'and the share survived');
  });

  it('answers unknown, malformed and expired links identically', async () => {
    const time = clock();
    const server = await start({ shares: new ShareStore(':memory:', { now: time.now }) });
    const { id } = await json(await server.post('/api/shares', { ...validBody, ttlHours: 1 }));
    time.advance(2 * HOUR);

    for (const path of [`/api/shares/${id}`, `/api/shares/${'C'.repeat(22)}`, '/api/shares/short', '/api/shares/%27%20OR%201=1--']) {
      const response = await server.get(path);
      assert.equal(response.status, 404, path);
      assert.equal((await json(response)).error.code, 'share_not_found');
    }
  });

  it('validates what it stores', async () => {
    const server = await start({ env: { MAX_SHARE_BYTES: '2048' } });
    const cases: Array<[unknown, number, string]> = [
      [{ ...validBody, iv: 'short' }, 400, 'invalid_share'],
      [{ ...validBody, iv: '!!!!!!!!!!!!!!!!' }, 400, 'invalid_share'],
      [{ ...validBody, ciphertext: 'tiny' }, 400, 'invalid_share'],
      [{ ...validBody, ciphertext: `${'A'.repeat(63)}!` }, 400, 'invalid_share'],
      [{ ...validBody, ttlHours: 2 }, 400, 'invalid_share'],
      [{ ...validBody, ttlHours: '24' }, 400, 'invalid_body'],
      [{ ...validBody, ciphertext: 'A'.repeat(4000) }, 413, 'share_too_large'],
      [{ iv }, 400, 'invalid_body'],
      ['not-an-object', 400, 'bad_json'],
    ];
    for (const [body, status, code] of cases) {
      const response = await server.post('/api/shares', typeof body === 'string' ? '{"bad' : body);
      assert.equal(response.status, status, JSON.stringify(body).slice(0, 50));
      assert.equal((await json(response)).error.code, code);
    }
  });

  it('never accepts plaintext-looking blobs that are not valid ciphertext encoding', async () => {
    const server = await start();
    const response = await server.post('/api/shares', { ...validBody, ciphertext: 'This is my plaintext legal document, please store it' });
    assert.equal(response.status, 400);
  });

  it('is rate limited', async () => {
    const server = await start({ env: { RATE_LIMIT_SHARES: '2', RATE_LIMIT_GENERAL: '1000' } });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await server.post('/api/shares', validBody)).status);
    assert.deepEqual(statuses, [201, 201, 429, 429]);
  });

  it('degrades to a clear 503 when the store is full', async () => {
    const server = await start({ shares: new ShareStore(':memory:', { maxRows: 1 }) });
    assert.equal((await server.post('/api/shares', validBody)).status, 201);
    const full = await server.post('/api/shares', validBody);
    assert.equal(full.status, 503);
    assert.equal((await json(full)).error.code, 'share_capacity');
  });

  it('can be switched off entirely', async () => {
    const server = await start({ shares: null });
    assert.deepEqual((await json(await server.get('/api/config'))).shares, { enabled: false, ttlHours: [1, 24, 168] });
    assert.equal((await server.post('/api/shares', validBody)).status, 404);
    assert.equal((await server.get(`/api/shares/${'A'.repeat(22)}`)).status, 404);
  });

  it('works end to end: what the server stores is opaque, and only the key holder can read it', async () => {
    const server = await start();
    const secret = { title: 'Lawyer brief', notes: 'Ramesh Sharma promised to fix the AC.' };
    const key = await generateShareKey();
    const encrypted = await encryptJson(key, secret);

    const { id } = await json(await server.post('/api/shares', { ...encrypted, ttlHours: 24 }));
    const stored = await json(await server.get(`/api/shares/${id}`));

    assert.ok(!Buffer.from(fromBase64Url(stored.ciphertext)).toString('latin1').includes('Ramesh'), 'server-side data is ciphertext');
    assert.deepEqual(await decryptJson(key, stored), secret);
    await assert.rejects(decryptJson(await generateShareKey(), stored), 'a different key cannot read it');
  });
});
