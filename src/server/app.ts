import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import compression from 'compression';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { GeminiClient, type LlmClient } from './ai/gemini.js';
import type { Config } from './config.js';
import { ShareStore } from './db/shares.js';
import { errorHandler, type Logger } from './http/errors.js';
import { createApiRouter } from './http/routes.js';
import { createAssistant } from './services/assistant.js';

export interface AppOptions {
  config: Config;
  /** Inject a model client (tests use a fake). Defaults to Gemini from `config`. */
  llm?: LlmClient;
  /** Inject a share store, or null to disable sharing. Defaults to SQLite from `config`. */
  shares?: ShareStore | null;
  logger?: Logger;
}

export interface PlainlyApp {
  app: Express;
  /** Release resources (the SQLite handle and the purge timer). */
  close: () => void;
}

const PURGE_INTERVAL_MS = 10 * 60_000;

/**
 * Build the Express app. Dependencies are injectable so tests can supply a
 * fake LLM, an in-memory share store and a silent logger.
 */
export function createApp({ config, llm, shares, logger = console }: AppOptions): PlainlyApp {
  const client = llm ?? new GeminiClient(config.gemini);
  const store = shares === undefined ? (config.shares.enabled ? new ShareStore(config.shares.dbPath) : null) : shares;
  const assistant = createAssistant({ llm: client, logger });
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    req.id = randomUUID().slice(0, 8);
    res.set('X-Request-Id', req.id);
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'worker-src': ["'self'"],
          'manifest-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });
  app.use(compression());

  // Access log: method, path, status and timing only. Bodies (the user's
  // documents) and query strings are never logged.
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info?.(`[${req.id}] ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms.toFixed(0)}ms`);
    });
    next();
  });

  app.use('/api', createApiRouter({ config, assistant, llm: client, shares: store }));

  // ---- The built web app (vite build -> dist/web) ----
  const webDir = resolve(config.webDir);
  if (existsSync(resolve(webDir, 'index.html'))) {
    app.use(
      express.static(webDir, {
        dotfiles: 'ignore',
        index: 'index.html',
        setHeaders: (res, path) => {
          // Vite fingerprints everything under /assets, so it can be cached forever.
          res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    // Client-side routes such as /s/<id> fall back to the app shell (but never for files or the API).
    app.get(/^\/(?!api\/)[^.]*$/, (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(resolve(webDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.status(503).type('text/plain').send('The web app has not been built yet. Run "npm run build" (or "npm run dev" for development).');
    });
  }

  app.use(errorHandler(logger));

  const timer = store ? setInterval(() => store.purgeExpired(), PURGE_INTERVAL_MS) : undefined;
  timer?.unref();

  return {
    app,
    close: () => {
      if (timer) clearInterval(timer);
      // Only close a store we created; an injected one belongs to its owner.
      if (shares === undefined) store?.close();
    },
  };
}
