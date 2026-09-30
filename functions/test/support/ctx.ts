import { RecordingMailer } from '../../src/mail/types';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { MemoryAuthProvider } from '../../src/auth/memory';
import { LocalBlobStore } from '../../src/blob/local';
import { loadConfig } from '../../src/config';
import type { Package, Role, User } from '../../src/domain/types';
import { RateLimiter } from '../../src/http/rateLimit';
import type { AiHub } from '../../src/ai/hub';
import { FakeLlm, type LlmClient } from '../../src/llm/types';
import { RecordingPushSender } from '../../src/push/types';
import { SYSTEM, type Deps } from '../../src/services/context';
import * as content from '../../src/services/content';
import { register } from '../../src/services/users';
import { MemoryStore } from '../../src/store/memory';
import type { DocStore, QuerySpec } from '../../src/store/types';

/** A minimal valid MP4 header with an mvhd atom (duration = seconds). */
export function fakeMp4(seconds: number, audio = false): Buffer {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4, 'latin1');
  ftyp.write(audio ? 'M4A ' : 'isom', 8, 'latin1');
  const mvhd = Buffer.alloc(8 + 100);
  mvhd.writeUInt32BE(108, 0);
  mvhd.write('mvhd', 4, 'latin1');
  mvhd.writeUInt8(0, 8);
  mvhd.writeUInt32BE(1000, 8 + 12);
  mvhd.writeUInt32BE(seconds * 1000, 8 + 16);
  const moov = Buffer.alloc(8);
  moov.writeUInt32BE(8 + mvhd.length, 0);
  moov.write('moov', 4, 'latin1');
  return Buffer.concat([ftyp, moov, mvhd]);
}

async function makeStore(): Promise<DocStore> {
  let store: DocStore;
  if (process.env.TEST_BACKEND === 'firestore') {
    const { getFirestoreForTests } = await import('./firestore');
    store = await getFirestoreForTests();
  } else store = new MemoryStore();
  return process.env.QUERY_LOG ? withQueryLog(store, process.env.QUERY_LOG) : store;
}

/** Records query shapes (collection, filter fields/ops, orderBy) for scripts/check-indexes.mjs. */
function withQueryLog(store: DocStore, file: string): DocStore {
  const original = store.query.bind(store);
  store.query = (async (spec: QuerySpec) => {
    const collection = spec.collection.split('/').pop() ?? spec.collection;
    const shape = {
      collection,
      where: (spec.where ?? []).map(([f, op]) => [f, op]),
      orderBy: spec.orderBy ?? [],
    };
    fs.appendFileSync(file, `${JSON.stringify(shape)}\n`);
    return original(spec);
  }) as DocStore['query'];
  return store;
}

export interface TestCtx {
  deps: Deps & { push: RecordingPushSender; mail: RecordingMailer };
  app: Express;
  limiter: RateLimiter;
  now: { value: Date };
  advance(ms: number): void;
  setNow(iso: string): void;
  user(
    role: Role,
    opts?: { teamId?: string | null; name?: string; brandIds?: string[] },
  ): Promise<{ id: string; token: string; phone: string }>;
  api(token?: string): {
    get: (url: string) => request.Test;
    post: (url: string, body?: object) => request.Test;
    put: (url: string, body?: object) => request.Test;
    patch: (url: string, body?: object) => request.Test;
    del: (url: string, body?: object) => request.Test;
  };
}

let phoneSeq = 0;

