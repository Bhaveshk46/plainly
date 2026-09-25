/** Shared test utilities: sample loading, a fake LLM, an app-on-a-port helper, file fixtures. */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { LlmError, type JsonRequest, type LlmClient, type TranscribeRequest } from '../src/server/ai/gemini.js';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { ShareStore } from '../src/server/db/shares.js';
import { prepareDocument, type PreparedDocument } from '../src/shared/core/analyze.js';
import { DEFAULT_CONTEXT, type Context } from '../src/shared/options.js';

export const sampleText = (name: string): string => readFileSync(new URL(`../public/samples/${name}.txt`, import.meta.url), 'utf8');
export const loadSample = (name: string): PreparedDocument => prepareDocument(sampleText(name));
export const context = (overrides: Partial<Context> = {}): Context => ({ ...DEFAULT_CONTEXT, ...overrides });

export const silentLogger = { info() {}, warn() {}, error() {} };

/**
 * A stand-in for GeminiClient. `responder` receives the request and returns
 * the JSON the "model" would produce (or throws an LlmError).
 */
export class FakeLlm implements LlmClient {
  enabled: boolean;
  calls: JsonRequest[] = [];
  transcriptions: TranscribeRequest[] = [];
  readonly #responder: (request: JsonRequest) => Record<string, unknown>;
  readonly #transcript: string;

  constructor({
    enabled = true,
    responder = () => ({}),
    transcript = 'Transcribed text from a scanned page. '.repeat(4),
  }: {
    enabled?: boolean;
    responder?: (request: JsonRequest) => Record<string, unknown>;
    transcript?: string;
  } = {}) {
    this.enabled = enabled;
    this.#responder = responder;
    this.#transcript = transcript;
  }

  generateJson(request: JsonRequest): Promise<Record<string, unknown>> {
    this.calls.push(request);
    return Promise.resolve().then(() => this.#responder(request));
  }

  transcribe(request: TranscribeRequest): Promise<string> {
    this.transcriptions.push(request);
    return Promise.resolve(this.#transcript);
  }
}

export const failingLlm = (code: LlmError['code'] = 'unavailable', message = 'The AI service is temporarily unavailable.'): FakeLlm =>
  new FakeLlm({
    responder: () => {
      throw new LlmError(code, message);
    },
  });

export interface TestServer {
  base: string;
  llm: FakeLlm;
  shares: ShareStore | null;
  post: (path: string, body: unknown, init?: RequestInit) => Promise<Response>;
  get: (path: string) => Promise<Response>;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
}

/** Start the real app on an ephemeral port with an in-memory share store. */
export async function startApp({
  llm = new FakeLlm({ enabled: false }),
  env = {},
  webDir,
  shares = new ShareStore(':memory:'),
}: {
  llm?: FakeLlm;
  env?: Record<string, string>;
  webDir?: string;
  shares?: ShareStore | null;
} = {}): Promise<TestServer> {
  const config = loadConfig(
    { RATE_LIMIT_AI: '1000', RATE_LIMIT_GENERAL: '1000', RATE_LIMIT_SHARES: '1000', ...env },
    { webDir: webDir ?? join(tmpdir(), 'plainly-no-web-dir') },
  );
  const { app, close } = createApp({ config, llm, shares, logger: silentLogger });
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');
  const base = `http://127.0.0.1:${address.port}`;

  const request = (path: string, init?: RequestInit): Promise<Response> => fetch(`${base}${path}`, init);
  return {
    base,
    llm,
    shares,
    request,
    get: (path) => request(path),
    post: (path, body, init = {}) =>
      request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
        ...init,
      }),
    close: () =>
      new Promise((resolve) => {
        close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** A throwaway "built web app" directory for static-serving tests. */
export function makeWebDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'plainly-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Plainly test shell</title><div id="root"></div>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log("hi");');
  writeFileSync(join(dir, 'robots.txt'), 'User-agent: *');
  return dir;
}

// ---------------------------------------------------------------------------
// File fixtures
// ---------------------------------------------------------------------------

/** Minimal single-page PDF containing `text` (valid xref offsets). */
export function makePdf(text: string): Buffer {
  const escaped = text.replace(/[\\()]/g, (character) => `\\${character}`);
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/** Minimal .docx with one paragraph per string. */
export function makeDocx(paragraphs: string[]): Buffer {
  const body = paragraphs.map((paragraph) => `<w:p><w:r><w:t xml:space="preserve">${paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return Buffer.from(zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types/>') }));
}

/** A PNG header is enough for magic-byte sniffing. */
export const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

/** UTF-16LE text with a byte-order mark, like Windows Notepad's "Unicode" option. */
export const utf16le = (text: string): Buffer => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

/** Read a JSON response body without fighting the type checker in assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const json = (response: Response): Promise<any> => response.json();
