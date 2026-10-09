'use strict';

/**
 * Fail-closed compatibility endpoint. Netlify is not the supported API runtime: it cannot provide
 * the configured D1 persistence bindings here, so never initialize the Worker adapter with an
 * in-memory production fallback. The API is served by the Cloudflare Worker.
 */
exports.handler = async function handler() {
  return {
    statusCode: 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '60',
    },
    body: JSON.stringify({
      error: {
        code: 'UNAVAILABLE',
        message: 'این API روی Netlify فعال نیست؛ از Worker تنظیم‌شده استفاده کنید.',
      },
    }),
  };
};
