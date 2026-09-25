import type { ErrorRequestHandler } from 'express';
import type { ApiErrorBody } from '../../shared/types.js';

/** An error whose message is safe to show to the end user. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export interface Logger {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

interface BodyParserError {
  type?: string;
}

/**
 * Express error handler. Anything that is not an HttpError is reported as a
 * generic 500: internal messages, stack traces and document text never leave
 * the server, and the log line carries only the error's name and code.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  // Four parameters: Express identifies error handlers by arity.
  return (error: unknown, req, res, _next) => {
    let status = 500;
    let code = 'internal_error';
    let message = 'Something went wrong on our side. Please try again.';

    const parserType = (error as BodyParserError | null)?.type;
    if (error instanceof HttpError) {
      ({ status, code, message } = error);
    } else if (parserType === 'entity.too.large') {
      status = 413;
      code = 'payload_too_large';
      message = 'That request is too large.';
    } else if (parserType === 'entity.parse.failed') {
      status = 400;
      code = 'bad_json';
      message = 'The request body is not valid JSON.';
    } else if (parserType === 'charset.unsupported' || parserType === 'encoding.unsupported') {
      status = 415;
      code = 'unsupported_encoding';
      message = 'Unsupported request encoding.';
    }

    if (status >= 500) {
      const name = error instanceof Error ? error.name : typeof error;
      const detail = (error as { code?: unknown } | null)?.code;
      logger.error?.(`[${String(req.id)}] ${req.method} ${req.originalUrl.split('?')[0]} -> ${status} ${name}${detail ? ` (${String(detail)})` : ''}`);
    }
    const body: ApiErrorBody = { error: { code, message } };
    res.status(status).json(body);
  };
}
