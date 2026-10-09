import { describe, expect, it } from 'vitest';
import { campaignInputSchema, campaignStatusFromPushCounts } from './push-campaigns';

const validCampaign = {
  name: 'آغاز دوره جدید',
  title: 'دوره جدید منتشر شد',
  body: 'برای شروع آموزش وارد آکادمی شوید.',
  imageUrl: 'https://cdn.example.com/push.jpg',
  actionRef: '/home',
  audience: 'all',
  targetId: null,
  scheduledAt: null,
};

describe('campaignInputSchema', () => {
  it('accepts a valid draft with an HTTPS image and internal destination', () => {
    expect(campaignInputSchema.safeParse(validCampaign).success).toBe(true);
  });

  it('rejects non-HTTPS campaign images', () => {
    expect(
      campaignInputSchema.safeParse({
        ...validCampaign,
        imageUrl: 'http://cdn.example.com/push.jpg',
      }).success,
    ).toBe(false);
  });

  it('rejects external or protocol-relative click destinations', () => {
    expect(
      campaignInputSchema.safeParse({ ...validCampaign, actionRef: 'https://example.com' }).success,
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({ ...validCampaign, actionRef: '//example.com' }).success,
    ).toBe(false);
  });

  it('requires a target for non-global audiences', () => {
    expect(
      campaignInputSchema.safeParse({ ...validCampaign, audience: 'team', targetId: null }).success,
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({
        ...validCampaign,
        audience: 'team',
        targetId: 'team-1',
      }).success,
    ).toBe(true);
  });

  it('accepts a future ISO timestamp field shape for scheduled campaigns', () => {
    expect(
      campaignInputSchema.safeParse({
        ...validCampaign,
        scheduledAt: '2030-01-01T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('campaignStatusFromPushCounts', () => {
  it('does not mark a campaign failed when recipients have no registered device', () => {
    expect(campaignStatusFromPushCounts({ sent: 0, failed: 0, skipped: 9, deferred: 0 })).toBe(
      'sent',
    );
  });

  it('keeps no-device recipients separate from actual failures', () => {
    expect(campaignStatusFromPushCounts({ sent: 2, failed: 0, skipped: 7, deferred: 0 })).toBe(
      'partial',
    );
    expect(campaignStatusFromPushCounts({ sent: 0, failed: 2, skipped: 7, deferred: 0 })).toBe(
      'failed',
    );
  });

  it('preserves deferred-only campaigns as sent and actual mixed failures as partial', () => {
    expect(campaignStatusFromPushCounts({ sent: 0, failed: 0, skipped: 0, deferred: 3 })).toBe(
      'sent',
    );
    expect(campaignStatusFromPushCounts({ sent: 3, failed: 1, skipped: 0, deferred: 0 })).toBe(
      'partial',
    );
  });
});
