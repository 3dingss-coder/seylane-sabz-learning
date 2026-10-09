import type { Mailer } from '../mail/types';
import type { AiHub } from '../ai/hub';
import type { AppConfig } from '../config';
import type { AuthProvider } from '../auth/types';
import type { RateLimitStore } from '../http/rateLimit';
import type { BlobStore } from '../blob/types';
import type { LlmClient } from '../llm/types';
import type { PushSender } from '../push/types';
import type { DocStore, TxOps } from '../store/types';
import type { Clock } from '../lib/time';
import { DAY } from '../lib/time';
import { DEFAULT_POLICY } from '../domain/policy';
import type { Policy, Role } from '../domain/types';

/** Everything a service needs; built once per process (see deps.ts). */
export interface Deps {
  config: AppConfig;
  store: DocStore;
  auth: AuthProvider;
  /** Shared limiter backend, when the deployment platform provides one. */
  rateLimitStore?: RateLimitStore;
  blob: BlobStore;
  push: PushSender;
  mail: Mailer;
  llm: LlmClient | null;
  /**
   * Multi-provider AI hub (Gemini + Groq + legacy). Optional: when absent it is built lazily from
   * `config` (see ai/hub.ts), so every existing Deps builder keeps working unchanged. Tests inject
   * a hub here to pin providers deterministically.
   */
  ai?: AiHub;
  clock: Clock;
}

export interface Actor {
  id: string;
  role: Role | 'system';
  ip?: string | null;
  userAgent?: string | null;
}
export const SYSTEM: Actor = { id: 'system', role: 'system' };

export const nowIso = (d: Deps) => d.clock().toISOString();

const policyCache = new WeakMap<Deps, { at: number; value: Policy }>();

export async function getPolicy(d: Deps): Promise<Policy> {
  const cached = policyCache.get(d);
  const now = d.clock().getTime();
  if (cached && now - cached.at < 30_000) return cached.value;
  const doc = await d.store.get<Policy>('policies/global');
  const value: Policy = { ...DEFAULT_POLICY, updatedAt: '', updatedBy: null, ...(doc ?? {}) };
  policyCache.set(d, { at: now, value });
  return value;
}
export function invalidatePolicy(d: Deps) {
  policyCache.delete(d);
}

const SENSITIVE = /password|token|secret|apikey/i;
function mask(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(mask);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, SENSITIVE.test(k) ? '***' : mask(x)]),
    );
  }
  return v;
}

/** Audit trail (spec §24): role/policy/content/assignment/password changes. TTL 365d. */
export async function audit(
  d: Deps,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  before: unknown = null,
  after: unknown = null,
) {
  const now = d.clock();
  await d.store.set(`audit_logs/${d.store.newId()}`, {
    actorId: actor.id,
    actorRole: actor.role,
    action,
    entity,
    entityId,
    before: mask(before) ?? null,
    after: mask(after) ?? null,
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
    createdAt: now.toISOString(),
    expireAt: new Date(now.getTime() + 365 * DAY),
  });
}

/** Stage an analytics row in an existing transaction (spec §25, D22). */
export function trackInTransaction(
  d: Deps,
  tx: Pick<TxOps, 'set'>,
  name: string,
  userId: string | null,
  props: Record<string, unknown> = {},
): void {
  const now = d.clock();
  tx.set(`analytics_events/${d.store.newId()}`, {
    name,
    userId,
    props,
    ts: now.toISOString(),
    expireAt: new Date(now.getTime() + 180 * DAY),
  });
}

/** Server-side analytics (spec §25, D22). No PII in props. TTL 180d. */
export async function track(
  d: Deps,
  name: string,
  userId: string | null,
  props: Record<string, unknown> = {},
) {
  const now = d.clock();
  await d.store.set(`analytics_events/${d.store.newId()}`, {
    name,
    userId,
    props,
    ts: now.toISOString(),
    expireAt: new Date(now.getTime() + 180 * DAY),
  });
}
