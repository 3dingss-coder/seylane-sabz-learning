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
import * as aiQuality from '../services/mentor-quality';
import * as knowledge from '../services/knowledge';
import * as mediaIngest from '../services/media-ingest';
import * as notify from '../services/notify';
import * as policies from '../services/policies';
import * as reports from '../services/reports';
import * as users from '../services/users';

const id = (req: { params: Record<string, string | undefined> }, k = 'id') =>
  String(req.params[k] ?? '');

/** Spec §21.4 — admin+ only. roles.manage / transcripts restricted to superadmin in services. */
export function adminRouter(d: Deps, limiter: RateLimiter): LightRouter {
  const r = Router();
  r.use('/admin', requireRole('admin', 'superadmin'));

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
    h(async (req) => content.publishPackage(d, actorOf(req), id(req))),
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
    h(async (req) => content.unarchivePackage(d, actorOf(req), id(req))),
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
