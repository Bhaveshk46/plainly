/**
 * Request validation with Zod. Unknown enum values, wrong types and oversized
 * inputs are rejected with a 400/413 and a stable error code; missing optional
 * fields take documented defaults. Unknown keys are ignored, never echoed.
 */

import { z } from 'zod';
import { normalizeDocument } from '../../shared/core/text.js';
import { DEFAULT_CONTEXT, JURISDICTIONS, LANGUAGES, ROLES, STAGES, type Context } from '../../shared/options.js';
import type { Config } from '../config.js';
import { HttpError } from './errors.js';

const MIN_DOC_CHARS = 40;
const BASE64 = /^[A-Za-z0-9+/\r\n]+={0,2}\s*$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

// Control characters are stripped from user-supplied one-liners on purpose.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Collapse to a single trimmed line: no control characters, no runs of whitespace. */
const singleLine = (value: string): string => value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();

const custom = (code: string, message: string, status = 400) => ({ error: message, params: { code, status } });

/** z.enum needs a non-empty tuple; the option lists are `as const`, so this is safe. */
const idEnum = <T extends string>(list: readonly { readonly id: T }[], name: string) =>
  z.enum(list.map((item) => item.id) as [T, ...T[]], { error: `"${name}" has an unsupported value.` });

const contextSchema = z
  .object(
    {
      role: idEnum(ROLES, 'role').default(DEFAULT_CONTEXT.role),
      stage: idEnum(STAGES, 'stage').default(DEFAULT_CONTEXT.stage),
      jurisdiction: idEnum(JURISDICTIONS, 'jurisdiction').default(DEFAULT_CONTEXT.jurisdiction),
      language: idEnum(LANGUAGES, 'language').default(DEFAULT_CONTEXT.language),
    },
    { error: '"context" must be an object.' },
  )
  .default({ ...DEFAULT_CONTEXT });

const flag = (name: string) => z.boolean({ error: `"${name}" must be true or false.` });

const optionsSchema = z
  .object({ redact: flag('redact').default(true), useAI: flag('useAI').default(true) }, { error: '"options" must be an object.' })
  .default({ redact: true, useAI: true });

export type Options = z.infer<typeof optionsSchema>;

/** Labels are echoed into prompts, so keep them short and single-line. */
const labelSchema = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((value) => singleLine((value ?? '').replace(/["<>`]/g, ' ')).slice(0, 60) || fallback);

export function createSchemas(limits: Config['limits'], ttlHours: readonly number[]) {
  const documentText = (name: string) =>
    z
      .string({ error: `"${name}" must be a string.` })
      .refine((value) => value.length <= limits.maxDocChars * 2, custom('text_too_long', `The document is too long (limit ${limits.maxDocChars.toLocaleString('en')} characters).`, 413))
      .transform(normalizeDocument)
      .refine((value) => value.length >= MIN_DOC_CHARS, custom('text_too_short', 'Please provide a longer document (at least a couple of sentences).'))
      .refine((value) => value.length <= limits.maxDocChars, custom('text_too_long', `The document is too long (limit ${limits.maxDocChars.toLocaleString('en')} characters).`, 413));

  const analyze = z.object({ text: documentText('text'), context: contextSchema, options: optionsSchema }, { error: 'Expected a JSON object.' });

  const side = (fallback: string) => z.object({ label: labelSchema(fallback), text: documentText('text') }, { error: 'Each document needs a "label" and "text".' });
  const compare = z
    .object({ a: side('Document A'), b: side('Document B'), context: contextSchema, options: optionsSchema }, { error: 'Expected a JSON object.' })
    .transform((body) => {
      if (body.a.label === body.b.label) return { ...body, a: { ...body.a, label: `${body.a.label} (1)` }, b: { ...body.b, label: `${body.b.label} (2)` } };
      return body;
    });

  const historyTurn = z.object(
    {
      q: z.string().transform((value) => value.slice(0, limits.maxQuestionChars)),
      a: z.string().transform((value) => value.slice(0, 1500)),
    },
    { error: 'Each history item needs "q" and "a" strings.' },
  );
  const ask = z.object(
    {
      text: documentText('text'),
      question: z
        .string({ error: '"question" must be a string.' })
        .transform(singleLine)
        .refine((value) => value.length >= 3, custom('question_too_short', 'Please ask a question.'))
        .refine((value) => value.length <= limits.maxQuestionChars, custom('question_too_long', `Questions can be at most ${limits.maxQuestionChars} characters.`)),
      history: z
        .array(historyTurn, { error: '"history" must be an array.' })
        .default([])
        .transform((turns) => turns.slice(-limits.maxHistoryTurns)),
      context: contextSchema,
      options: optionsSchema,
    },
    { error: 'Expected a JSON object.' },
  );

  const maxBase64 = Math.ceil((limits.maxUploadBytes * 4) / 3) + 16;
  const extract = z.object(
    {
      data: z
        .string({ error: 'Missing file data.' })
        .refine((value) => value.length > 0, custom('invalid_file', 'Missing file data.'))
        .refine((value) => value.length <= maxBase64, custom('file_too_large', `Files can be at most ${Math.floor(limits.maxUploadBytes / 1024 / 1024)} MB.`, 413))
        .refine((value) => BASE64.test(value), custom('invalid_file', 'The file data is not valid base64.'))
        .transform((value) => value.replace(/\s+/g, '')),
    },
    { error: 'Expected a JSON object.' },
  );

  // Shares carry opaque ciphertext: the server validates shape and size, never content.
  const maxCipherChars = Math.ceil((limits.maxShareBytes * 4) / 3) + 16;
  const shareCreate = z.object(
    {
      // A 12-byte IV is exactly 16 base64url characters. (.refine, not .regex/.length:
      // only refinements carry our stable error codes.)
      iv: z.string({ error: '"iv" must be a string.' }).refine((value) => value.length === 16 && BASE64URL.test(value), custom('invalid_share', '"iv" is not valid.')),
      ciphertext: z
        .string({ error: '"ciphertext" must be a string.' })
        .refine((value) => value.length <= maxCipherChars, custom('share_too_large', 'That brief is too large to share.', 413))
        .refine((value) => value.length >= 32, custom('invalid_share', '"ciphertext" is too short.'))
        .refine((value) => BASE64URL.test(value), custom('invalid_share', '"ciphertext" is not valid.')),
      ttlHours: z.number({ error: '"ttlHours" must be a number.' }).refine((value) => ttlHours.includes(value), custom('invalid_share', '"ttlHours" is not an allowed lifetime.')),
    },
    { error: 'Expected a JSON object.' },
  );

  return { analyze, compare, ask, extract, shareCreate };
}

export type Schemas = ReturnType<typeof createSchemas>;

const CODE_BY_ROOT: Readonly<Record<string, string>> = {
  text: 'invalid_text',
  context: 'invalid_context',
  options: 'invalid_options',
  question: 'invalid_question',
  history: 'invalid_history',
  data: 'invalid_file',
  a: 'invalid_text',
  b: 'invalid_text',
};

interface CustomParams {
  code?: string;
  status?: number;
}

/** Parse `body` or throw an HttpError describing the first problem. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const params = (issue as { params?: CustomParams } | undefined)?.params;
  const root = String(issue?.path[0] ?? '');
  throw new HttpError(params?.status ?? 400, params?.code ?? CODE_BY_ROOT[root] ?? 'invalid_body', issue?.message ?? 'Invalid request.');
}

export type AnalyzeInput = { text: string; context: Context; options: Options };
