import SHA256 from 'crypto-js/sha256';
import { supabase } from '@/integrations/supabase/client';
import { sendEmail } from '@/lib/send-email';

export type UserRole = 'User' | 'Manager' | 'Admin' | 'Super Admin';

export interface AppUser {
  email: string;
  name: string;
  role: UserRole;
  profile_picture_url?: string | null;
}

export interface SessionData {
  token: string;
  user: AppUser;
}

export function isDemoEmail(email?: string | null) {
  return false;
}

function generateSecureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hashPassword(password: string): string {
  return SHA256(password).toString();
}

export async function login(email: string, password: string): Promise<{ ok: boolean; message?: string; session?: SessionData }> {
  email = email.trim().toLowerCase();
  if (!email || !password) return { ok: false, message: 'Email and password required.' };

  const hashedInput = hashPassword(password);

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) return { ok: false, message: 'Invalid email or password.' };
  if ((user as any).password_hash !== hashedInput) return { ok: false, message: 'Invalid email or password.' };
  if ((user as any).active === false) return { ok: false, message: 'Account is deactivated.' };

  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: sessionError } = await supabase.from('sessions').insert({
    token,
    user_email: email,
    role: (user as any).role,
    expires_at: expiresAt,
  });

  if (sessionError) return { ok: false, message: 'Failed to create session.' };

  const session: SessionData = {
    token,
    user: {
      email: (user as any).email,
      name: (user as any).name,
      role: (user as any).role as UserRole,
      profile_picture_url: (user as any).profile_picture_url,
    },
  };

  return { ok: true, session };
}

export async function verifyToken(token: string): Promise<AppUser | null> {
  if (!token) return null;
  if (token.startsWith('demo:')) return null;

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  const { data: userData } = await supabase
    .from('users')
    .select('name, email, role, profile_picture_url')
    .eq('email', (data as any).user_email)
    .single();

  if (!userData) return null;

  return {
    email: (userData as any).email,
    name: (userData as any).name,
    role: (userData as any).role as UserRole,
    profile_picture_url: (userData as any).profile_picture_url,
  };
}

export async function logout(token: string) {
  if (token) {
    await supabase.from('sessions').delete().eq('token', token);
  }
}

export function isAdmin(role: UserRole) {
  return role === 'Admin' || role === 'Super Admin';
}

export function isManagerOrAbove(role: UserRole) {
  return role === 'Manager' || role === 'Admin' || role === 'Super Admin';
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message?: string }> {
  email = email.trim().toLowerCase();
  if (!email) return { ok: false, message: 'Email is required.' };

  const { data: user, error } = await supabase
    .from('users')
    .select('email')
    .eq('email', email)
    .single();

  if (error || !user) return { ok: false, message: 'If this email is registered, you will receive a password reset link.' };

  const resetToken = generateSecureToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  try {
    const { error: insertError } = await supabase.from('password_resets').insert({
      email,
      token: resetToken,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error('Password reset insert error:', insertError);
      return { ok: false, message: 'Failed to create reset request. Please try again.' };
    }

    const resetLink = `${window.location.origin}/reset-password?email=${encodeURIComponent(email)}&token=${resetToken}`;

    const emailResult = await sendEmail(email, 'password_reset', {
      resetLink,
      expiresIn: '1 hour',
    });

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      return { ok: true, message: 'If this email is registered, you will receive a password reset link.' };
    }

    return { ok: true, message: 'If this email is registered, you will receive a password reset link.' };
  } catch (error) {
    console.error('Password reset error:', error);
    return { ok: false, message: 'An error occurred. Please try again.' };
  }
}

export async function resetPassword(email: string, resetToken: string, newPassword: string): Promise<{ ok: boolean; message?: string }> {
  email = email.trim().toLowerCase();

  if (!email || !resetToken || !newPassword) {
    return { ok: false, message: 'Email, reset token, and password are required.' };
  }

  if (newPassword.length < 6) {
    return { ok: false, message: 'Password must be at least 6 characters long.' };
  }

  try {
    const { data: resetRequest, error: selectError } = await supabase
      .from('password_resets')
      .select('*')
      .eq('email', email)
      .eq('token', resetToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (selectError || !resetRequest) {
      return { ok: false, message: 'Invalid or expired reset token.' };
    }

    const hashedPassword = hashPassword(newPassword);
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: hashedPassword })
      .eq('email', email);

    if (updateError) {
      return { ok: false, message: 'Failed to update password. Please try again.' };
    }

    await supabase.from('password_resets').delete().eq('id', (resetRequest as any).id);
    sessionStorage.removeItem(`reset_token_${email}`);

    return { ok: true, message: 'Password has been reset successfully.' };
  } catch (error) {
    console.error('Reset password error:', error);
    return { ok: false, message: 'An error occurred. Please try again.' };
  }
}

export { hashPassword };
