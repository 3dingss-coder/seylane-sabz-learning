import type { NextFunction, Request, RequestHandler, Response } from 'express';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface CompiledPattern {
  regex: RegExp;
  keys: string[];
}

function compilePattern(pattern: string): CompiledPattern {
  const keys: string[] = [];
  const escaped = pattern
    .replace(/\/+$/, '')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z0-9_]+)/g, (_m, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
  return {
    regex: new RegExp(`^${escaped || '/'}$`),
    keys,
  };
}

function matchesPrefix(reqPath: string, prefix: string): boolean {
  const p = prefix.replace(/\/+$/, '') || '/';
  if (p === '/') return true;
  return reqPath === p || reqPath.startsWith(`${p}/`);
}

interface Layer {
  kind: 'route' | 'use';
  method?: Method;
  compiled?: CompiledPattern;
  prefixes?: string[];
  handlers: RequestHandler[];
}

export interface LightRouter {
  (req: Request, res: Response, next: NextFunction): void;
  get(path: string, ...handlers: RequestHandler[]): LightRouter;
  post(path: string, ...handlers: RequestHandler[]): LightRouter;
  put(path: string, ...handlers: RequestHandler[]): LightRouter;
  patch(path: string, ...handlers: RequestHandler[]): LightRouter;
  delete(path: string, ...handlers: RequestHandler[]): LightRouter;
  use(
    first: string | string[] | RequestHandler | LightRouter,
    ...rest: Array<RequestHandler | LightRouter>
  ): LightRouter;
}

/**
 * Lightweight, edge-safe Express-compatible Router with zero Node `http`/`fs`/`stream` dependencies.
 * Can be mounted directly inside an Express app (`app.use('/v1', router)`) or called directly
 * from Cloudflare Workers / Pages Functions (`router(req, res, done)`).
 */
export function Router(): LightRouter {
  const layers: Layer[] = [];

  const addRoute = (method: Method, path: string, handlers: RequestHandler[]) => {
    layers.push({
      kind: 'route',
      method,
      compiled: compilePattern(path),
      handlers,
    });
    return router;
  };

  const router = ((req: Request, res: Response, outNext: NextFunction) => {
    const rawPath = (req.path || req.url.split('?')[0] || '/').replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase() as Method;
    let layerIdx = 0;

    const nextLayer = (err?: unknown): void => {
      if (err) {
        outNext(err);
        return;
      }
      if (res.headersSent) return;
      const layer = layers[layerIdx++];
      if (!layer) {
        outNext();
        return;
      }

      if (layer.kind === 'use') {
        if (layer.prefixes && !layer.prefixes.some((pr) => matchesPrefix(rawPath, pr))) {
          nextLayer();
          return;
        }
        runHandlers(layer.handlers, req, res, nextLayer);
        return;
      }

      if (layer.method !== method || !layer.compiled) {
        nextLayer();
        return;
      }
      const m = layer.compiled.regex.exec(rawPath);
      if (!m) {
        nextLayer();
        return;
      }
      const prevParams = req.params;
      const nextParams: Record<string, string> = { ...(prevParams ?? {}) };
      layer.compiled.keys.forEach((k, idx) => {
        const val = m[idx + 1];
        if (val !== undefined) {
          try {
            nextParams[k] = decodeURIComponent(val);
          } catch {
            nextParams[k] = val;
          }
        }
      });
      req.params = nextParams;
      runHandlers(layer.handlers, req, res, (handlerErr?: unknown) => {
        req.params = prevParams;
        nextLayer(handlerErr);
      });
    };

    nextLayer();
  }) as LightRouter;

  function runHandlers(
    handlers: RequestHandler[],
    req: Request,
    res: Response,
    done: (err?: unknown) => void,
  ) {
    let idx = 0;
    const step = (err?: unknown): void => {
      if (err) {
        done(err);
        return;
      }
      if (res.headersSent) return;
      const fn = handlers[idx++];
      if (!fn) {
        done();
        return;
      }
      try {
        fn(req, res, step as NextFunction);
      } catch (syncErr) {
        done(syncErr);
      }
    };
    step();
  }

  router.get = (path, ...handlers) => addRoute('GET', path, handlers);
  router.post = (path, ...handlers) => addRoute('POST', path, handlers);
  router.put = (path, ...handlers) => addRoute('PUT', path, handlers);
  router.patch = (path, ...handlers) => addRoute('PATCH', path, handlers);
  router.delete = (path, ...handlers) => addRoute('DELETE', path, handlers);
  router.use = (first, ...rest) => {
    if (typeof first === 'string') {
      layers.push({
        kind: 'use',
        prefixes: [first],
        handlers: rest as RequestHandler[],
      });
    } else if (Array.isArray(first)) {
      layers.push({
        kind: 'use',
        prefixes: first,
        handlers: rest as RequestHandler[],
      });
    } else {
      layers.push({
        kind: 'use',
        handlers: [first as RequestHandler, ...(rest as RequestHandler[])],
      });
    }
    return router;
  };

  return router;
}
