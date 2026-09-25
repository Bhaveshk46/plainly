import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { FakeLlm, PNG_BYTES, json, makeDocx, makePdf, makeWebDir, sampleText, startApp, utf16le, type TestServer } from './helpers.js';

const rental = sampleText('rental-agreement');
const b64 = (data: Uint8Array | string): string => Buffer.from(data).toString('base64');

describe('HTTP API (offline mode)', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startApp();
  });
  afterAll(() => server.close());

  describe('meta endpoints', () => {
    it('reports health', async () => {
      const response = await server.get('/api/health');
      assert.equal(response.status, 200);
      const body = await json(response);
      assert.equal(body.status, 'ok');
      assert.equal(body.ai, false);
    });

    it('serves UI configuration without secrets', async () => {
      const body = await json(await server.get('/api/config'));
      assert.equal(body.ai.enabled, false);
      assert.ok(body.limits.maxDocChars > 0);
      assert.deepEqual(body.shares, { enabled: true, ttlHours: [1, 24, 168] });
      assert.ok(!/key|secret|token/i.test(JSON.stringify(body)));
    });
  });

  describe('security headers', () => {
    it('sends a strict CSP and hardening headers on API responses', async () => {
      const response = await server.get('/api/health');
      const csp = response.headers.get('content-security-policy') ?? '';
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /worker-src 'self'/);
      assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-powered-by'), null);
      assert.match(response.headers.get('permissions-policy') ?? '', /camera=\(\)/);
    });

    it('marks API responses as uncacheable so documents are never stored by caches', async () => {
      assert.equal((await server.get('/api/health')).headers.get('cache-control'), 'no-store');
    });

    it('tags every response with a request id', async () => {
      assert.match((await server.get('/api/health')).headers.get('x-request-id') ?? '', /^[0-9a-f]{8}$/);
    });

    it('returns JSON 404s for unknown API routes', async () => {
      const response = await server.get('/api/nope');
      assert.equal(response.status, 404);
      assert.equal((await json(response)).error.code, 'not_found');
    });
  });

  describe('POST /api/analyze', () => {
    it('analyses a document offline', async () => {
      const response = await server.post('/api/analyze', { text: rental, context: { role: 'tenant', stage: 'before_signing', jurisdiction: 'IN' } });
      assert.equal(response.status, 200);
      const body = await json(response);
      assert.equal(body.mode, 'offline');
      assert.equal(body.risk.level, 'high');
      assert.ok(body.clauses.length > 8);
      assert.equal(body.context.role, 'tenant');
      assert.match(body.disclaimer, /not legal advice/);
    });

    it('applies documented defaults when context and options are omitted', async () => {
      const body = await json(await server.post('/api/analyze', { text: rental }));
      assert.equal(body.context.role, 'general');
      assert.equal(body.context.language, 'en');
    });

    it('reports the language the text is really written in (English when AI is off)', async () => {
      const body = await json(await server.post('/api/analyze', { text: rental, context: { language: 'ar' } }));
      assert.equal(body.context.language, 'ar', 'the request is echoed');
      assert.equal(body.outputLanguage, 'en', 'but the offline text is English, so the UI must not label it Arabic');
    });

    it('does not echo back internals or unknown fields', async () => {
      const body = await json(await server.post('/api/analyze', { text: rental, evil: '<script>alert(1)</script>', __proto__: { polluted: true } }));
      assert.ok(!JSON.stringify(body).includes('<script>'));
      assert.equal(({} as Record<string, unknown>)['polluted'], undefined);
    });

    it('validates input strictly', async () => {
      const cases: Array<[unknown, number, string]> = [
        [{ text: 'too short' }, 400, 'text_too_short'],
        [{ text: 42 }, 400, 'invalid_text'],
        [{}, 400, 'invalid_text'],
        [{ text: rental, context: { role: 'wizard' } }, 400, 'invalid_context'],
        [{ text: rental, context: { language: 'klingon' } }, 400, 'invalid_context'],
        [{ text: rental, context: 'tenant' }, 400, 'invalid_context'],
        [{ text: rental, options: { useAI: 'yes' } }, 400, 'invalid_options'],
        [{ text: 'x'.repeat(400_000) }, 413, 'text_too_long'],
      ];
      for (const [body, status, code] of cases) {
        const response = await server.post('/api/analyze', body);
        const payload = await json(response);
        assert.equal(response.status, status, JSON.stringify(body).slice(0, 60));
        assert.equal(payload.error.code, code);
      }
    });

    it('rejects malformed JSON and arrays', async () => {
      const bad = await server.post('/api/analyze', '{not json');
      assert.equal(bad.status, 400);
      assert.equal((await json(bad)).error.code, 'bad_json');
      assert.equal((await server.post('/api/analyze', '[1,2,3]')).status, 400);
    });

    it('rejects requests that are not JSON', async () => {
      const response = await server.post('/api/analyze', 'text=hello', { headers: { 'content-type': 'text/plain' } });
      assert.equal(response.status, 400);
    });

    it('never returns a stack trace or file path in an error', async () => {
      const payload = JSON.stringify(await json(await server.post('/api/analyze', '{oops')));
      assert.ok(!/\bat\s.+\(.+:\d+:\d+\)|node_modules|C:\\/.test(payload));
    });
  });

  describe('POST /api/compare', () => {
    it('compares two documents', async () => {
      const response = await server.post('/api/compare', {
        a: { label: 'Original', text: rental },
        b: { label: 'Revised', text: sampleText('rental-agreement-revised') },
        context: { role: 'tenant', jurisdiction: 'IN' },
      });
      assert.equal(response.status, 200);
      const body = await json(response);
      assert.equal(body.verdict.favors, 'b');
      assert.equal(body.labels.a, 'Original');
      assert.equal(body.outputLanguage, 'en');
    });

    it('sanitises and de-duplicates labels', async () => {
      const label = '<b>"X"</b>\n`';
      const body = await json(await server.post('/api/compare', { a: { label, text: rental }, b: { label, text: rental } }));
      assert.ok(!/[<>"`\n]/.test(body.labels.a + body.labels.b));
      assert.notEqual(body.labels.a, body.labels.b);
    });

    it('requires both documents', async () => {
      assert.equal((await server.post('/api/compare', { a: { text: rental } })).status, 400);
    });
  });

  describe('POST /api/ask', () => {
    it('answers offline with excerpts', async () => {
      const response = await server.post('/api/ask', { text: rental, question: 'Who pays for repairs?', context: { role: 'tenant' } });
      const body = await json(response);
      assert.equal(response.status, 200);
      assert.equal(body.mode, 'offline');
      assert.ok(body.citations.length > 0);
    });

    it('validates question and history', async () => {
      const bodies = [
        { text: rental, question: 'hi' },
        { text: rental, question: 'q'.repeat(700) },
        { text: rental, question: 'Valid question?', history: 'x' },
        { text: rental, question: 'Valid question?', history: [{ q: 1, a: 2 }] },
      ];
      for (const body of bodies) assert.equal((await server.post('/api/ask', body)).status, 400);
    });
  });

  describe('POST /api/extract', () => {
    it('reads a text file', async () => {
      const response = await server.post('/api/extract', { data: b64(rental) });
      const body = await json(response);
      assert.equal(response.status, 200);
      assert.equal(body.method, 'text');
      assert.match(body.text, /RESIDENTIAL RENTAL AGREEMENT/);
    });

    it('reads UTF-16 text files (e.g. Windows Notepad "Unicode")', async () => {
      const body = await json(await server.post('/api/extract', { data: b64(utf16le(rental)) }));
      assert.equal(body.method, 'text');
      assert.match(body.text, /RESIDENTIAL RENTAL AGREEMENT/);
      assert.ok(!body.text.includes('\u0000'));
    });

    it('reads a Word document', async () => {
      const docx = makeDocx(['SERVICES AGREEMENT between Acme & Priya.', 'The Contractor shall deliver the work by 1 June 2026 & be paid promptly.']);
      const body = await json(await server.post('/api/extract', { data: b64(docx) }));
      assert.equal(body.method, 'docx');
      assert.match(body.text, /Acme & Priya/);
      assert.match(body.text, /1 June 2026 & be paid/);
    });

    it('reads a PDF with a text layer', async () => {
      const pdf = makePdf('The tenant shall pay rent of Rs. 18,000 on or before the fifth day of every month.');
      const response = await server.post('/api/extract', { data: b64(pdf) });
      const body = await json(response);
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.method, 'pdf');
      assert.equal(body.pages, 1);
      assert.match(body.text, /tenant shall pay rent/);
    });

    it('decides the type from the bytes, not from anything the client claims', async () => {
      const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, ...new Array<number>(200).fill(0)]);
      const response = await server.post('/api/extract', { data: b64(exe), filename: 'contract.pdf', mimeType: 'application/pdf' });
      assert.equal(response.status, 415);
      assert.equal((await json(response)).error.code, 'unsupported_type');
    });

    it('asks for AI when an image cannot be read locally', async () => {
      const response = await server.post('/api/extract', { data: b64(PNG_BYTES) });
      assert.equal(response.status, 422);
      assert.equal((await json(response)).error.code, 'needs_ai');
    });

    it('rejects broken files and bad input', async () => {
      assert.equal((await server.post('/api/extract', { data: b64('%PDF-1.4 this is not really a pdf') })).status, 422);
      assert.equal((await server.post('/api/extract', { data: b64(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])) })).status, 422);
      assert.equal((await server.post('/api/extract', { data: '***not base64***' })).status, 400);
      assert.equal((await server.post('/api/extract', { data: '' })).status, 400);
      assert.equal((await server.post('/api/extract', {})).status, 400);
    });

    it('enforces the upload size limit', async () => {
      const small = await startApp({ env: { MAX_UPLOAD_BYTES: '2048' } });
      try {
        assert.equal((await small.post('/api/extract', { data: b64(Buffer.alloc(5000, 'a')) })).status, 413);
      } finally {
        await small.close();
      }
    });

    it('truncates over-long text and says so', async () => {
      const small = await startApp({ env: { MAX_DOC_CHARS: '1000' } });
      try {
        const body = await json(await small.post('/api/extract', { data: b64(rental) }));
        assert.equal(body.truncated, true);
        assert.equal(body.text.length, 1000);
      } finally {
        await small.close();
      }
    });
  });
});

