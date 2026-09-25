/**
 * Runtime configuration, read once from the environment. Every value has a
 * safe default so the app starts (in offline mode) with no configuration.
 */

export interface Config {
  readonly port: number;
  readonly host: string;
  /** Express "trust proxy" setting: false, or the number of proxy hops. */
  readonly trustProxy: number | false;
  readonly gemini: {
    readonly apiKey: string;
    readonly model: string;
    readonly baseUrl: string;
    readonly timeoutMs: number;
  };
  readonly limits: {
    readonly maxDocChars: number;
    readonly maxUploadBytes: number;
    readonly maxQuestionChars: number;
    readonly maxHistoryTurns: number;
    readonly maxShareBytes: number;
  };
  readonly rateLimit: {
    readonly windowMs: number;
    readonly general: number;
    readonly ai: number;
    readonly shares: number;
  };
  readonly shares: {
    readonly enabled: boolean;
    /** SQLite file, or ":memory:" for a throwaway store. */
    readonly dbPath: string;
    /** Allowed lifetimes, in hours. */
    readonly ttlHours: readonly number[];
  };
  /** Directory holding the built web app. */
  readonly webDir: string;
}

type Env = Record<string, string | undefined>;

const int = (value: string | undefined, fallback: number, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function loadConfig(env: Env = process.env, overrides: { webDir?: string } = {}): Config {
  return Object.freeze({
    port: int(env['PORT'], 3000, { min: 0, max: 65535 }),
    host: env['HOST'] || '0.0.0.0',
    // Set behind a reverse proxy (e.g. Cloud Run) so rate limiting sees real client IPs.
    trustProxy: env['TRUST_PROXY'] ? int(env['TRUST_PROXY'], 1) : false,
    gemini: Object.freeze({
      apiKey: (env['GEMINI_API_KEY'] ?? '').trim(),
      model: (env['GEMINI_MODEL'] ?? 'gemini-3.8-flash').trim(),
      baseUrl: (env['GEMINI_BASE_URL'] ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
      timeoutMs: int(env['GEMINI_TIMEOUT_MS'], 90_000, { min: 1_000, max: 240_000 }),
    }),
    limits: Object.freeze({
      maxDocChars: int(env['MAX_DOC_CHARS'], 150_000, { min: 1_000 }),
      maxUploadBytes: int(env['MAX_UPLOAD_BYTES'], 8 * 1024 * 1024, { min: 1_024 }),
      maxQuestionChars: 600,
      maxHistoryTurns: 6,
      maxShareBytes: int(env['MAX_SHARE_BYTES'], 256 * 1024, { min: 1_024, max: 4 * 1024 * 1024 }),
    }),
    rateLimit: Object.freeze({
      windowMs: int(env['RATE_WINDOW_MS'], 60_000),
      general: int(env['RATE_LIMIT_GENERAL'], 120),
      ai: int(env['RATE_LIMIT_AI'], 20),
      shares: int(env['RATE_LIMIT_SHARES'], 20),
    }),
    shares: Object.freeze({
      enabled: env['SHARES_ENABLED'] !== 'false',
      dbPath: env['SHARE_DB_PATH'] || './data/shares.db',
      ttlHours: Object.freeze([1, 24, 168]),
    }),
    webDir: overrides.webDir ?? 'dist/web',
  });
}