export async function createCtx(
  opts: { llm?: LlmClient | null; start?: string; ai?: AiHub } = {},
): Promise<TestCtx> {
  const now = { value: new Date(opts.start ?? '2026-10-03T06:30:00.000Z') }; // 10:00 Tehran, Saturday
  const clock = () => new Date(now.value.getTime());
  const store = await makeStore();
  const config = loadConfig({
    APP_ENV: 'test',
    ALLOWED_ORIGINS: 'https://app.example.com',
    LOCAL_AUTH_SECRET: 'test-secret',
  } as NodeJS.ProcessEnv);
  // Dot-directory root mirrors the local dev layout (.local-data/) — regression for sendFile dotfiles.
  const blobRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-blob-')), '.blobs');
  const deps = {
    config,
    store,
    auth: new MemoryAuthProvider(store, 'test-secret', () => clock().getTime()),
    blob: new LocalBlobStore(blobRoot, 'test-secret', () => clock().getTime()),
    push: new RecordingPushSender(),
    mail: new RecordingMailer(),
    llm: opts.llm === undefined ? new FakeLlm() : opts.llm,
    ...(opts.ai ? { ai: opts.ai } : {}),
    clock,
  };
  const limiter = new RateLimiter(() => clock().getTime());
  const app = createApp(deps, { limiter });
  const ctx: TestCtx = {
    deps,
    app,
    limiter,
    now,
    advance: (ms) => (now.value = new Date(now.value.getTime() + ms)),
    setNow: (iso) => (now.value = new Date(iso)),
    async user(role, o = {}) {
      phoneSeq++;
      const phone = `0912${String(1000000 + phoneSeq).slice(-7)}`;
      const u = await register(
        deps,
        { name: o.name ?? `کاربر ${phoneSeq}`, identifier: phone, password: 'pass1234' },
        role,
        { teamId: o.teamId ?? null, brandIds: o.brandIds ?? [] },
      );
      const signed = await deps.auth.signIn(`${phone}@phone.seylane-sabz.app`, 'pass1234');
      if (!signed.ok) throw new Error('sign-in failed');
      return { id: u.id, token: signed.tokens.idToken, phone };
    },
    api(token) {
      const withAuth = (t: request.Test) => (token ? t.set('Authorization', `Bearer ${token}`) : t);
      return {
        get: (url) => withAuth(request(app).get(url)),
        post: (url, body) => withAuth(request(app).post(url)).send(body ?? {}),
        put: (url, body) => withAuth(request(app).put(url)).send(body ?? {}),
        patch: (url, body) => withAuth(request(app).patch(url)).send(body ?? {}),
        del: (url, body) => withAuth(request(app).delete(url)).send(body ?? {}),
      };
    },
  };
  return ctx;
}

export interface Fixture {
  brandId: string;
  productId: string;
  packageId: string;
  sections: Array<{
    id: string;
    quizId: string;
    durationSec: number;
    questionIds: string[];
    answers: Record<string, string>;
  }>;
}

