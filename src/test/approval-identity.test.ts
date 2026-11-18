import { describe, expect, it } from 'vitest';
import { profileSignatureStoragePath, serverObservedClientIp } from '../../supabase/functions/claim-approval/identity-helpers';

describe('approval identity capture helpers', () => {
  it('uses the platform client IP headers and never trusts forwarded-for', () => {
    expect(serverObservedClientIp(new Headers({ 'cf-connecting-ip': '203.0.113.42', 'x-forwarded-for': '198.51.100.99' }))).toBe('203.0.113.42');
    expect(serverObservedClientIp(new Headers({ 'x-forwarded-for': '198.51.100.99', 'x-real-ip': '192.0.2.44' }))).toBe('192.0.2.44');
    expect(serverObservedClientIp(new Headers({ 'cf-connecting-ip': 'invalid', 'x-real-ip': '192.0.2.44' }))).toBe('192.0.2.44');
    expect(serverObservedClientIp(new Headers({ 'cf-connecting-ip': '203.0.113.42, 198.51.100.99' }))).toBeNull();
    expect(serverObservedClientIp(new Headers({ 'cf-connecting-ip': 'not-an-ip' }))).toBeNull();
    expect(serverObservedClientIp(new Headers({ 'cf-connecting-ip': '2001:db8::20' }))).toBe('2001:db8::20');
  });

  it('accepts only signature objects in the profile signature folder', () => {
    expect(profileSignatureStoragePath('https://project.supabase.co/storage/v1/object/public/user-avatars/signatures/person@example.com/123.png', 'https://project.supabase.co'))
      .toBe('signatures/person@example.com/123.png');
    expect(profileSignatureStoragePath('https://example.com/storage/v1/object/public/user-avatars/signatures/signature.png', 'https://project.supabase.co')).toBeNull();
    expect(profileSignatureStoragePath('https://project.supabase.co/storage/v1/object/public/user-avatars/signatures/%2e%2e/private.png', 'https://project.supabase.co')).toBeNull();
  });
});