describe('serving the built web app', () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startApp({ webDir: makeWebDir() });
  });
  afterAll(() => server.close());

  it('serves the app shell at / with a revalidating cache policy', async () => {
    const response = await server.get('/');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Plainly test shell/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  });

  it('caches fingerprinted assets forever', async () => {
    const response = await server.get('/assets/app-abc123.js');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });

  it('falls back to the shell for client-side routes such as shared briefs', async () => {
    const response = await server.get('/s/abcdefghijklmnopqrstuv');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Plainly test shell/);
  });

  it('does not use the fallback for missing files or the API', async () => {
    assert.equal((await server.get('/missing.js')).status, 404);
    const api = await server.get('/api/does-not-exist');
    assert.equal(api.status, 404);
    assert.equal((await json(api)).error.code, 'not_found');
  });

  it('does not expose files outside the web directory', async () => {
    for (const path of ['/.env', '/package.json', '/src/server/index.ts', '/..%2Fpackage.json', '/%2e%2e/package.json', '/node_modules/express/package.json']) {
      const response = await server.get(path);
      const text = await response.text();
      assert.ok(response.status !== 200 || text.includes('Plainly test shell'), `${path} returned ${response.status}`);
      assert.ok(!text.includes('"name": "plainly'), `${path} leaked package.json`);
    }
  });
});

