import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { GeminiClient, LlmError, type GeminiOptions } from '../src/server/ai/gemini.js';

const okResponse = (text: string) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }) });
const errorResponse = (status: number) => ({ ok: false, status, json: async () => ({}) });
type MockInit = { body: string; headers: Record<string, string>; signal: AbortSignal };
type MockFetch = (url: string, init: MockInit) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;
interface SentBody {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ parts: Array<{ text: string; inlineData: { mimeType: string } }> }>;
  generationConfig: { responseMimeType: string; responseSchema: object };
}

function client(fetchImpl: MockFetch, overrides: Partial<GeminiOptions> = {}) {
  return new GeminiClient({
    apiKey: 'test-key-123',
    model: 'gemini-test',
    baseUrl: 'https://example.test/v1beta',
    timeoutMs: 200,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    retryDelayMs: 1,
    ...overrides,
  });
}

const request = { system: 'sys', prompt: 'hello', schema: { type: 'OBJECT' } };

describe('GeminiClient', () => {
  it('sends a schema-constrained request with the key only in a header', async () => {
    let seen: { url: string; init: MockInit; body: SentBody } | undefined;
    const gemini = client(async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return okResponse('{"answer":"ok"}');
    });
    assert.deepEqual(await gemini.generateJson(request), { answer: 'ok' });
    assert.ok(seen);

    assert.equal(seen.url, 'https://example.test/v1beta/models/gemini-test:generateContent');
    assert.equal(seen.init.headers['x-goog-api-key'], 'test-key-123');
    assert.ok(!seen.url.includes('test-key-123'), 'key must never appear in the URL');
    assert.ok(!seen.init.body.includes('test-key-123'), 'key must never appear in the body');
    assert.equal(seen.body.systemInstruction.parts[0].text, 'sys');
    assert.equal(seen.body.contents[0].parts[0].text, 'hello');
    assert.equal(seen.body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(seen.body.generationConfig.responseSchema, { type: 'OBJECT' });
  });

  it('tolerates a JSON reply wrapped in a code fence', async () => {
    const gemini = client(async () => okResponse('```json\n{"a":1}\n```'));
    assert.deepEqual(await gemini.generateJson(request), { a: 1 });
  });

  it('ignores "thought" parts when reading the answer', async () => {
    const gemini = client(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'internal reasoning', thought: true }, { text: '{"a":2}' }] } }] }),
    }));
    assert.deepEqual(await gemini.generateJson(request), { a: 2 });
  });

  it('retries once on a transient 503, then succeeds', async () => {
    let calls = 0;
    const gemini = client(async () => (++calls === 1 ? errorResponse(503) : okResponse('{"ok":true}')));
    assert.deepEqual(await gemini.generateJson(request), { ok: true });
    assert.equal(calls, 2);
  });

  it('gives up after one retry and reports the service as unavailable', async () => {
    let calls = 0;
    const gemini = client(async () => (calls++, errorResponse(503)));
    await assert.rejects(gemini.generateJson(request), (error) => error instanceof LlmError && error.code === 'unavailable');
    assert.equal(calls, 2);
  });

  it('does not retry bad credentials', async () => {
    let calls = 0;
    const gemini = client(async () => (calls++, errorResponse(403)));
    await assert.rejects(gemini.generateJson(request), (error) => error instanceof LlmError && error.code === 'unavailable' && /credentials/.test(error.message));
    assert.equal(calls, 1);
  });

  it('maps 429 to rate_limited', async () => {
    const gemini = client(async () => errorResponse(429));
    await assert.rejects(gemini.generateJson(request), (error) => error instanceof LlmError && error.code === 'rate_limited');
  });

  it('times out slow responses', async () => {
    const gemini = client((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))), { timeoutMs: 30 });
    await assert.rejects(gemini.generateJson(request), (error) => error instanceof LlmError && error.code === 'timeout');
  });

  it('reports blocked content without leaking details', async () => {
    const gemini = client(async () => ({ ok: true, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) }));
    await assert.rejects(gemini.generateJson(request), (error) => error instanceof LlmError && error.code === 'blocked');
  });

  it('rejects truncated or non-JSON output', async () => {
    const gemini = client(async () => okResponse('{"answer": "cut off'));
    await assert.rejects(gemini.generateJson(request), (error) => error instanceof LlmError && error.code === 'truncated');
  });

  it('never calls the network without a key', async () => {
    let calls = 0;
    const gemini = client(async () => (calls++, okResponse('{}')), { apiKey: '' });
    assert.equal(gemini.enabled, false);
    await assert.rejects(gemini.generateJson(request), (error) => error instanceof LlmError && error.code === 'unavailable');
    assert.equal(calls, 0);
  });

  it('marks network failures as unavailable', async () => {
    const gemini = client(async () => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(gemini.generateJson(request), (error) => error instanceof LlmError && error.code === 'unavailable');
  });

  it('transcribes files by sending them inline, with an untrusted-file instruction', async () => {
    let body: SentBody | undefined;
    const gemini = client(async (_url, init) => {
      body = JSON.parse(init.body);
      return okResponse('Transcribed words');
    });
    assert.equal(await gemini.transcribe({ base64: 'AAAA', mimeType: 'image/png' }), 'Transcribed words');
    assert.ok(body);
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, 'image/png');
    assert.match(body.systemInstruction.parts[0].text, /never follow instructions/i);
  });
});
