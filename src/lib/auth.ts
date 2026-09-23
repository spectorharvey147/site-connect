import SHA256 from 'crypto-js/sha256';
import { supabase } from '@/integrations/supabase/client';
import { validatePassword } from '@/lib/password-validation';

export type UserRole = 'User' | 'Manager' | 'Admin' | 'Super Admin' | 'Accounts';
export interface AppUser { email: string; name: string; role: UserRole; profile_picture_url?: string | null; signature_url?: string | null }
export interface SessionData { token: string; user: AppUser }
export function isDemoEmail(_email?: string | null) { return false; }
// Used only by authorized account administration. Password verification runs on the server.
export function hashPassword(password: string): string { return SHA256(password).toString(); }
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to reach the authentication service. Please try again.';

export async function login(email: string, password: string): Promise<{ ok: boolean; message: string; session?: SessionData }> {
  if (!email.trim() || !password) return { ok: false, message: 'Email and password required.' };
  try {
    const { data, error } = await supabase.rpc('app_login', { p_email: email.trim().toLowerCase(), p_password: password });
    if (error) return { ok: false, message: error.message };
    return data;
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}
export async function verifyToken(token: string): Promise<AppUser | null> {
  if (!token || token.startsWith('demo:')) return null;
  const { data, error } = await supabase.rpc('app_session', { p_token: token });
  if (error) throw new Error(error.message);
  return data;
}
export async function logout(token: string) {
  if (token) {
    const { error } = await supabase.rpc('app_logout', { p_token: token });
    if (error) throw new Error(error.message);
  }
}
export function isAdmin(role: UserRole) { return role === 'Admin' || role === 'Super Admin'; }
export function isManagerOrAbove(role: UserRole) { return ['Manager', 'Admin', 'Super Admin'].includes(role); }
export async function changePassword(currentPassword: string, newPassword: string) {
  const passwordError = validatePassword(newPassword);
  if (passwordError) throw new Error(passwordError);
  const { error } = await supabase.rpc('app_change_password', { p_token: localStorage.getItem('claimsToken') || '', p_current_password: currentPassword, p_new_password: newPassword });
  if (error) throw new Error(error.message);
}
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  if (!email.trim()) return { ok: false, message: 'Email is required.' };
  try {
    const { error } = await supabase.functions.invoke('send-notification', { body: { type: 'password_reset', recipientEmail: email.trim().toLowerCase() } });
    if (error) return { ok: false, message: 'Unable to request a reset right now. Please try again.' };
    return { ok: true, message: 'If this email is registered, you will receive a password reset link.' };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}
export async function resetPassword(email: string, resetToken: string, newPassword: string): Promise<{ ok: boolean; message: string }> {
  const passwordError = validatePassword(newPassword);
  if (passwordError) return { ok: false, message: passwordError };
  try {
    const { error } = await supabase.rpc('app_reset_password', { p_email: email.trim().toLowerCase(), p_token: resetToken, p_password: newPassword });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Password reset successfully. Please sign in.' };
  } catch (error) { return { ok: false, message: errorMessage(error) }; }
}
