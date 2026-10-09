import { describe, expect, it } from 'vitest';
import { parseServiceAccount } from './fcm-http';

describe('parseServiceAccount', () => {
  it('rejects missing or malformed service-account data', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('not-json')).toBeNull();
    expect(
      parseServiceAccount(
        JSON.stringify({
          project_id: 'project',
          client_email: 'push@example.invalid',
          private_key: 'not-a-pem-key',
        }),
      ),
    ).toBeNull();
  });

  it('accepts required fields and normalizes escaped PEM newlines', () => {
    const parsed = parseServiceAccount(
      JSON.stringify({
        project_id: ' project ',
        client_email: ' push@example.invalid ',
        private_key: '-----BEGIN PRIVATE KEY-----\\nZm9v\\n-----END PRIVATE KEY-----',
      }),
    );
    expect(parsed).toEqual({
      project_id: 'project',
      client_email: 'push@example.invalid',
      private_key: '-----BEGIN PRIVATE KEY-----\nZm9v\n-----END PRIVATE KEY-----',
    });
  });
});
