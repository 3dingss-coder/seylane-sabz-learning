import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError, toErrorBody } from './errors';

export const notFoundHandler: RequestHandler = (_req, res) => {
  const err = new ApiError('NOT_FOUND');
  res.status(err.status).json(toErrorBody(err));
};

// Express identifies error handlers by arity (4 args) — keep `_next`.
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json(toErrorBody(err));
    return;
  }
  // body-parser errors (payload too large / malformed JSON)
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type?: string }).type;
    if (type === 'entity.too.large') {
      const e = new ApiError('VALIDATION', 'حجم اطلاعات ارسالی بیش از حد مجاز است.');
      res.status(413).json(toErrorBody(e));
      return;
    }
    if (type === 'entity.parse.failed') {
      const e = new ApiError('VALIDATION');
      res.status(e.status).json(toErrorBody(e));
      return;
    }
  }
  console.error('Unhandled API error', err);
  const e = new ApiError('INTERNAL');
  res.status(e.status).json(toErrorBody(e));
};