describe('when the web app has not been built', () => {
  it('explains what to do instead of failing obscurely', async () => {
    const server = await startApp();
    try {
      const response = await server.get('/');
      assert.equal(response.status, 503);
      assert.match(await response.text(), /npm run build/);
    } finally {
      await server.close();
    }
  });
});

describe('HTTP API (AI enabled with a fake model)', () => {
  it('reports AI as enabled and transcribes scanned images', async () => {
    const llm = new FakeLlm({ transcript: 'SCANNED NOTICE. You are hereby called upon to pay within fifteen (15) days of receipt of this notice.' });
    const server = await startApp({ llm });
    try {
      assert.equal((await json(await server.get('/api/config'))).ai.enabled, true);
      const body = await json(await server.post('/api/extract', { data: b64(PNG_BYTES) }));
      assert.equal(body.method, 'ocr');
      assert.match(body.text, /SCANNED NOTICE/);
      assert.equal(llm.transcriptions[0]?.mimeType, 'image/png');
    } finally {
      await server.close();
    }
  });
});

describe('rate limiting', () => {
  it('throttles the AI endpoints with a friendly JSON 429', async () => {
    const server = await startApp({ env: { RATE_LIMIT_AI: '3', RATE_LIMIT_GENERAL: '1000' } });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i += 1) statuses.push((await server.post('/api/analyze', { text: rental })).status);
      assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
      const limited = await server.post('/api/analyze', { text: rental });
      assert.equal((await json(limited)).error.code, 'rate_limited');
      assert.equal((await server.get('/api/health')).status, 200, 'non-AI routes are unaffected');
    } finally {
      await server.close();
    }
  });
});
