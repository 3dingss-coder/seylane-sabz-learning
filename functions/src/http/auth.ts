import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Doc } from '../store/types';
import type { Role, User } from '../domain/types';
import type { Actor, Deps } from '../services/context';
import { ApiError } from './errors';

declare module 'express-serve-static-core' {
  interface Request {
    user?: Doc<User>;
  }
}

/** Verifies the bearer token and loads the user. Role/status are always read fresh from the DB. */
export function authenticate(d: Deps): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return next(new ApiError('UNAUTHENTICATED'));
    d.auth
      .verify(token)
      .then(async (claims) => {
        if (!claims) throw new ApiError('UNAUTHENTICATED');
        const user = await d.store.get<User>(`users/${claims.uid}`);
        if (!user) throw new ApiError('UNAUTHENTICATED');
        if (user.status !== 'active')
          throw new ApiError(
            'UNAUTHENTICATED',
            'حساب شما غیرفعال شده است. با مدیر خود تماس بگیرید.',
          );
        req.user = user;
        next();
      })
      .catch(next);
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new ApiError('FORBIDDEN'));
    next();
  };
}

export function me(req: Request): Doc<User> {
  if (!req.user) throw new ApiError('UNAUTHENTICATED');
  return req.user;
}

export function actorOf(req: Request): Actor {
  const u = me(req);
  return {
    id: u.id,
    role: u.role,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 200) ?? null,
  };
}

/** Wraps async handlers; the resolved value is sent as `{ data }`. */
export function h(
  fn: (req: Request, res: Response) => Promise<unknown>,
  status = 200,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res)
      .then((data) => {
        if (res.headersSent) return;
        if (status === 204) res.status(204).end();
        else res.status(status).json({ data });
      })
      .catch(next);
  };
}
