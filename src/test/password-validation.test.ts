import { describe, expect, it } from 'vitest';
import { validatePassword } from '@/lib/password-validation';

describe('password validation', () => {
  it('accepts a password that meets the shared policy', () => {
    expect(validatePassword('Claims2026')).toBeNull();
  });

  it.each([
    ['', 'Password is required.'],
    ['Short1', 'Password must be at least 8 characters long.'],
    ['CLAIMS2026', 'Password must include a lowercase letter.'],
    ['claims2026', 'Password must include an uppercase letter.'],
    ['ClaimsOnly', 'Password must include a number.'],
  ])('rejects invalid password %s', (password, message) => {
    expect(validatePassword(password)).toBe(message);
  });
});
