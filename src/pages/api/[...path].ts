import type { NextApiRequest, NextApiResponse } from 'next';
import { createApp, type PlainlyApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';

// Reuse the tested Express validation, errors, limits and trust boundary.
// Vercel has no durable local SQLite disk. Never create misleading share links.
let instance: PlainlyApp | undefined;
export const config = { api: { bodyParser: false, externalResolver: true }, maxDuration: 120 };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Next adds forwarding headers even for direct localhost traffic. Without an
  // explicitly trusted upstream, use the socket IP and ignore spoofable headers.
  if (!process.env['VERCEL'] && !process.env['TRUST_PROXY']) {
    delete req.headers['x-forwarded-for'];
    delete req.headers['forwarded'];
  }
  if (!instance) {
    const env = process.env['VERCEL'] ? { ...process.env, SHARES_ENABLED: 'false', MAX_UPLOAD_BYTES: '3145728', TRUST_PROXY: '1' } : process.env;
    instance = createApp({ config: loadConfig(env) });
  }
  instance.app(req, res);
}