/** Brand → product → published package with N file sections (fake MP4) and 3-question quizzes. */
export async function buildFixture(
  ctx: TestCtx,
  o: {
    sections?: number;
    durationSec?: number;
    deadlineDays?: number;
    assign?: 'global' | 'none';
    title?: string;
  } = {},
): Promise<Fixture> {
  const d = ctx.deps;
  const iso = d.clock().toISOString();
  const brandId = `brand-${d.store.newId().slice(0, 6).toLowerCase()}`;
  await d.store.set(`brands/${brandId}`, {
    name: `برند ${brandId}`,
    nameLatin: null,
    logoUrl: '/v1/files/public/brands/x/logo.png',
    logoPath: null,
    logoIsFallback: false,
    sortOrder: 1,
    archived: false,
    source: 'catalog',
    createdAt: iso,
    updatedAt: iso,
  });
  const productId = `sb-${d.store.newId().slice(0, 8)}`;
  await d.store.set(`products/${productId}`, {
    brandId,
    name: 'کرم مرطوب کننده نمونه',
    code: null,
    barcode: null,
    category: 'مراقبت پوست',
    description: 'این کرم برای پوست خشک و حساس مناسب است و ماندگاری بالایی دارد.',
    imageUrl: '/x.png',
    imagePath: null,
    imageIsFallback: false,
    archived: false,
    source: 'catalog',
    createdAt: iso,
    updatedAt: iso,
  });
  const deadline = new Date(d.clock().getTime() + (o.deadlineDays ?? 7) * 86400_000).toISOString();
  const pkg = await content.createPackage(d, SYSTEM, {
    title: o.title ?? 'آموزش کرم مرطوب کننده',
    description: 'معرفی کرم مرطوب کننده برای پوست خشک',
    brandId,
    productId,
    deadlineAt: deadline,
  });
  const dur = o.durationSec ?? 300;
  const sections: Fixture['sections'] = [];
  for (let i = 0; i < (o.sections ?? 2); i++) {
    const up = await content.createUploadUrl(d, SYSTEM, {
      kind: 'video',
      fileName: `s${i}.mp4`,
      mime: 'video/mp4',
      sizeBytes: 200,
    });
    const asset = await d.store.get<{ path: string }>(`media/${up.mediaId}`);
    await d.blob.put(asset?.path ?? '', fakeMp4(dur), 'video/mp4');
    await content.finalizeMedia(d, SYSTEM, up.mediaId, {});
    const s = await content.createSection(d, SYSTEM, pkg.id, {
      title: `قسمت ${i + 1}`,
      description: `توضیح قسمت ${i + 1} درباره آبرسانی پوست`,
      transcript: 'نکته فروش: این کرم برای پوست خشک و حساس مناسب است.',
      mediaType: 'video',
      mediaSource: 'file',
      mediaId: up.mediaId,
    });
    const qids: string[] = [];
    const answers: Record<string, string> = {};
    for (let q = 0; q < 3; q++) {
      const created = await content.addQuestion(d, SYSTEM, s.quizId, {
        stem: `سؤال ${q + 1} قسمت ${i + 1}؟`,
        options: ['گزینه یک', 'گزینه دو', 'گزینه سه', 'گزینه چهار'],
        answerKey: 'b',
        explanation: 'چون گزینه دو درست است.',
      });
      qids.push(created.id);
      answers[created.id] = 'b';
    }
    sections.push({ id: s.id, quizId: s.quizId, durationSec: dur, questionIds: qids, answers });
  }
  await content.publishPackage(d, SYSTEM, pkg.id);
  if ((o.assign ?? 'global') === 'global') {
    await d.store.set(`assignments/fx-${pkg.id}`, {
      type: 'global',
      targetId: null,
      packageIds: [pkg.id],
      createdBy: 'test',
      createdAt: iso,
      revokedAt: null,
      revokedBy: null,
    });
  }
  return { brandId, productId, packageId: pkg.id, sections };
}

/** Sends heartbeats until the section is completed (70s deltas). */
export async function watchSection(
  ctx: TestCtx,
  token: string,
  sectionId: string,
  durationSec: number,
) {
  let pos = 0;
  for (let i = 0; pos < durationSec; i++) {
    const delta = Math.min(60, durationSec - pos);
    pos += delta;
    ctx.advance(delta * 1000); // real time passes while listening (wall-clock budget)
    ctx.limiter.reset();
    const res = await ctx
      .api(token)
      .post(`/v1/me/sections/${sectionId}/progress`, { positionSec: pos, playedDeltaSec: delta })
      .set('Idempotency-Key', `w-${sectionId}-${i}`);
    if (res.status !== 200)
      throw new Error(`heartbeat failed ${res.status} ${JSON.stringify(res.body)}`);
  }
}

export async function passQuiz(
  ctx: TestCtx,
  token: string,
  quizId: string,
  answers: Record<string, string>,
) {
  const start = await ctx.api(token).post(`/v1/me/quizzes/${quizId}/attempts`);
  if (start.status !== 201)
    throw new Error(`start failed ${start.status} ${JSON.stringify(start.body)}`);
  return ctx.api(token).post(`/v1/me/attempts/${start.body.data.attemptId}/submit`, { answers });
}

export type { Package, User };
