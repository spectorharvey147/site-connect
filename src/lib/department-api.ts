import { supabase } from '@/integrations/supabase/client';

export interface DepartmentOption {
  id: string;
  name: string;
  code: string;
  active: boolean;
}

export interface DepartmentUser {
  email: string;
  name: string;
  role: string;
  active: boolean;
  departmentId: string | null;
}

export async function getDepartmentAllocationData() {
  const [departmentsResult, usersResult] = await Promise.all([
    supabase.from('departments').select('id,name,code,active').order('name'),
    supabase.from('users').select('email,name,role,active,department_id').order('name'),
  ]);
  if (departmentsResult.error) throw departmentsResult.error;
  if (usersResult.error) throw usersResult.error;

  const userRows = (usersResult.data || []) as Array<{
    email: string;
    name: string | null;
    role: string | null;
    active: boolean | null;
    department_id: string | null;
  }>;
  return {
    departments: (departmentsResult.data || []) as DepartmentOption[],
    users: userRows.map((user) => ({
      email: String(user.email || ''),
      name: String(user.name || ''),
      role: String(user.role || 'User'),
      active: user.active !== false,
      departmentId: user.department_id || null,
    })) as DepartmentUser[],
  };
}

export async function assignUsersToDepartment(userEmails: string[], departmentId: string | null) {
  const emails = [...new Set(userEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) throw new Error('Select at least one user.');

  const { data: selectedUsers, error: usersError } = await supabase.from('users').select('email,role,manager_email').in('email', emails);
  if (usersError) throw usersError;
  if ((selectedUsers || []).length !== emails.length) throw new Error('Some selected users are no longer available. Refresh the list and try again.');
  const selectedUserRows = (selectedUsers || []) as Array<{ role: string | null; manager_email: string | null }>;
  if (selectedUserRows.some((entry) => ['accounts', 'master admin'].includes(String(entry.role || '').toLowerCase()))) {
    throw new Error('Accounts and Master Admin remain central and cannot be assigned to a department.');
  }

  if (departmentId) {
    const { data, error } = await supabase.from('departments').select('id').eq('id', departmentId).eq('active', true).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Choose an active department.');
  }

  const assignedManagers = [...new Set(selectedUserRows
    .filter((entry) => String(entry.role || '').toLowerCase() === 'user' && entry.manager_email)
    .map((entry) => String(entry.manager_email).trim().toLowerCase()))];
  if (assignedManagers.length) {
    const { data: managers, error: managersError } = await supabase
      .from('users').select('email,role,department_id,active').in('email', assignedManagers);
    if (managersError) throw managersError;
    const managerByEmail = new Map(((managers || []) as Array<{ email: string; role: string; department_id: string | null; active: boolean }>)
      .map((manager) => [manager.email.toLowerCase(), manager]));
    const hasMismatchedManager = selectedUserRows.some((entry) => {
      if (String(entry.role || '').toLowerCase() !== 'user' || !entry.manager_email) return false;
      if (!departmentId) return true;
      const manager = managerByEmail.get(entry.manager_email.trim().toLowerCase());
      return !manager?.active
        || !['Manager', 'Super Admin'].includes(manager.role)
        || manager.department_id !== departmentId;
    });
    if (hasMismatchedManager) {
      throw new Error('Move the assigned manager to this department first, or reassign the user to a manager in this department. Users with a manager cannot be left unassigned.');
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update({ department_id: departmentId })
    .in('email', emails)
    .select('email');
  if (error) throw error;
  if (!data?.length) throw new Error('No users were updated. Refresh the list and try again.');
  return data.length;
}
