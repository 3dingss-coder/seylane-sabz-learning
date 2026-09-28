import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createCtx } from './support/ctx';

let app: Express;
beforeAll(async () => {
  app = (await createCtx()).app;
});

describe('GET /v1/health', () => {
  it('returns standard success envelope', async () => {
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.env).toBe('test');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/v1/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows only allowlisted CORS origins', async () => {
    const ok = await request(app).get('/v1/health').set('Origin', 'https://app.example.com');
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.example.com');
    const bad = await request(app).get('/v1/health').set('Origin', 'https://evil.example.com');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('error envelope', () => {
  it('returns Persian 404 in standard error shape', async () => {
    const res = await request(app).get('/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toMatch(/[\u0600-\u06FF]/);
  });

  it('rejects payloads over 1MB', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ x: 'a'.repeat(1024 * 1024 + 10) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('handles malformed JSON with VALIDATION', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('protected routes require a token (401)', async () => {
    const res = await request(app).get('/v1/me/home');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
