import { Router, type LightRouter } from '../http/router';
import { z } from 'zod';
import { actorOf, h, me, requireRole } from '../http/auth';
import { rateLimit, type RateLimiter } from '../http/rateLimit';
import { parse } from '../http/validate';
import type { Deps } from '../services/context';
import * as assignments from '../services/assignments';
import * as content from '../services/content';
import { isJobName, JOB_NAMES, runJob } from '../services/cron';
import { invalidateIndexCache as invalidateKnowledgeCache } from '../services/retrieval';
import { ApiError } from '../http/errors';
import * as mentor from '../services/mentor';
import * as guides from '../services/mentor-guides';
import * as aiQuality from '../services/mentor-quality';
import * as knowledge from '../services/knowledge';
import * as mediaIngest from '../services/media-ingest';
import * as mediaLibrary from '../services/media-library';
import * as notify from '../services/notify';
import * as pushCampaigns from '../services/push-campaigns';
import * as policies from '../services/policies';
import * as reports from '../services/reports';
import * as users from '../services/users';

const id = (req: { params: Record<string, string | undefined> }, k = 'id') =>
  String(req.params[k] ?? '');

/** Spec §21.4 — admin+ only. roles.manage / transcripts restricted to superadmin in services. */
export function adminRouter(d: Deps, limiter: RateLimiter): LightRouter {
  const r = Router();
  r.use('/admin', requireRole('admin', 'superadmin'));
  // Anything an admin changes may be something the mentor teaches from: flag the index as stale so
  // the next mentor question re-indexes it (incremental — unchanged items cost nothing).
  r.use('/admin', (req, _res, next) => {
    const write =
      req.method !== 'GET' && !/^\/admin\/(jobs|mentor|knowledge\/reindex)/.test(req.path ?? '');
    if (!write) return next();
    void knowledge.markKnowledgeDirty(d).finally(() => next());
  });

  r.get(
    '/admin/dashboard',
    h(async () => reports.adminDashboard(d)),
  );
  r.get(
    '/admin/content/tree',
    h(async () => content.contentTree(d)),
  );

  // Brands / products
  r.get(
    '/admin/brands',
    h(async () => content.listBrandsAdmin(d)),
  );
  r.post(
    '/admin/brands',
    h(
      async (req) => content.createBrand(d, actorOf(req), parse(content.brandSchema, req.body)),
      201,
    ),
  );
  r.patch(
    '/admin/brands/:id',
    h(async (req) =>
      content.updateBrand(d, actorOf(req), id(req), parse(content.brandPatchSchema, req.body)),
    ),
  );
  r.get(
    '/admin/products',
    h(async (req) => {
      const q = parse(
        z.object({
          brandId: z.string().max(80).optional(),
          q: z.string().max(80).optional(),
          archived: z.enum(['true', 'false']).optional(),
        }),
        req.query,
      );
      return content.listProductsAdmin(d, {
        brandId: q.brandId,
        q: q.q,
        archived: q.archived === undefined ? undefined : q.archived === 'true',
      });
    }),
  );
  r.post(
    '/admin/products',
    h(
      async (req) => content.createProduct(d, actorOf(req), parse(content.productSchema, req.body)),
      201,
    ),
  );
  r.patch(
    '/admin/products/:id',
    h(async (req) =>
      content.updateProduct(d, actorOf(req), id(req), parse(content.productPatchSchema, req.body)),
    ),
  );

  // Media (D28)
  r.post(
    '/admin/media/upload-url',
    rateLimit(limiter, 'upload', 30, 60_000, (req) => me(req).id),
    h(
      async (req) =>
        content.createUploadUrl(d, actorOf(req), parse(content.uploadUrlSchema, req.body)),
      201,
    ),
  );
  r.post(
    '/admin/media/:id/finalize',
    h(async (req) =>
      content.finalizeMedia(d, actorOf(req), id(req), parse(content.finalizeSchema, req.body)),
    ),
  );

  // Media library: resumable uploads + organisation by brand / product
  const libraryLimit = rateLimit(limiter, 'library', 600, 60_000, (req) => me(req).id);
  r.get(
    '/admin/media/library',
    h(async (req) =>
      mediaLibrary.listLibrary(d, parse(mediaLibrary.libraryQuerySchema, req.query)),
    ),
  );
  r.post(
    '/admin/media/library/uploads',
    libraryLimit,
    h(
      async (req) =>
        mediaLibrary.startLibraryUpload(
          d,
          actorOf(req),
          parse(mediaLibrary.libraryUploadSchema, req.body),
        ),
      201,
    ),
  );
  r.post(
    '/admin/media/library/uploads/:id/parts',
    libraryLimit,
    h(async (req) =>
      mediaLibrary.libraryPartUrls(
        d,
        actorOf(req),
        id(req),
        parse(mediaLibrary.partUrlsSchema, req.body),
      ),
    ),
  );
  r.post(
    '/admin/media/library/uploads/:id/complete',
    libraryLimit,
    h(async (req) =>
      mediaLibrary.completeLibraryUpload(
        d,
        actorOf(req),
        id(req),
        parse(mediaLibrary.libraryCompleteSchema, req.body),
      ),
    ),
  );
  r.delete(
    '/admin/media/library/uploads/:id',
    h(async (req) => mediaLibrary.abortLibraryUpload(d, actorOf(req), id(req))),
  );
  r.get(
    '/admin/media/library/:id/preview-url',
    h(async (req) => mediaLibrary.libraryPreviewUrl(d, id(req))),
  );
  r.patch(
    '/admin/media/library/:id',
    h(async (req) =>
      mediaLibrary.updateLibraryItem(
        d,
        actorOf(req),
        id(req),
        parse(mediaLibrary.libraryPatchSchema, req.body),
      ),
    ),
  );
  r.delete(
    '/admin/media/library/:id',
    h(async (req) => mediaLibrary.deleteLibraryItem(d, actorOf(req), id(req))),
  );

  // Packages / sections
  r.get(
    '/admin/packages',
    h(async (req) => content.listPackagesAdmin(d, parse(content.adminPackageQuery, req.query))),
  );
  r.post(
    '/admin/packages',
    h(
      async (req) => content.createPackage(d, actorOf(req), parse(content.packageSchema, req.body)),
      201,
    ),
  );
  r.get(
    '/admin/packages/:id',
    h(async (req) => content.getPackageAdmin(d, id(req))),
  );
  r.patch(
    '/admin/packages/:id',
    h(async (req) =>
      content.updatePackage(d, actorOf(req), id(req), parse(content.packagePatchSchema, req.body)),
    ),
  );
  r.post(
    '/admin/packages/:id/publish',
    h(async (req) =>
      content.publishPackage(d, actorOf(req), id(req), {
        // Default: visible to all marketers. Send { "audience": "none" } to publish without an audience.
        defaultAudience: (req.body as { audience?: string } | undefined)?.audience !== 'none',
      }),
    ),
  );
  r.post(
    '/admin/packages/:id/unpublish',
    h(async (req) => content.unpublishPackage(d, actorOf(req), id(req))),
  );
  r.post(
    '/admin/packages/:id/archive',
    h(async (req) => content.archivePackage(d, actorOf(req), id(req))),
  );
  r.post(
    '/admin/packages/:id/unarchive',
    h(async (req) => content.unarchivePackage(d, actorOf(req), id(req), { defaultAudience: true })),
  );
  r.post(
    '/admin/packages/:id/sections',
    h(
      async (req) =>
        content.createSection(d, actorOf(req), id(req), parse(content.sectionSchema, req.body)),
      201,
    ),
  );
  r.put(
    '/admin/packages/:id/sections/order',
    h(async (req) =>
      content.reorderSections(d, actorOf(req), id(req), parse(content.reorderSchema, req.body).ids),
    ),
  );
  r.patch(
    '/admin/packages/:id/sections/:sid',
    h(async (req) =>
      content.updateSection(
        d,
        actorOf(req),
        id(req),
        id(req, 'sid'),
        parse(content.sectionPatchSchema, req.body),
      ),
    ),
  );

  // Quiz builder
  r.get(
    '/admin/quizzes/:id',
    h(async (req) => content.getQuizAdmin(d, id(req))),
  );
  r.patch(
    '/admin/quizzes/:id',
    h(async (req) =>
      content.updateQuizSettings(
        d,
        actorOf(req),
        id(req),
        parse(content.quizSettingsSchema, req.body),
      ),
    ),
  );
  r.post(
    '/admin/quizzes/:id/questions',
    h(
      async (req) =>
        content.addQuestion(d, actorOf(req), id(req), parse(content.questionSchema, req.body)),
      201,
    ),
  );
  r.put(
    '/admin/quizzes/:id/questions/order',
    h(async (req) =>
      content.reorderQuestions(
        d,
        actorOf(req),
        id(req),
        parse(content.reorderSchema, req.body).ids,
      ),
    ),
  );
  r.put(
    '/admin/quizzes/:id/questions/:qid',
    h(async (req) =>
      content.updateQuestion(
        d,
        actorOf(req),
        id(req),
        id(req, 'qid'),
        parse(content.questionSchema, req.body),
      ),
    ),
  );
  r.delete(
    '/admin/quizzes/:id/questions/:qid',
    h(async (req) => content.archiveQuestion(d, actorOf(req), id(req), id(req, 'qid')), 204),
  );

  // Paths & assignments
  r.get(
    '/admin/paths',
    h(async () => assignments.listPaths(d)),
  );
  r.post(
    '/admin/paths',
    h(
      async (req) =>
        assignments.createPath(d, actorOf(req), parse(assignments.pathSchema, req.body)),
      201,
    ),
  );
  r.put(
    '/admin/paths/:id',
    h(async (req) =>
      assignments.updatePath(d, actorOf(req), id(req), parse(assignments.pathSchema, req.body)),
    ),
  );
  r.delete(
    '/admin/paths/:id',
    h(async (req) => assignments.archivePath(d, actorOf(req), id(req)), 204),
  );
  r.post(
    '/admin/paths/:id/apply-deadlines',
    h(async (req) => assignments.applyPathDeadlines(d, actorOf(req), id(req))),
  );
  r.get(
    '/admin/assignments',
    h(async (req) => assignments.listAssignments(d, req.query.includeRevoked === 'true')),
  );
  r.post(
    '/admin/assignments',
    h(
      async (req) =>
        assignments.createAssignment(
          d,
          actorOf(req),
          parse(assignments.assignmentSchema, req.body),
        ),
      201,
    ),
  );
  r.delete(
    '/admin/assignments/:id',
    h(async (req) => assignments.revokeAssignment(d, actorOf(req), id(req))),
  );

  // Users & teams
  r.get(
    '/admin/users',
    h(async (req) => users.listUsers(d, parse(users.adminUserQuery, req.query))),
  );
  r.get(
    '/admin/users/:id',
    h(async (req) => reports.userTimeline(d, me(req), id(req))),
  );
  r.patch(
    '/admin/users/:id',
    h(async (req) =>
      users.adminUpdateUser(d, actorOf(req), id(req), parse(users.adminPatchUserSchema, req.body)),
    ),
  );
  r.post(
    '/admin/users/:id/reset-password',
    rateLimit(limiter, 'reset', 10, 60_000, (req) => me(req).id),
    h(async (req) => users.adminResetPassword(d, actorOf(req), id(req))),
  );
  r.get(
    '/admin/teams',
    h(async () => users.listTeams(d)),
  );
  r.post(
    '/admin/teams',
    h(async (req) => users.createTeam(d, actorOf(req), parse(users.teamSchema, req.body)), 201),
  );
  r.patch(
    '/admin/teams/:id',
    h(async (req) =>
      users.updateTeam(
        d,
        actorOf(req),
        id(req),
        parse(users.teamSchema.partial().extend({ archived: z.boolean().optional() }), req.body),
      ),
    ),
  );

  // Reports
  r.get(
    '/admin/reports/completion',
    h(async (req) => reports.adminCompletion(d, parse(reports.reportQuery, req.query))),
  );
  r.get(
    '/admin/reports/quizzes',
    h(async (req) => reports.adminQuizReport(d, parse(reports.quizReportQuery, req.query))),
  );
  r.get(
    '/admin/reports/kpis',
    h(async () => reports.adminKpis(d)),
  );
  r.get(
    '/admin/reports/mentor',
    h(async () => mentor.mentorStats(d)),
  );
  // AI quality dashboard: provider mix, failovers, latency, unknown rate, voice minutes.
  r.get(
    '/admin/reports/mentor-quality',
    h(async () => aiQuality.aiQualityReport(d)),
  );
  // Knowledge index (what the assistant knows) — stats + health of the embeddings + coverage
  // of the multimodal library (how much of the uploaded media is machine-readable yet).
  r.get(
    '/admin/knowledge',
    h(async () => ({
      ...(await knowledge.knowledgeStats(d)),
      media: await mediaIngest.mediaCoverage(d),
    })),
  );
  // Read new media (video/audio/image/PDF) into structured knowledge, then rebuild the index.
  r.post(
    '/admin/knowledge/extract',
    requireRole('superadmin'),
    rateLimit(
      limiter,
      'reindex',
      6,
      60 * 60_000,
      (req) => me(req).id,
      'استخراج محتوا حداکثر ۶ بار در ساعت ممکن است.',
    ),
    h(async (req) => {
      const body = parse(
        z.object({
          limit: z.number().int().min(1).max(50).optional(),
          only: z.enum(['sections', 'products', 'all']).optional(),
        }),
        req.body ?? {},
      );
      const extraction = await mediaIngest.extractPendingMedia(d, body);
      invalidateKnowledgeCache(d);
      return extraction;
    }),
  );
  // Rebuild the whole index (incremental); also runs daily in the mentor-daily cron slot.
  r.post(
    '/admin/knowledge/rebuild',
    requireRole('superadmin'),
    rateLimit(
      limiter,
      'reindex',
      3,
      60 * 60_000,
      (req) => me(req).id,
      'بازسازی ایندکس حداکثر ۳ بار در ساعت ممکن است.',
    ),
    h(async (req) => {
      const result = await knowledge.rebuildKnowledgeIndex(d, {
        embed: parse(z.object({ embed: z.boolean().optional() }), req.body).embed !== false,
      });
      invalidateKnowledgeCache(d);
      return result;
    }),
  );
  // ── Mentor behaviour boxes (جعبه‌ی رفتار منتور) — one per brand / product + a global default ──
  r.get(
    '/admin/mentor/guides',
    h(async (req) => guides.listGuides(d, parse(guides.guideListQuery, req.query))),
  );
  r.get(
    '/admin/mentor/guides/global',
    h(async () => guides.getGuide(d, 'global', null)),
  );
  r.put(
    '/admin/mentor/guides/global',
    h(async (req) =>
      guides.upsertGuide(d, actorOf(req), 'global', null, parse(guides.guideSchema, req.body)),
    ),
  );
  for (const kind of ['brand', 'product'] as const) {
    r.get(
      `/admin/mentor/guides/${kind}/:id`,
      h(async (req) => guides.getGuide(d, kind, id(req))),
    );
    r.put(
      `/admin/mentor/guides/${kind}/:id`,
      h(async (req) =>
        guides.upsertGuide(d, actorOf(req), kind, id(req), parse(guides.guideSchema, req.body)),
      ),
    );
    r.delete(
      `/admin/mentor/guides/${kind}/:id`,
      h(async (req) => guides.deleteGuide(d, actorOf(req), kind, id(req))),
    );
  }

  r.get(
    '/admin/retake-requests',
    h(async (req) =>
      reports.listRetakes(
        d,
        me(req),
        parse(
          z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }),
          req.query,
        ).status,
      ),
    ),
  );
  const retakeNote = z.object({ note: z.string().trim().max(500).nullable().optional() });
  for (const decision of ['approved', 'rejected'] as const)
    r.post(
      `/admin/retake-requests/:id/${decision === 'approved' ? 'approve' : 'reject'}`,
      h(async (req) =>
        reports.reviewRetake(
          d,
          me(req),
          id(req),
          decision,
          parse(retakeNote, req.body).note ?? null,
        ),
      ),
    );
  r.get(
    '/admin/mentor/transcripts/:userId',
    requireRole('superadmin'),
    h(async (req) => mentor.mentorTranscript(d, actorOf(req), id(req, 'userId'))),
  );

  // Notifications
  r.get(
    '/admin/notification-templates',
    h(async () => notify.getTemplates(d)),
  );
  r.put(
    '/admin/notification-templates/:key',
    h(async (req) =>
      notify.updateTemplate(
        d,
        actorOf(req),
        id(req, 'key'),
        parse(notify.templateSchema, req.body),
      ),
    ),
  );
  r.post(
    '/admin/notifications/send',
    rateLimit(
      limiter,
      'manual-send',
      5,
      60 * 60_000,
      (req) => me(req).id,
      'ارسال دستی اعلان حداکثر ۵ بار در ساعت ممکن است.',
    ),
    h(async (req) => notify.manualSend(d, actorOf(req), parse(notify.manualSendSchema, req.body))),
  );

  // Push campaigns (studio). All routes are admin+ (router-level), every write is audited, and
  // `send` requires an Idempotency-Key so a retried request can never start a second send.
  r.get(
    '/admin/push-campaigns/dashboard',
    h(async () => pushCampaigns.dashboard(d)),
  );
  r.get(
    '/admin/push-campaigns',
    h(async (req) => {
      const q = parse(
        z.object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(200).optional(),
          status: z
            .enum([
              'draft',
              'scheduled',
              'queued',
              'sending',
              'sent',
              'sent_with_errors',
              'failed',
              'cancelled',
            ])
            .optional(),
          includeArchived: z
            .enum(['true', 'false'])
            .optional()
            .transform((v) => v === 'true'),
        }),
        req.query,
      );
      return pushCampaigns.listCampaigns(d, q);
    }),
  );
  r.post(
    '/admin/push-campaigns',
    h(
      async (req) =>
        pushCampaigns.createCampaign(
          d,
          actorOf(req),
          parse(pushCampaigns.campaignSchema, req.body),
        ),
      201,
    ),
  );
  r.post(
    '/admin/push-campaigns/audience-preview',
    h(async (req) =>
      pushCampaigns.audiencePreview(
        d,
        parse(pushCampaigns.audiencePreviewSchema, req.body).audience,
      ),
    ),
  );
  r.post(
    '/admin/push-campaigns/test-self',
    rateLimit(
      limiter,
      'push-campaign-test-self',
      20,
      60 * 60_000,
      (req) => me(req).id,
      'ارسال تست حداکثر ۲۰ بار در ساعت ممکن است.',
    ),
    h(async (req) =>
      pushCampaigns.sendSelfTest(d, actorOf(req), parse(pushCampaigns.selfTestSchema, req.body)),
    ),
  );
  r.get(
    '/admin/push-campaigns/:id',
    h(async (req) => pushCampaigns.campaignDetail(d, id(req))),
  );
  r.patch(
    '/admin/push-campaigns/:id',
    h(async (req) =>
      pushCampaigns.updateCampaign(
        d,
        actorOf(req),
        id(req),
        parse(pushCampaigns.campaignUpdateSchema, req.body),
      ),
    ),
  );
  r.post(
    '/admin/push-campaigns/:id/send',
    rateLimit(
      limiter,
      'push-campaign-send',
      10,
      60 * 60_000,
      (req) => me(req).id,
      'ارسال کمپین حداکثر ۱۰ بار در ساعت ممکن است.',
    ),
    h(async (req) => {
      const key = String(req.get('Idempotency-Key') ?? '').trim();
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
        throw new ApiError(
          'VALIDATION',
          'کلید درخواست (Idempotency-Key) معتبر نیست. صفحه را بازخوانی کنید.',
        );
      return pushCampaigns.sendCampaignNow(d, actorOf(req), id(req), key);
    }),
  );
  r.post(
    '/admin/push-campaigns/:id/cancel',
    h(async (req) => pushCampaigns.cancelCampaign(d, actorOf(req), id(req))),
  );
  r.delete(
    '/admin/push-campaigns/:id',
    h(async (req) => pushCampaigns.archiveCampaign(d, actorOf(req), id(req))),
  );

  // Policies & audit
  r.get(
    '/admin/policies',
    h(async () => policies.readPolicy(d)),
  );
  r.put(
    '/admin/policies',
    h(async (req) =>
      policies.updatePolicy(d, actorOf(req), parse(policies.policySchema, req.body)),
    ),
  );
  r.get(
    '/admin/audit-logs',
    h(async (req) => reports.listAudit(d, parse(reports.auditQuery, req.query))),
  );

  // Manual job trigger (superadmin) — useful on dev / when schedules are paused.
  // Same job table the cron triggers use, so a manual run cannot drift from a scheduled one.
  r.post(
    '/admin/jobs/:name',
    requireRole('superadmin'),
    h(async (req) => {
      const name = id(req, 'name');
      if (!isJobName(name))
        throw new ApiError(
          'NOT_FOUND',
          `کار زمان‌بندی‌شده «${name}» شناخته نشده است. (${JOB_NAMES.join('، ')})`,
        );
      return runJob(d, name, { force: true });
    }),
  );
  return r;
}
