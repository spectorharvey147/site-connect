export const PASSWORD_REQUIREMENTS = 'Use at least 8 characters with uppercase, lowercase and a number.';

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/\d/.test(password)) return 'Password must include a number.';
  return null;
}
