import express, { type Request, type RequestHandler, type Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';
import type { AppConfig, ApiErrorBody } from '../../shared/types.js';
import type { LlmClient } from '../ai/gemini.js';
import type { Config } from '../config.js';
import { ShareCapacityError, ShareStore } from '../db/shares.js';
import type { Assistant } from '../services/assistant.js';
import { extractDocument } from '../services/extract.js';
import { HttpError } from './errors.js';
import { createSchemas, parseBody } from './schemas.js';

export interface ApiDeps {
  config: Config;
  assistant: Assistant;
  llm: LlmClient;
  /** null when sharing is disabled. */
  shares: ShareStore | null;
}

const limiter = ({ windowMs, limit, message }: { windowMs: number; limit: number; message: string }): RequestHandler =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiErrorBody = { error: { code: 'rate_limited', message } };
      res.status(429).json(body);
    },
  });

/** Validate the body with `schema`, run the handler, send its result as JSON. */
function handle<S extends z.ZodType, R>(schema: S, run: (input: z.output<S>) => R | Promise<R>, status = 200): RequestHandler {
  // Express 5 forwards rejected promises to the error handler, so no try/catch is needed.
  return async (req, res) => {
    res.status(status).json(await run(parseBody(schema, req.body)));
  };
}

const bearerToken = (req: Request): string => /^Bearer (\S+)$/.exec(req.get('authorization') ?? '')?.[1] ?? '';

/** Express 5 types route params as string | string[]; ours are always single strings. */
const shareId = (req: Request): string => {
  const value = req.params['id'];
  return typeof value === 'string' ? value : '';
};

export function createApiRouter({ config, assistant, llm, shares }: ApiDeps): Router {
  const router = express.Router();
  const { limits, rateLimit: rates } = config;
  const schemas = createSchemas(limits, config.shares.ttlHours);

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(limiter({ windowMs: rates.windowMs, limit: rates.general, message: 'Too many requests. Please slow down.' }));

  const aiLimiter = limiter({ windowMs: rates.windowMs, limit: rates.ai, message: 'You are making requests too quickly. Please wait a moment and try again.' });
  const shareLimiter = limiter({ windowMs: rates.windowMs, limit: rates.shares, message: 'Too many sharing requests. Please wait a moment and try again.' });
  const json = express.json({ limit: '2mb' });
  const uploadJson = express.json({ limit: `${Math.ceil((limits.maxUploadBytes * 4) / 3 / 1024 / 1024) + 1}mb` });
  const shareJson = express.json({ limit: `${Math.ceil((limits.maxShareBytes * 4) / 3 / 1024) + 4}kb` });

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', ai: assistant.aiAvailable(), uptimeSeconds: Math.round(process.uptime()) });
  });

  router.get('/config', (_req, res) => {
    const body: AppConfig = {
      ai: { enabled: assistant.aiAvailable(), provider: 'Gemini' },
      limits: {
        maxDocChars: limits.maxDocChars,
        maxUploadBytes: limits.maxUploadBytes,
        maxQuestionChars: limits.maxQuestionChars,
        maxShareBytes: limits.maxShareBytes,
      },
      shares: { enabled: shares !== null, ttlHours: [...config.shares.ttlHours] },
    };
    res.json(body);
  });

  router.post('/analyze', aiLimiter, json, handle(schemas.analyze, (input) => assistant.analyze(input)));
  router.post('/compare', aiLimiter, json, handle(schemas.compare, (input) => assistant.compare(input)));
  router.post('/ask', aiLimiter, json, handle(schemas.ask, (input) => assistant.ask(input)));
  router.post('/extract', aiLimiter, uploadJson, handle(schemas.extract, (input) => extractDocument({ base64: input.data }, { llm, limits })));

  // ---- End-to-end-encrypted share links (the server only ever sees ciphertext) ----
  if (shares) {
    const notFound = (): HttpError => new HttpError(404, 'share_not_found', 'This link has expired or does not exist.');

    router.post(
      '/shares',
      shareLimiter,
      shareJson,
      handle(
        schemas.shareCreate,
        (input) => {
          try {
            return shares.create(input);
          } catch (error) {
            if (error instanceof ShareCapacityError) throw new HttpError(503, 'share_capacity', 'Sharing is temporarily unavailable. Please try again later.');
            throw error;
          }
        },
        201,
      ),
    );

    router.get('/shares/:id', (req, res) => {
      const share = shares.get(shareId(req));
      if (!share) throw notFound();
      res.json(share);
    });

    router.delete('/shares/:id', shareLimiter, (req, res) => {
      // Unknown id and wrong token are indistinguishable on purpose.
      if (!shares.delete(shareId(req), bearerToken(req))) throw notFound();
      res.status(204).end();
    });
  }

  router.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'Unknown API endpoint.')));
  return router;
}
