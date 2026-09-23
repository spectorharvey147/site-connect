import { describe, expect, it, vi } from 'vitest';
import { login, normalizeRole } from '@/lib/auth';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => ({
      data: null,
      error: { message: 'AbortError: signal is aborted without reason' },
    })),
  },
}));

describe('authentication normalization', () => {
  it('shows a useful network message when Supabase returns an aborted request', async () => {
    const result = await login('accounts@example.com', 'password');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Unable to reach the Supabase server from this network');
  });

  it.each([
    ['accounts', 'Accounts'],
    ['account', 'Accounts'],
    ['super_admin', 'Super Admin'],
    ['Super-Admin', 'Super Admin'],
  ])('normalizes the %s role to %s', (source, expected) => {
    expect(normalizeRole(source)).toBe(expected);
  });
});
