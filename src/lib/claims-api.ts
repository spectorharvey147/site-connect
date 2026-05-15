import { supabase } from '@/integrations/supabase/client';
import { hashPassword, isDemoEmail } from '@/lib/auth';

export interface ProjectCodeOption {
  code: string;
  label: string;
  project: string;
  allowsAllCategories: boolean;
  expenseCategories: string[];
}

function normalizeCategoryList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function isDemoMode() {
  return localStorage.getItem('claimsToken')?.startsWith('demo:') ?? false;
}

const STATUS_PENDING_ADMIN_VERIFICATION = 'Pending Admin Verification';
const STATUS_PENDING_MANAGER_APPROVAL = 'Pending Manager Approval';
const STATUS_PENDING_SUPER_ADMIN_APPROVAL = 'Pending Super Admin Approval';
const STATUS_CLOSED = 'Closed';
const STATUS_REJECTED = 'Rejected';
const DEFAULT_APP_URL = 'https://claimflow-pro-kappa.vercel.app';

function normalizeStatus(status?: string | null) {
  return String(status || '').trim().toLowerCase();
}

function isSettledStatus(status?: string | null) {
  const normalized = normalizeStatus(status);
  return normalized === 'closed' || (normalized.includes('approved') && !normalized.includes('pending') && !normalized.includes('reject'));
}

function isPendingAdminVerificationStatus(status?: string | null) {
  return normalizeStatus(status) === normalizeStatus(STATUS_PENDING_ADMIN_VERIFICATION);
}

function isPendingManagerStatus(status?: string | null) {
  return normalizeStatus(status) === normalizeStatus(STATUS_PENDING_MANAGER_APPROVAL);
}

function isPendingSuperAdminStatus(status?: string | null) {
  const normalized = normalizeStatus(status);
  return normalized === normalizeStatus(STATUS_PENDING_SUPER_ADMIN_APPROVAL) || normalized === 'pending admin approval';
}

function getClaimAmount(claim: any) {
  return parseFloat(claim?.verified_amount ?? claim?.grand_total ?? ((claim?.total_with_bill || 0) + (claim?.total_without_bill || 0)) ?? 0);
}

async function fetchClaimRowByAnyId(id: string) {
  // Try internal claim_id first, then claim_number
  const { data: rowById } = await supabase.from('claims').select('*').eq('claim_id', id).maybeSingle();
  if (rowById) return rowById;
  const { data: rowByNumber } = await supabase.from('claims').select('*').eq('claim_number', id).maybeSingle();
  if (rowByNumber) return rowByNumber;
  return null;
}

function getSubmittedAmount(claim: any) {
  return parseFloat(claim?.grand_total ?? ((claim?.total_with_bill || 0) + (claim?.total_without_bill || 0)) ?? 0);
}

function normalizeVerifiedAmount(value: number | undefined, fallback: number) {
  if (value == null || Number.isNaN(value)) return fallback;
  if (value < 0) throw new Error('Verified amount cannot be negative.');
  return value;
}

function isMissingVerifiedAmountColumnError(error: any) {
  const message = String(error?.message || error?.details || '');
  return message.includes("verified_amount") && message.includes("schema cache");
}

const demoUsersDirectory = [
  { name: 'Site User', email: 'user@siteconnect.demo', role: 'User', manager_email: 'manager@siteconnect.demo', advance_amount: 50000, active: true },
  { name: 'Team Manager', email: 'manager@siteconnect.demo', role: 'Manager', manager_email: '', advance_amount: 0, active: true },
  { name: 'Office Admin', email: 'admin@siteconnect.demo', role: 'Admin', manager_email: '', advance_amount: 0, active: true },
  { name: 'Super Admin', email: 'superadmin@siteconnect.demo', role: 'Super Admin', manager_email: '', advance_amount: 0, active: true },
];

const demoClaims = [
  {
    claimId: 'CLM-0001',
    claimIdInternal: 'C-DEMO-0001',
    date: new Date(Date.now() - 86400000).toISOString(),
    submittedBy: 'Site User',
    userEmail: 'user@siteconnect.demo',
    site: 'Metro Station Foundation',
    amount: 4200,
    totalWithBill: 4200,
    totalWithoutBill: 0,
    status: STATUS_PENDING_ADMIN_VERIFICATION,
    managerEmail: 'manager@siteconnect.demo',
    managerApprovalStatus: 'Not Started',
    fileIds: [],
    expenses: [
      { category: 'Travel', projectCode: 'PROJ-METRO-CC-TRAVEL', claimDate: new Date().toISOString().slice(0, 10), description: 'Cab and local travel for site inspection', amountWithBill: 4200, amountWithoutBill: 0, amount: 4200 },
    ],
  },
  {
    claimId: 'CLM-0002',
    claimIdInternal: 'C-DEMO-0002',
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
    submittedBy: 'Site User',
    userEmail: 'user@siteconnect.demo',
    site: 'Metro Station Foundation',
    amount: 12600,
    totalWithBill: 10000,
    totalWithoutBill: 2600,
    status: STATUS_PENDING_MANAGER_APPROVAL,
    managerEmail: 'manager@siteconnect.demo',
    managerApprovalStatus: 'Pending',
    fileIds: [],
    expenses: [
      { category: 'Food & Beverage', projectCode: 'PROJ-METRO-CC-FOOD', claimDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), description: 'Night shift refreshments', amountWithBill: 10000, amountWithoutBill: 2600, amount: 12600 },
    ],
  },
  {
    claimId: 'CLM-0003',
    claimIdInternal: 'C-DEMO-0003',
    date: new Date(Date.now() - 5 * 86400000).toISOString(),
    submittedBy: 'Site User',
    userEmail: 'user@siteconnect.demo',
    site: 'Warehouse Retrofit',
    amount: 65000,
    totalWithBill: 65000,
    totalWithoutBill: 0,
    status: STATUS_CLOSED,
    managerEmail: 'manager@siteconnect.demo',
    managerApprovalStatus: 'Approved',
    fileIds: [],
    expenses: [
      { category: 'Material', projectCode: 'PROJ-WARE-CC-MATERIAL', claimDate: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), description: 'Structural materials', amountWithBill: 65000, amountWithoutBill: 0, amount: 65000 },
    ],
  },
  {
    claimId: 'CLM-0004',
    claimIdInternal: 'C-DEMO-0004',
    date: new Date(Date.now() - 8 * 86400000).toISOString(),
    submittedBy: 'Site User',
    userEmail: 'user@siteconnect.demo',
    site: 'Metro Station Foundation',
    amount: 3200,
    totalWithBill: 0,
    totalWithoutBill: 3200,
    status: STATUS_REJECTED,
    rejectionReason: 'Duplicate expense',
    managerEmail: 'manager@siteconnect.demo',
    managerApprovalStatus: 'Rejected',
    fileIds: [],
    expenses: [
      { category: 'Fuel', projectCode: 'PROJ-METRO-CC-FUEL', claimDate: new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10), description: 'Duplicate fuel claim', amountWithBill: 0, amountWithoutBill: 3200, amount: 3200 },
    ],
  },
];

const demoProjectCodes: ProjectCodeOption[] = [
  { code: 'PROJ-METRO-CC-TRAVEL', label: 'Travel and conveyance', project: 'Metro Station Foundation', allowsAllCategories: false, expenseCategories: ['Travel'] },
  { code: 'PROJ-METRO-CC-FOOD', label: 'Food and beverage', project: 'Metro Station Foundation', allowsAllCategories: false, expenseCategories: ['Food & Beverage'] },
  { code: 'PROJ-METRO-CC-FUEL', label: 'Fuel and vehicle running', project: 'Metro Station Foundation', allowsAllCategories: false, expenseCategories: ['Fuel'] },
  { code: 'PROJ-WARE-CC-MATERIAL', label: 'Materials and consumables', project: 'Warehouse Retrofit', allowsAllCategories: false, expenseCategories: ['Material'] },
];

const demoCompanySettings = {
  company_name: 'Site Connect Demo',
  company_subtitle: 'Claims and Finance Management',
  logo_url: '/ipi-logo.jpg',
  support_email: 'support@siteconnect.demo',
  website: window.location.origin,
  currency_symbol: 'Rs.',
  email_notifications_enabled: false,
  require_manager_approval: true,
  auto_approve_below: 0,
};

function demoDropdownOptions() {
  const byProject: Record<string, ProjectCodeOption[]> = {};
  demoProjectCodes.forEach((code) => {
    if (!byProject[code.project]) byProject[code.project] = [];
    byProject[code.project].push(code);
  });
  return {
    projects: [
      { name: 'Metro Station Foundation', code: 'PROJ-METRO' },
      { name: 'Warehouse Retrofit', code: 'PROJ-WARE' },
    ],
    categories: ['Travel', 'Food & Beverage', 'Fuel', 'Material'],
    projectCodes: demoProjectCodes,
    byProject,
  };
}

function visibleDemoClaims(userEmail: string, userRole: string) {
  const role = userRole.toLowerCase();
  if (role === 'admin' || role === 'super admin') return demoClaims;
  if (role === 'manager') return demoClaims.filter((claim) => claim.managerEmail === userEmail || claim.userEmail === userEmail);
  return demoClaims.filter((claim) => claim.userEmail === userEmail);
}

// ============= ADMIN CHECK =============
export async function checkAdminExists(): Promise<boolean> {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .or('role.eq.Admin,role.eq.Super Admin');
  
  if (error) return true; // Assume admin exists on error for security
  return (count || 0) > 0;
}

export async function createFirstAdmin(data: { name: string; email: string; password: string }): Promise<{ ok: boolean; message?: string }> {
  // First verify no admin exists
  const adminExists = await checkAdminExists();
  if (adminExists) {
    return { ok: false, message: 'An admin account already exists. Please contact your administrator.' };
  }

  const email = data.email.trim().toLowerCase();
  
  // Check if email already exists
  const { data: existing } = await supabase.from('users').select('email').eq('email', email).single();
  if (existing) {
    return { ok: false, message: 'This email is already registered.' };
  }

  // Create the admin user
  const { error } = await supabase.from('users').insert({
    email,
    password_hash: hashPassword(data.password),
    name: data.name.trim(),
    role: 'Admin',
    advance_amount: 0,
    active: true,
  });

  if (error) {
    return { ok: false, message: 'Failed to create admin account. Please try again.' };
  }

  await logAudit('first_admin_created', email, 'user', email, 'First admin account created');
  return { ok: true, message: 'Admin account created successfully.' };
}

// ============= EMAIL NOTIFICATIONS =============
async function sendEmailNotification(type: string, recipientEmail: string, data?: any) {
  try {
    const normalizedRecipientEmail = String(recipientEmail || '').trim().toLowerCase();
    if (!normalizedRecipientEmail) return;
    const settings = await getCompanySettings();
    if (settings?.email_notifications_enabled === false) return;
    const { error } = await supabase.functions.invoke('send-notification', {
      body: {
        type,
        recipientEmail: normalizedRecipientEmail,
        data: {
          ...data,
          companyName: settings?.company_name || 'Irrigation Products International Pvt Ltd',
          companySubtitle: settings?.company_subtitle || 'Claims Management System',
          supportEmail: settings?.support_email || 'projects@ipi-india.com',
          logoUrl: settings?.logo_url || '/ipi-logo.jpg',
          appUrl: getAppUrl(settings),
          loginUrl: getAppUrl(settings),
          currency: settings?.currency_symbol || data?.currency || '₹',
        },
      },
    });
    if (error) console.warn('Email notification failed:', error);
  } catch (e) {
    console.warn('Email notification error:', e);
  }
}

function queueEmailNotifications(tasks: Array<Promise<void>>) {
  if (tasks.length === 0) return;
  void Promise.allSettled(tasks);
}

function normalizeAppUrl(url?: string | null) {
  return (url || '').trim().replace(/\/+$/, '');
}

function getAppUrl(settings?: { website?: string | null } | null) {
  return normalizeAppUrl(settings?.website)
    || (typeof window !== 'undefined' ? normalizeAppUrl(window.location.origin) : '')
    || DEFAULT_APP_URL;
}

function buildClaimActionLink(appUrl: string, claimId: string, action: 'approve' | 'reject', role: 'manager' | 'admin' | 'super-admin', approverEmail: string) {
  const baseUrl = normalizeAppUrl(appUrl);
  if (!baseUrl) return '';
  const params = new URLSearchParams({
    claimId,
    action,
    role,
    approverEmail,
  });
  return `${baseUrl}/claim-action?${params.toString()}`;
}

function mapAttachmentEmailData(fileIds?: string[]) {
  return (fileIds || []).map((fileId) => {
    const parts = fileId.split('/');
    const name = parts[parts.length - 1] || fileId;
    const { data } = supabase.storage.from('claim-attachments').getPublicUrl(fileId);
    return {
      name,
      url: data?.publicUrl || '',
    };
  });
}

async function getAdminApproverEmails() {
  const { data } = await supabase
    .from('users')
    .select('email')
    .eq('role', 'Admin')
    .eq('active', true);

  const adminEmails = [...new Set((data || []).map((user: any) => user.email).filter(Boolean))];
  if (adminEmails.length > 0) return adminEmails;
  return getSuperAdminApproverEmails();
}

async function getAdminVerifierEmails() {
  const { data } = await supabase
    .from('users')
    .select('email')
    .eq('role', 'Admin')
    .eq('active', true);

  const adminEmails = [...new Set((data || []).map((user: any) => user.email).filter(Boolean))];
  if (adminEmails.length > 0) return adminEmails;
  return getSuperAdminApproverEmails();
}

async function getSuperAdminApproverEmails() {
  const { data } = await supabase
    .from('users')
    .select('email')
    .eq('role', 'Super Admin')
    .eq('active', true);

  return [...new Set((data || []).map((user: any) => user.email).filter(Boolean))];
}

async function isManagerAlsoSuperAdmin(managerEmail?: string | null) {
  const normalizedManagerEmail = String(managerEmail || '').trim().toLowerCase();
  if (!normalizedManagerEmail) return false;

  // In this schema a Super Admin assigned as manager is the same-user skip case.
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('email', normalizedManagerEmail)
    .maybeSingle();

  return String((data as any)?.role || '').toLowerCase() === 'super admin';
}


// ============= DROPDOWN DATA =============
export async function getDropdownOptions() {
  if (isDemoMode()) return demoDropdownOptions();

  const { data, error } = await supabase.from('app_lists').select('*').eq('active', true);
  if (error || !data) {
    return { projects: [], categories: [], projectCodes: [] as ProjectCodeOption[], byProject: {} as Record<string, ProjectCodeOption[]> };
  }

  const categories = [...new Set(
    (data as any[]).filter(r => String(r.type || '').toLowerCase() === 'category')
      .map(r => String(r.value || '').trim()).filter(Boolean)
  )].sort();

  const projects = (data as any[])
    .filter(r => String(r.type || '').toLowerCase() === 'project')
    .map(r => ({ name: String(r.value || '').trim(), code: String(r.project_code || '').trim() }))
    .filter(p => p.name);

  const projectCodes = (data as any[])
    .filter(r => String(r.type || '').toLowerCase() === 'projectcode')
    .map((r) => ({
      code: String(r.project_code || '').trim(),
      label: String(r.value || '').trim(),
      project: String(r.project || '').trim(),
      allowsAllCategories: Boolean(r.allows_all_categories ?? true),
      expenseCategories: normalizeCategoryList(r.expense_categories),
    }))
    .filter((c) => c.code);

  const byProject: Record<string, ProjectCodeOption[]> = {};
  projectCodes.forEach(pc => {
    const key = pc.project || '';
    if (!byProject[key]) byProject[key] = [];
    byProject[key].push(pc);
  });

  Object.values(byProject).forEach((items) => {
    items.sort((a, b) => a.code.localeCompare(b.code) || a.label.localeCompare(b.label));
  });

  return { projects, categories, projectCodes, byProject };
}

// ============= COMPANY SETTINGS =============
export async function getCompanySettings() {
  if (isDemoMode()) return demoCompanySettings;

  const { data } = await supabase.from('company_settings').select('*').limit(1).single();
  return data as any;
}

export async function updateCompanySettings(settings: any) {
  if (isDemoMode()) return;

  const { data: existing } = await supabase.from('company_settings').select('id').limit(1).single();
  if (existing) {
    const { error } = await supabase.from('company_settings').update({ ...settings, updated_at: new Date().toISOString() } as any).eq('id', (existing as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('company_settings').insert({ ...settings } as any);
    if (error) throw error;
  }
}

// ============= DASHBOARD =============
export async function getDashboardSummary(userEmail: string, userRole: string) {
  if (isDemoEmail(userEmail)) {
    const claims = visibleDemoClaims(userEmail, userRole);
    const totalAmount = claims
      .filter((claim) => isSettledStatus(claim.status))
      .reduce((sum, claim) => sum + claim.amount, 0);
    if (userRole === 'User') {
      return {
        role: 'User',
        myClaims: claims.length,
        myAmount: totalAmount,
        myBalance: 50000 - demoClaims.reduce((sum, claim) => sum + claim.amount, 0) + totalAmount,
      };
    }
    return {
      role: userRole,
      totalClaims: claims.length,
      totalUsers: demoUsersDirectory.length,
      totalAmount,
      pendingClaims: claims.filter((claim) => claim.status.includes('Pending')).length,
      pendingManagerClaims: claims.filter((claim) => isPendingManagerStatus(claim.status)).length,
      pendingAdminClaims: claims.filter((claim) => isPendingAdminVerificationStatus(claim.status)).length,
      pendingFinalClaims: claims.filter((claim) => isPendingSuperAdminStatus(claim.status)).length,
    };
  }

  const role = userRole.toLowerCase();

  const { data: claims } = await supabase.from('claims').select('*');
  const { data: txs } = await supabase.from('transactions').select('reference_id, user_email').eq('type', 'claim_submitted');

  const claimOwnerMap: Record<string, string> = {};
  txs?.forEach((t: any) => { if (t.reference_id) claimOwnerMap[t.reference_id] = String(t.user_email || '').toLowerCase(); });

  const processedClaims = (claims || []).map((c: any) => ({
    id: c.claim_id,
    amount: getClaimAmount(c),
    status: String(c.status || '').toLowerCase(),
    managerStatus: String(c.manager_approval_status || '').toLowerCase(),
    managerEmail: String(c.manager_email || '').toLowerCase(),
    userEmail: c.user_email?.toLowerCase() || claimOwnerMap[c.claim_id] || '',
  }));

  if (['admin', 'super admin', 'manager'].includes(role)) {
    let total = 0, totalAmount = 0, pending = 0, pendingManager = 0, pendingAdmin = 0, pendingFinal = 0;
    const myEmail = userEmail.toLowerCase();

    for (const c of processedClaims) {
      let include = role === 'admin' || role === 'super admin';
      if (role === 'manager') {
        include = c.managerEmail === myEmail || c.userEmail === myEmail;
      }
      if (!include) continue;

      total++;
      if (isSettledStatus(c.status)) {
        totalAmount += c.amount;
      }
      if (c.status.includes('pending')) pending++;
      if (isPendingManagerStatus(c.status)) {
        if (role === 'manager') { if (c.managerEmail === myEmail) pendingManager++; }
        else pendingManager++;
      }
      if (isPendingAdminVerificationStatus(c.status)) pendingAdmin++;
      if (isPendingSuperAdminStatus(c.status)) pendingFinal++;
    }

    const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });

    return { role: userRole, totalClaims: total, totalUsers: userCount || 0, totalAmount, pendingClaims: pending, pendingManagerClaims: pendingManager, pendingAdminClaims: pendingAdmin, pendingFinalClaims: pendingFinal };
  } else {
    let myClaims = 0, myAmount = 0;
    const myEmail = userEmail.toLowerCase();
    for (const c of processedClaims) {
      if (c.userEmail === myEmail) {
        myClaims++;
        if (isSettledStatus(c.status)) {
          myAmount += c.amount;
        }
      }
    }
    const myBalance = await getCurrentBalance(myEmail);
    return { role: 'User', myClaims, myAmount, myBalance };
  }
}

// ============= BALANCE =============
export async function getCurrentBalance(email: string): Promise<number> {
  if (isDemoEmail(email)) return 50000 - demoClaims.reduce((sum, claim) => sum + claim.amount, 0) + 65000;

  const { data: lastTx } = await supabase
    .from('transactions').select('balance_after').eq('user_email', email)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (lastTx && (lastTx as any).balance_after != null) return parseFloat((lastTx as any).balance_after);

  const { data: user } = await supabase.from('users').select('advance_amount').eq('email', email).maybeSingle();
  if (user) return parseFloat((user as any).advance_amount) || 0;
  return 0;
}

// ============= CLAIMS =============
export async function submitClaim(claim: {
  site: string;
  expenses: Array<{ category: string; projectCode: string; claimDate: string; description: string; amountWithBill: number; amountWithoutBill: number }>;
  fileIds?: string[];
}, userEmail: string, userName: string) {
  if (isDemoEmail(userEmail)) {
    return { ok: true, message: `Demo claim submitted for ${userName}. Supabase was not changed.` };
  }

  const claimID = 'C-' + Date.now();
  
  // Generate claim_number in format CLM-0001, CLM-0002, etc.
  const { data: existingClaims } = await supabase.from('claims').select('claim_number', { count: 'exact' }).order('created_at', { ascending: false }).limit(1);
  let nextSequence = 1;
  if (existingClaims && existingClaims.length > 0) {
    const lastClaimNumber = (existingClaims[0] as any)?.claim_number;
    if (lastClaimNumber) {
      const match = lastClaimNumber.match(/\d+/);
      if (match) {
        nextSequence = parseInt(match[0]) + 1;
      }
    }
  }
  const claimNumber = `CLM-${String(nextSequence).padStart(4, '0')}`;
  
  let totalWithBill = 0, totalWithoutBill = 0;

  const expenseItems = claim.expenses.map(e => {
    totalWithBill += (e.amountWithBill || 0);
    totalWithoutBill += (e.amountWithoutBill || 0);
    return {
      claim_id: claimID,
      category: e.category,
      project_code: e.projectCode || '',
      expense_date: e.claimDate || null,
      description: e.description,
      amount_with_bill: e.amountWithBill || 0,
      amount_without_bill: e.amountWithoutBill || 0,
    };
  });

  // Get manager
  const { data: userRecord } = await supabase.from('users').select('manager_email').eq('email', userEmail).single();
  const managerEmail = String((userRecord as any)?.manager_email || '').trim().toLowerCase() || null;

  const grandTotal = totalWithBill + totalWithoutBill;

  // Get company workflow settings
  const companySettings = await getCompanySettings();
  const requireManager = companySettings?.require_manager_approval ?? true;
  const autoApproveThreshold = parseFloat(companySettings?.auto_approve_below || 0);

  let status = STATUS_PENDING_ADMIN_VERIFICATION;
  let managerApprovalStatus = 'Not Started';

  // Auto-approve if below threshold
  if (autoApproveThreshold > 0 && grandTotal <= autoApproveThreshold) {
    status = STATUS_CLOSED;
    managerApprovalStatus = 'Skipped';
  }

  // Get current balance
  const currentBalance = await getCurrentBalance(userEmail);
  const newBalance = currentBalance - grandTotal;

  const { error: cErr } = await supabase.from('claims').insert({
    claim_id: claimID,
    claim_number: claimNumber,
    user_email: userEmail,
    submitted_by: userName,
    site_name: claim.site,
    status,
    manager_email: managerEmail,
    manager_approval_status: managerApprovalStatus,
    total_with_bill: totalWithBill,
    total_without_bill: totalWithoutBill,
    drive_file_ids: claim.fileIds || [],
  });
  if (cErr) throw new Error('Claim insert failed: ' + cErr.message);

  const { error: eErr } = await supabase.from('expense_items').insert(expenseItems);
  if (eErr) throw new Error('Expense items insert failed: ' + eErr.message);

  const { error: tErr } = await supabase.from('transactions').insert({
    user_email: userEmail,
    admin_email: userEmail,
    type: 'claim_submitted',
    reference_id: claimID,
    credit: 0,
    debit: grandTotal,
    balance_after: newBalance,
    description: `Claim submission: ${claimNumber}`,
  });
  if (tErr) throw new Error('Transaction insert failed: ' + tErr.message);

  const attachmentsForEmail = mapAttachmentEmailData(claim.fileIds);
  const primaryProjectCode = claim.expenses.find((expense) => expense.projectCode)?.projectCode || '';
  const expenseItemsForEmail = claim.expenses.map((expense) => ({
    category: expense.category,
    projectCode: expense.projectCode,
    claimDate: expense.claimDate,
    description: expense.description,
    amountWithBill: expense.amountWithBill || 0,
    amountWithoutBill: expense.amountWithoutBill || 0,
    amount: (expense.amountWithBill || 0) + (expense.amountWithoutBill || 0),
    totalAmount: (expense.amountWithBill || 0) + (expense.amountWithoutBill || 0),
  }));
  const appUrl = getAppUrl(companySettings);

  // Notifications & audit
  await logAudit('claim_submitted', userEmail, 'claim', claimID, `Amount: ₹${grandTotal}`);
  if (status === STATUS_CLOSED) {
    // Auto-closed below the configured threshold.
    const bal = await getCurrentBalance(userEmail);
    await supabase.from('transactions').insert({
      user_email: userEmail,
      admin_email: 'system',
      type: 'claim_approved',
      reference_id: claimID,
      credit: grandTotal,
      debit: 0,
      balance_after: bal + grandTotal,
        description: `Claim ${claimNumber} auto-approved (below threshold)`,
    });
    await createNotification(userEmail, 'Claim Auto-Approved', `Your claim ${claimID} (₹${grandTotal.toLocaleString('en-IN')}) was auto-approved.`, 'success', claimID);
  } else {
    const adminVerifiers = await getAdminVerifierEmails();
    await Promise.all(adminVerifiers.map((email) =>
      createNotification(email, 'Claim Awaiting Admin Verification', `${userName} submitted claim ${claimID} (Rs. ${grandTotal.toLocaleString('en-IN')})`, 'info', claimID)
    ));
    if (status === 'Pending Manager Approval' && managerEmail) {
      await createNotification(managerEmail, 'New Claim for Approval', `${userName} submitted claim ${claimID} (₹${grandTotal.toLocaleString('en-IN')})`, 'info', claimID);
    }
    if (status === 'Pending Admin Approval') {
      const adminApprovers = await getAdminApproverEmails();
      await Promise.all(adminApprovers.map((email) =>
        createNotification(email, 'New Claim for Approval', `${userName} submitted claim ${claimID} (₹${grandTotal.toLocaleString('en-IN')})`, 'info', claimID)
      ));
    }
    await createNotification(userEmail, 'Claim Submitted', `Your claim ${claimID} has been submitted successfully.`, 'success', claimID);
  }

  await sendEmailNotification('claim_submitted_user', userEmail, { 
    claim_id: claimID,
    claim_number: claimNumber, 
    generated_on: new Date().toISOString(),
    submitted_by: userName,
    submission_date: new Date().toISOString(),
    project_site: claim.site,
    primary_project_code: primaryProjectCode,
    status,
    total_amount: grandTotal, 
    total_with_bill: totalWithBill,
    total_without_bill: totalWithoutBill,
    employee_name: userName,
    currency: '₹',
    items: expenseItemsForEmail,
    attachments: attachmentsForEmail,
  });
  if (status === STATUS_PENDING_ADMIN_VERIFICATION) {
    const adminVerifiers = await getAdminVerifierEmails();
    await Promise.all(adminVerifiers.map((email) =>
      sendEmailNotification('claim_submitted_manager', email, {
        claim_id: claimID,
        claim_number: claimNumber,
        employee_name: userName,
        employee_email: userEmail,
        project_site: claim.site,
        primary_project_code: primaryProjectCode,
        submission_date: new Date().toISOString(),
        manager_status: managerEmail ? 'Not Started' : 'Not Required',
        admin_status: 'Pending Verification',
        total_amount: grandTotal,
        currency: 'Rs.',
        items: expenseItemsForEmail,
        attachments: attachmentsForEmail,
        approve_link: buildClaimActionLink(appUrl, claimID, 'approve', 'admin', email),
        reject_link: buildClaimActionLink(appUrl, claimID, 'reject', 'admin', email),
      })
    ));
  }
  if (status === 'Pending Manager Approval' && managerEmail) {
    await sendEmailNotification('claim_submitted_manager', managerEmail, { 
      claim_id: claimID,
      claim_number: claimNumber,
      employee_name: userName,
      employee_email: userEmail,
      project_site: claim.site,
      primary_project_code: primaryProjectCode,
      submission_date: new Date().toISOString(),
      manager_status: 'Pending',
      admin_status: 'Pending',
      total_amount: grandTotal,
      currency: '₹',
      items: expenseItemsForEmail,
      attachments: attachmentsForEmail,
      approve_link: buildClaimActionLink(appUrl, claimID, 'approve', 'manager', managerEmail),
      reject_link: buildClaimActionLink(appUrl, claimID, 'reject', 'manager', managerEmail)
    });
    const superAdminApprovers: string[] = [];
    await Promise.all(superAdminApprovers.map((email) =>
      sendEmailNotification('claim_submitted_manager', email, {
        claim_id: claimID,
        claim_number: claimNumber,
        employee_name: userName,
        employee_email: userEmail,
        project_site: claim.site,
        primary_project_code: primaryProjectCode,
        submission_date: new Date().toISOString(),
        manager_status: 'Pending',
        admin_status: 'Pending',
        total_amount: grandTotal,
        currency: '₹',
        items: expenseItemsForEmail,
        attachments: attachmentsForEmail,
        approve_link: buildClaimActionLink(appUrl, claimID, 'approve', 'admin', email),
        reject_link: buildClaimActionLink(appUrl, claimID, 'reject', 'admin', email),
      })
    ));
    await Promise.all(superAdminApprovers.map((email) =>
      sendEmailNotification('claim_submitted_manager', email, {
        claim_id: claimID,
        claim_number: claimNumber,
        employee_name: userName,
        employee_email: userEmail,
        project_site: claim.site,
        primary_project_code: primaryProjectCode,
        submission_date: new Date().toISOString(),
        manager_status: 'Pending',
        admin_status: 'Pending',
        total_amount: grandTotal,
        currency: '₹',
        items: expenseItemsForEmail,
        attachments: attachmentsForEmail,
        approve_link: buildClaimActionLink(appUrl, claimID, 'approve', 'manager', email),
        reject_link: buildClaimActionLink(appUrl, claimID, 'reject', 'manager', email),
      })
    ));
  } else if (status === 'Pending Admin Approval') {
    const adminApprovers = await getAdminApproverEmails();
    await Promise.all(adminApprovers.map((email) =>
      sendEmailNotification('claim_submitted_manager', email, {
        claim_id: claimID,
        claim_number: claimNumber,
        employee_name: userName,
        employee_email: userEmail,
        project_site: claim.site,
        primary_project_code: primaryProjectCode,
        submission_date: new Date().toISOString(),
        manager_status: requireManager ? 'Not Required / Skipped' : 'Not Required',
        admin_status: 'Pending',
        total_amount: grandTotal,
        currency: '₹',
        items: expenseItemsForEmail,
        attachments: attachmentsForEmail,
        approve_link: buildClaimActionLink(appUrl, claimID, 'approve', 'admin', email),
        reject_link: buildClaimActionLink(appUrl, claimID, 'reject', 'admin', email),
      })
    ));
  }

  return { ok: true, id: claimNumber, message: `Claim ${claimNumber} submitted. Status: ${status}` };
}

// ============= APPROVALS =============
export async function getPendingManagerClaims(userEmail: string, userRole: string) {
  if (isDemoEmail(userEmail)) {
    return visibleDemoClaims(userEmail, userRole)
      .filter((claim) => isPendingManagerStatus(claim.status))
      .map((claim) => ({ ...claim, claimId: claim.claimIdInternal }));
  }

  const { data: claims } = await supabase.from('claims').select('*')
    .eq('status', STATUS_PENDING_MANAGER_APPROVAL)
    .order('created_at', { ascending: false });

  if (!claims) return [];
  const myEmail = userEmail.toLowerCase();
  const role = userRole.toLowerCase();

  return (claims as any[]).filter(c => {
    if (role === 'admin' || role === 'super admin') return true;
    if (role === 'manager') return String(c.manager_email || '').toLowerCase() === myEmail;
    return false;
  }).map(c => ({
    claimId: c.claim_number || c.claim_id,
    claimIdInternal: c.claim_id,
    date: c.created_at,
    submittedBy: c.submitted_by,
    userEmail: c.user_email,
    site: c.site_name,
    totalWithBill: parseFloat(c.total_with_bill || 0),
    totalWithoutBill: parseFloat(c.total_without_bill || 0),
    submittedAmount: getSubmittedAmount(c),
    verifiedAmount: c.verified_amount == null ? null : parseFloat(c.verified_amount),
    amount: getClaimAmount(c),
    managerEmail: c.manager_email,
    status: c.status,
  }));
}

export async function getPendingAdminClaims() {
  if (isDemoMode()) {
    return demoClaims
      .filter((claim) => isPendingAdminVerificationStatus(claim.status))
      .map((claim) => ({ ...claim, claimId: claim.claimIdInternal }));
  }

  const { data: claims } = await supabase.from('claims').select('*').order('created_at', { ascending: false });
  if (!claims) return [];

  return (claims as any[]).filter(c => {
    return isPendingAdminVerificationStatus(c.status);
  }).map(c => ({
    claimId: c.claim_number || c.claim_id,
    claimIdInternal: c.claim_id,
    date: c.created_at,
    submittedBy: c.submitted_by,
    userEmail: c.user_email,
    site: c.site_name,
    totalWithBill: parseFloat(c.total_with_bill || 0),
    totalWithoutBill: parseFloat(c.total_without_bill || 0),
    submittedAmount: getSubmittedAmount(c),
    verifiedAmount: c.verified_amount == null ? null : parseFloat(c.verified_amount),
    amount: getClaimAmount(c),
    managerEmail: c.manager_email,
    status: c.status,
  }));
}

export async function getPendingSuperAdminClaims() {
  if (isDemoMode()) {
    return demoClaims
      .filter((claim) => isPendingSuperAdminStatus(claim.status))
      .map((claim) => ({ ...claim, claimId: claim.claimIdInternal }));
  }

  const { data: claims } = await supabase.from('claims').select('*').order('created_at', { ascending: false });
  if (!claims) return [];

  return (claims as any[]).filter(c => isPendingSuperAdminStatus(c.status)).map(c => ({
    claimId: c.claim_number || c.claim_id,
    claimIdInternal: c.claim_id,
    date: c.created_at,
    submittedBy: c.submitted_by,
    userEmail: c.user_email,
    site: c.site_name,
    totalWithBill: parseFloat(c.total_with_bill || 0),
    totalWithoutBill: parseFloat(c.total_without_bill || 0),
    submittedAmount: getSubmittedAmount(c),
    verifiedAmount: c.verified_amount == null ? null : parseFloat(c.verified_amount),
    amount: getClaimAmount(c),
    managerEmail: c.manager_email,
    status: c.status,
  }));
}

export async function approveClaimAsManager(claimId: string, approverEmail: string, description?: string, verifiedAmountInput?: number) {
  if (isDemoEmail(approverEmail)) return;

  const { data: claim } = await supabase.from('claims').select('*').eq('claim_id', claimId).single();
  if (!claim) throw new Error('Claim not found');
  const claimData = claim as any;
  
  const updates: any = {
    status: STATUS_PENDING_SUPER_ADMIN_APPROVAL,
    manager_approval_status: 'Approved',
    manager_approval_date: new Date().toISOString(),
  };
  if (verifiedAmountInput != null) {
    updates.verified_amount = normalizeVerifiedAmount(verifiedAmountInput, getClaimAmount(claimData) || getSubmittedAmount(claimData));
  }
  const { error } = await supabase.from('claims').update(updates).eq('claim_id', claimId);
  if (error) throw error;

  await logAudit('claim_manager_approved', approverEmail, 'claim', claimId, description || undefined);
  if (claim) {
    const superAdminApprovers = await getSuperAdminApproverEmails();
    const appUrl = getAppUrl(await getCompanySettings());
    await createNotification(claimData.user_email, 'Claim Approved by Manager', `Your claim ${claimId} has been approved by the manager and sent for final approval.`, 'success', claimId);
    await Promise.all(superAdminApprovers.map((email) =>
      createNotification(email, 'Claim Awaiting Final Approval', `${claimData.submitted_by} claim ${claimId} is pending final approval.`, 'info', claimId)
    ));
    const submittedAmt = getSubmittedAmount(claimData);
    const verifiedAmt = verifiedAmountInput == null ? (claimData.verified_amount == null ? getClaimAmount(claimData) : parseFloat(claimData.verified_amount)) : verifiedAmountInput;
    await sendEmailNotification('claim_approved', claimData.user_email, {
      claim_no: claimData.claim_number || claimId,
      total: getClaimAmount(claimData),
      submitted_amount: submittedAmt,
      verified_amount: verifiedAmt,
      approved_by: approverEmail,
      employee_name: claimData.user_name || claimData.submitted_by || 'there',
      currency: '₹',
      status: STATUS_PENDING_SUPER_ADMIN_APPROVAL
    });
    queueEmailNotifications(superAdminApprovers.map((email) =>
      sendEmailNotification('claim_submitted_manager', email, {
        claim_id: claimId,
        claim_number: claimData.claim_number || claimId,
        employee_name: claimData.submitted_by,
        employee_email: claimData.user_email,
        project_site: claimData.site_name,
        primary_project_code: '',
        submission_date: claimData.created_at,
        manager_status: 'Approved',
        admin_status: 'Pending Final Approval',
        total_amount: getClaimAmount(claimData),
        submitted_amount: getSubmittedAmount(claimData),
        verified_amount: verifiedAmt,
        currency: '₹',
        items: [],
        attachments: mapAttachmentEmailData(claimData.drive_file_ids || []),
        approve_link: buildClaimActionLink(appUrl, claimId, 'approve', 'super-admin', email),
        reject_link: buildClaimActionLink(appUrl, claimId, 'reject', 'super-admin', email),
      })
    ));
  }
}

export async function approveClaimAsAdmin(claimId: string, approverEmail: string, description?: string, verifiedAmountInput?: number) {
  if (isDemoEmail(approverEmail)) return;

  const { data: claim } = await supabase.from('claims').select('*').eq('claim_id', claimId).single();
  if (!claim) throw new Error('Claim not found');

  const c = claim as any;
  const submittedAmount = getSubmittedAmount(c);
  const verifiedAmount = normalizeVerifiedAmount(verifiedAmountInput, getClaimAmount(c) || submittedAmount);
  const settings = await getCompanySettings();
  const requireManager = settings?.require_manager_approval ?? true;
  const managerEmail = String(c.manager_email || '').trim().toLowerCase();
  const skipManagerStage = !requireManager || !managerEmail || (await isManagerAlsoSuperAdmin(managerEmail));
  const nextStatus = skipManagerStage ? STATUS_PENDING_SUPER_ADMIN_APPROVAL : STATUS_PENDING_MANAGER_APPROVAL;
  const managerApprovalStatus = skipManagerStage ? 'Skipped' : 'Pending';

  const claimUpdates = {
    status: nextStatus,
    manager_approval_status: managerApprovalStatus,
    admin_email: approverEmail,
    admin_approval_date: new Date().toISOString(),
    verified_amount: verifiedAmount,
  };
  const { error } = await supabase.from('claims').update(claimUpdates).eq('claim_id', claimId);
  if (error) {
    if (!isMissingVerifiedAmountColumnError(error)) throw error;
    const { verified_amount, ...fallbackUpdates } = claimUpdates;
    const { error: fallbackError } = await supabase.from('claims').update(fallbackUpdates).eq('claim_id', claimId);
    if (fallbackError) throw fallbackError;
    console.warn('verified_amount column is not available yet; admin verified amount was not persisted.');
  }

  const amountNote = `Submitted: Rs. ${submittedAmount.toLocaleString('en-IN')} | Verified: Rs. ${verifiedAmount.toLocaleString('en-IN')}`;
  await logAudit('claim_admin_verified', approverEmail, 'claim', claimId, `${amountNote}${description ? ` | ${description}` : ''}${skipManagerStage ? ' | Manager stage skipped' : ' | Forwarded to manager'}`);
  await createNotification(c.user_email, 'Claim Verified by Admin', `Your claim ${claimId} has been verified by admin for Rs. ${verifiedAmount.toLocaleString('en-IN')}.`, 'success', claimId);

  const appUrl = getAppUrl(settings);
  const amount = verifiedAmount;

  if (skipManagerStage) {
    const superAdminApprovers = await getSuperAdminApproverEmails();
    await Promise.all(superAdminApprovers.map((email) =>
      createNotification(email, 'Claim Awaiting Final Approval', `${c.submitted_by} claim ${claimId} is pending final approval.`, 'info', claimId)
    ));
    queueEmailNotifications(superAdminApprovers.map((email) =>
      sendEmailNotification('claim_submitted_manager', email, {
        claim_id: claimId,
        claim_number: c.claim_number || claimId,
        employee_name: c.submitted_by,
        employee_email: c.user_email,
        project_site: c.site_name,
        primary_project_code: '',
        submission_date: c.created_at,
        manager_status: 'Skipped',
        admin_status: 'Pending Final Approval',
        total_amount: amount,
        submitted_amount: submittedAmount,
        verified_amount: verifiedAmount,
        currency: 'Rs.',
        items: [],
        attachments: mapAttachmentEmailData(c.drive_file_ids || []),
        approve_link: buildClaimActionLink(appUrl, claimId, 'approve', 'super-admin', email),
        reject_link: buildClaimActionLink(appUrl, claimId, 'reject', 'super-admin', email),
      })
    ));
  } else {
    await createNotification(managerEmail, 'Claim Awaiting Manager Approval', `${c.submitted_by} claim ${claimId} has been verified by admin and is pending your approval.`, 'info', claimId);
    await sendEmailNotification('claim_submitted_manager', managerEmail, {
      claim_id: claimId,
      claim_number: c.claim_number || claimId,
      employee_name: c.submitted_by,
      employee_email: c.user_email,
      project_site: c.site_name,
      primary_project_code: '',
      submission_date: c.created_at,
      manager_status: 'Pending',
      admin_status: 'Verified',
      total_amount: amount,
      submitted_amount: submittedAmount,
      verified_amount: verifiedAmount,
      currency: 'Rs.',
      items: [],
      attachments: mapAttachmentEmailData(c.drive_file_ids || []),
      approve_link: buildClaimActionLink(appUrl, claimId, 'approve', 'manager', managerEmail),
      reject_link: buildClaimActionLink(appUrl, claimId, 'reject', 'manager', managerEmail),
    });
  }
}

export async function approveClaimAsSuperAdmin(claimId: string, approverEmail: string, description?: string, verifiedAmountInput?: number) {
  if (isDemoEmail(approverEmail)) return;

  const { data: claim } = await supabase.from('claims').select('*').eq('claim_id', claimId).single();
  if (!claim) throw new Error('Claim not found');

  const c = claim as any;
  const submittedAmount = getSubmittedAmount(c);
  const persistedVerified = c.verified_amount == null ? null : parseFloat(c.verified_amount);
  const amount = normalizeVerifiedAmount(verifiedAmountInput ?? persistedVerified ?? getClaimAmount(c), getClaimAmount(c));

  const updates: any = {
    status: STATUS_CLOSED,
    admin_email: approverEmail,
    admin_approval_date: new Date().toISOString(),
    verified_amount: amount,
  };
  const { error } = await supabase.from('claims').update(updates).eq('claim_id', claimId);
  if (error) throw error;

  // Create settlement/credit transaction for the final approval using a clear reversal+adjustment so ledger shows waived amount as a separate line.
  const approvedAmount = amount; // getClaimAmount(c)
  const currentBalance = await getCurrentBalance(c.user_email);

  // Simpler: credit the approved amount (settlement). To also show a waived line in ledger
  // we create a separate waive-off debit when approved < submitted by reversing the difference.
  // Current balance is the balance after submission (so adding amount yields final desired balance)
  const afterCredit = currentBalance + amount;
  await supabase.from('transactions').insert({
    user_email: c.user_email,
    admin_email: approverEmail,
    type: 'claim_approved',
    reference_id: claimId,
    credit: amount,
    debit: 0,
    balance_after: afterCredit,
    description: `Claim ${c.claim_number || claimId} approved - settlement for Rs. ${amount.toLocaleString('en-IN')}`,
  });

  // If approved is less than submitted, add a waived (deduction) transaction for clarity.
  if (submittedAmount > amount) {
    const diff = submittedAmount - amount;
    const afterDeduction = afterCredit - diff;
    // Record actual deduction so ledger shows claim deduction and user balance reflects it
    await supabase.from('transactions').insert({
      user_email: c.user_email,
      admin_email: approverEmail,
      type: 'claim_waived',
      reference_id: claimId,
      credit: 0,
      debit: diff,
      balance_after: afterDeduction,
        description: `Claim ${c.claim_number || claimId} deduction - waived amount of Rs. ${diff.toLocaleString('en-IN')}`,
    });
    await logAudit('claim_waived_recorded', approverEmail, 'claim', claimId, `Waived: ₹${diff.toLocaleString('en-IN')}`);
  }

  await logAudit('claim_admin_approved', approverEmail, 'claim', claimId, description ? `Amount: ₹${approvedAmount} | ${description}` : `Amount: ₹${approvedAmount}`);
  await createNotification(c.user_email, 'Claim Fully Approved', `Your claim ${claimId} has been approved by admin. ₹${approvedAmount.toLocaleString('en-IN')} settled.`, 'success', claimId);
  await sendEmailNotification('claim_approved', c.user_email, { 
    claim_no: c.claim_number || claimId, 
    total: approvedAmount,
    submitted_amount: submittedAmount,
    verified_amount: approvedAmount,
    approved_by: approverEmail,
    employee_name: c.user_name || c.submitted_by || 'there',
    currency: '₹',
    status: STATUS_CLOSED
  });
}

export async function rejectClaim(claimId: string, reason: string, rejectorEmail: string, rejectorRole: string) {
  if (isDemoEmail(rejectorEmail)) return;

  const updates: any = { status: 'Rejected', rejection_reason: reason };
  if (rejectorRole.toLowerCase() === 'manager') {
    updates.manager_approval_status = 'Rejected';
  } else {
    updates.admin_email = rejectorEmail;
    updates.admin_approval_date = new Date().toISOString();
  }

  const { error } = await supabase.from('claims').update(updates).eq('claim_id', claimId);
  if (error) throw error;

  // Refund transaction
  const { data: claim } = await supabase.from('claims').select('*').eq('claim_id', claimId).single();
  if (claim) {
    const displayClaimNo = (claim as any).claim_number || claimId;
    const amount = getClaimAmount(claim);
    const currentBalance = await getCurrentBalance((claim as any).user_email);
    await supabase.from('transactions').insert({
      user_email: (claim as any).user_email,
      admin_email: rejectorEmail,
      type: 'claim_rejected_refund',
      reference_id: claimId,
      credit: amount,
      debit: 0,
      balance_after: currentBalance + amount,
      description: `Claim ${displayClaimNo} rejected - refund`,
    });

    await logAudit('claim_rejected', rejectorEmail, 'claim', claimId, `Reason: ${reason}`);
    await createNotification((claim as any).user_email, 'Claim Rejected', `Your claim ${displayClaimNo} was rejected. Reason: ${reason}`, 'error', claimId);
    await sendEmailNotification('claim_rejected', (claim as any).user_email, {
      claim_no: displayClaimNo,
      total: amount,
      rejected_by: rejectorEmail,
      reason,
      employee_name: (claim as any).submitted_by || 'there',
      currency: '₹',
    });
  }
}

// ============= CLAIM HISTORY =============
export async function getClaimsHistory(userEmail: string, userRole: string, filters?: { userEmail?: string; startDate?: string; endDate?: string }) {
  if (isDemoEmail(userEmail)) {
    let claims = visibleDemoClaims(userEmail, userRole);
    if (filters?.userEmail) claims = claims.filter((claim) => claim.userEmail === filters.userEmail);
    if (filters?.startDate) claims = claims.filter((claim) => claim.date >= new Date(filters.startDate!).toISOString());
    if (filters?.endDate) claims = claims.filter((claim) => claim.date < new Date(new Date(filters.endDate!).getTime() + 86400000).toISOString());
    return claims;
  }

  const role = userRole.toLowerCase();
  let query = supabase.from('claims').select('*, expense_items(*)');

  if (role === 'admin' || role === 'super admin') {
    if (filters?.userEmail) query = query.eq('user_email', filters.userEmail);
  } else if (role === 'manager') {
    // Get managed users
    const { data: managed } = await supabase.from('users').select('email').eq('manager_email', userEmail);
    const emails = [userEmail, ...(managed || []).map((u: any) => u.email)];
    query = query.in('user_email', emails);
  } else {
    query = query.eq('user_email', userEmail);
  }

  if (filters?.startDate) query = query.gte('created_at', new Date(filters.startDate).toISOString());
  if (filters?.endDate) {
    const end = new Date(filters.endDate);
    end.setDate(end.getDate() + 1);
    query = query.lt('created_at', end.toISOString());
  }

  query = query.order('created_at', { ascending: false });
  const result = await query;
  return (result.data || []).map((c: any) => ({
    claimId: c.claim_number || c.claim_id,
    claimIdInternal: c.claim_id,
    date: c.created_at,
    submittedBy: c.submitted_by,
    userEmail: c.user_email,
    site: c.site_name,
    amount: getClaimAmount(c),
    submittedAmount: getSubmittedAmount(c),
    verifiedAmount: c.verified_amount == null ? null : parseFloat(c.verified_amount),
    totalWithBill: parseFloat(c.total_with_bill || 0),
    totalWithoutBill: parseFloat(c.total_without_bill || 0),
    status: c.status,
    rejectionReason: c.rejection_reason,
    fileIds: c.drive_file_ids || [],
    expenses: (c.expense_items || []).map((e: any) => ({
      category: e.category,
      projectCode: e.project_code,
      claimDate: e.expense_date,
      description: e.description,
      amountWithBill: parseFloat(e.amount_with_bill || 0),
      amountWithoutBill: parseFloat(e.amount_without_bill || 0),
      amount: parseFloat(e.amount_with_bill || 0) + parseFloat(e.amount_without_bill || 0),
    })),
  }));
}

export async function getClaimById(claimId: string) {
  if (isDemoMode()) {
    return demoClaims.find((claim) => claim.claimId === claimId || claim.claimIdInternal === claimId) ?? null;
  }

  const c = await fetchClaimRowByAnyId(claimId) as any;
  if (!c) return null;
  // load expense items
  const { data: items } = await supabase.from('expense_items').select('*').eq('claim_id', c.claim_id);
  return {
    claimId: c.claim_number || c.claim_id,
    claimIdInternal: c.claim_id,
    date: c.created_at,
    submittedBy: c.submitted_by,
    userEmail: c.user_email,
    site: c.site_name,
    amount: getClaimAmount(c),
    submittedAmount: getSubmittedAmount(c),
    verifiedAmount: c.verified_amount == null ? null : parseFloat(c.verified_amount),
    totalWithBill: parseFloat(c.total_with_bill || 0),
    totalWithoutBill: parseFloat(c.total_without_bill || 0),
    status: c.status,
    managerEmail: c.manager_email,
    managerApprovalStatus: c.manager_approval_status,
    managerApprovalDate: c.manager_approval_date,
    adminEmail: c.admin_email,
    adminApprovalDate: c.admin_approval_date,
    rejectionReason: c.rejection_reason,
    expenses: (items || []).map((e: any) => ({
      category: e.category,
      projectCode: e.project_code,
      claimDate: e.expense_date,
      description: e.description,
      amountWithBill: parseFloat(e.amount_with_bill || 0),
      amountWithoutBill: parseFloat(e.amount_without_bill || 0),
      amount: parseFloat(e.amount_with_bill || 0) + parseFloat(e.amount_without_bill || 0),
    })),
    fileIds: c.drive_file_ids || [],
  };
}

// Helper function - remove after debugging

// ============= TRANSACTIONS =============
export async function getTransactions(userEmail: string, userRole: string, filters?: { userEmail?: string; startDate?: string; endDate?: string; type?: string }) {
  if (isDemoEmail(userEmail)) {
    return [
      { email: 'user@siteconnect.demo', type: 'initial_advance', credit: 50000, debit: 0, description: 'Initial demo advance', claimId: '', admin: 'admin@siteconnect.demo', balanceAfter: 50000, createdAt: new Date(Date.now() - 10 * 86400000).toISOString() },
      { email: 'user@siteconnect.demo', type: 'claim_submitted', credit: 0, debit: 4200, description: 'Claim submission: CLM-0001', claimId: 'CLM-0001', admin: 'user@siteconnect.demo', balanceAfter: 45800, createdAt: demoClaims[0].date },
      { email: 'user@siteconnect.demo', type: 'claim_approved', credit: 65000, debit: 0, description: 'Claim CLM-0003 approved - settlement', claimId: 'CLM-0003', admin: 'admin@siteconnect.demo', balanceAfter: 110800, createdAt: demoClaims[2].date },
    ].filter((tx) => {
      if (userRole === 'User') return tx.email === userEmail;
      if (filters?.userEmail) return tx.email === filters.userEmail;
      return true;
    });
  }

  const role = userRole.toLowerCase();
  let query = supabase.from('transactions').select('*');

  if (role === 'admin' || role === 'super admin') {
    if (filters?.userEmail) query = query.eq('user_email', filters.userEmail);
  } else if (role === 'manager') {
    const { data: managed } = await supabase.from('users').select('email').eq('manager_email', userEmail);
    const emails = [userEmail, ...(managed || []).map((u: any) => u.email)];
    if (filters?.userEmail && emails.includes(filters.userEmail)) {
      query = query.eq('user_email', filters.userEmail);
    } else if (!filters?.userEmail) {
      query = query.in('user_email', emails);
    } else {
      return [];
    }
  } else {
    query = query.eq('user_email', userEmail);
  }

  if (filters?.startDate) query = query.gte('created_at', new Date(filters.startDate).toISOString());
  if (filters?.endDate) {
    const end = new Date(filters.endDate);
    end.setDate(end.getDate() + 1);
    query = query.lt('created_at', end.toISOString());
  }
  if (filters?.type) query = query.eq('type', filters.type);

  query = query.order('created_at', { ascending: false });
  const result = await query;
  const rows = result.data || [];
  // Resolve user names for display
  const emails = [...new Set((rows as any[]).map(r => String(r.user_email || '').toLowerCase()).filter(Boolean))];
  let usersMap: Record<string, string> = {};
  if (emails.length > 0) {
    const { data: users } = await supabase.from('users').select('email, name').in('email', emails);
    (users || []).forEach((u: any) => { usersMap[String(u.email || '').toLowerCase()] = u.name || u.email; });
  }

  // Resolve claim_number for reference ids so ledger shows CLM-0001 style
  const refs = [...new Set((rows as any[]).map(r => String(r.reference_id || '').trim()).filter(Boolean))];
  let claimMap: Record<string, string> = {};
  if (refs.length > 0) {
    const { data: claims } = await supabase.from('claims').select('claim_id, claim_number').in('claim_id', refs);
    (claims || []).forEach((c: any) => { claimMap[String(c.claim_id || '')] = String(c.claim_number || c.claim_id || ''); });
  }

  return (rows as any[]).map((t: any) => ({
    email: t.user_email,
    name: usersMap[String(t.user_email || '').toLowerCase()] || t.user_email,
    type: t.type,
    credit: parseFloat(t.credit || 0),
    debit: parseFloat(t.debit || 0),
    description: t.description,
    claimId: (t.reference_id && claimMap[String(t.reference_id)]) ? claimMap[String(t.reference_id)] : (t.reference_id || ''),
    admin: t.admin_email || '',
    balanceAfter: parseFloat(t.balance_after || 0),
    createdAt: t.created_at,
  }));
}

// ============= USER MANAGEMENT =============
export async function getAllUsers() {
  if (isDemoMode()) {
    return demoUsersDirectory.map((user) => ({
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
      advance: user.advance_amount,
      balance: user.email === 'user@siteconnect.demo' ? 110800 : 0,
      manager: user.manager_email || '',
      active: user.active,
    }));
  }

  const { data, error } = await supabase.from('users').select('*').order('name');
  if (error) throw error;
  
  const users = [];
  for (const u of (data || []) as any[]) {
    const balance = await getCurrentBalance(u.email);
    users.push({
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      advance: parseFloat(u.advance_amount) || 0,
      balance,
      manager: u.manager_email || '',
      active: u.active,
      employee_id: u.employee_id || '',
      mobile_number: u.mobile_number || '',
      date_of_joining: u.date_of_joining || '',
    });
  }
  return users;
}

export async function createUser(newUser: {
  email: string;
  password: string;
  name: string;
  role: string;
  advance: number;
  manager: string;
  employee_id?: string;
  mobile_number?: string;
  date_of_joining?: string;
}) {
  if (isDemoMode()) return { ok: true, message: `Demo user ${newUser.name} previewed. Supabase was not changed.` };

  const email = newUser.email.trim().toLowerCase();

  // Check if user exists using maybeSingle to avoid 406 errors
  const { data: existing } = await supabase.from('users').select('email').eq('email', email).maybeSingle();
  if (existing) throw new Error('Email already exists.');

  const managerEmail = newUser.manager?.trim().toLowerCase() || null;
  if (managerEmail) {
    const { data: mgr } = await supabase.from('users').select('email').eq('email', managerEmail).maybeSingle();
    if (!mgr) throw new Error('Manager email not found.');
  }

  const { error } = await supabase.from('users').insert({
    email,
    password_hash: hashPassword(newUser.password),
    name: newUser.name.trim(),
    role: newUser.role || 'User',
    advance_amount: newUser.advance || 0,
    manager_email: managerEmail,
    active: true,
    employee_id: newUser.employee_id?.trim() || null,
    mobile_number: newUser.mobile_number?.trim() || null,
    date_of_joining: newUser.date_of_joining?.trim() || null,
  });
  if (error) throw error;

  // Create initial advance transaction if > 0
  if (newUser.advance > 0) {
    await supabase.from('transactions').insert({
      user_email: email,
      admin_email: email,
      type: 'initial_advance',
      credit: newUser.advance,
      debit: 0,
      balance_after: newUser.advance,
      description: 'Initial advance balance',
    });
  }

  const settings = await getCompanySettings();
  await logAudit('user_created', email, 'user', email, `Role: ${newUser.role}, Advance: ₹${newUser.advance}`);
  await sendEmailNotification('user_created', email, {
    employeeName: newUser.name,
    name: newUser.name,
    role: newUser.role,
    advance: newUser.advance,
    email,
    tempPassword: newUser.password,
    loginUrl: getAppUrl(settings),
    userGuideUrl: '',
  });
  return { ok: true, message: `User ${newUser.name} created successfully.` };
}

export async function updateUser(payload: { originalEmail: string; name?: string; email?: string; role?: string; password?: string; manager?: string }) {
  if (isDemoMode()) return;

  const oldEmail = payload.originalEmail.trim().toLowerCase();
  const updates: any = {};
  if (payload.name) updates.name = payload.name;
  if (payload.role) updates.role = payload.role;
  if (payload.password) updates.password_hash = hashPassword(payload.password);
  if (payload.manager !== undefined) updates.manager_email = payload.manager || null;
  if (payload.email && payload.email.toLowerCase() !== oldEmail) updates.email = payload.email.toLowerCase();

  const { error } = await supabase.from('users').update(updates).eq('email', oldEmail);
  if (error) throw error;
  await logAudit('user_updated', oldEmail, 'user', oldEmail, JSON.stringify(updates));
}

export async function deleteUser(email: string) {
  if (isDemoMode()) return;

  const { error } = await supabase.from('users').delete().eq('email', email.toLowerCase());
  if (error) throw error;
  await logAudit('user_deleted', email, 'user', email);
}

export async function addUserAdvance(userEmail: string, amount: number, adminEmail: string) {
  if (isDemoMode()) return;

  const currentBalance = await getCurrentBalance(userEmail);
  const { error } = await supabase.from('transactions').insert({
    user_email: userEmail,
    admin_email: adminEmail,
    type: 'manual_advance',
    credit: amount,
    debit: 0,
    balance_after: currentBalance + amount,
    description: 'Manual advance/credit added by admin',
  });
  if (error) throw error;
  await logAudit('advance_added', adminEmail, 'user', userEmail, `Amount: ₹${amount}`);
  await createNotification(userEmail, 'Advance Added', `₹${amount.toLocaleString('en-IN')} advance has been added to your balance by admin.`, 'success');
}

// ============= USER BALANCE SUMMARY =============
export async function getUserBalanceSummary(userEmail: string, userRole: string) {
  if (isDemoEmail(userEmail)) {
    return demoUsersDirectory
      .filter((user) => {
        const role = userRole.toLowerCase();
        if (role === 'admin' || role === 'super admin') return true;
        if (role === 'manager') return user.email === userEmail || user.manager_email === userEmail;
        return user.email === userEmail;
      })
      .map((user) => {
        const claims = demoClaims.filter((claim) => claim.userEmail === user.email);
        return {
          name: user.name,
          email: user.email,
          role: user.role,
          initialAdvance: user.advance_amount,
          totalClaimAmount: claims.reduce((sum, claim) => sum + claim.amount, 0),
          pendingClaims: claims.filter((claim) => claim.status.includes('Pending')).reduce((sum, claim) => sum + claim.amount, 0),
          approvedClaims: claims.filter((claim) => isSettledStatus(claim.status)).reduce((sum, claim) => sum + claim.amount, 0),
          rejectedClaims: claims.filter((claim) => normalizeStatus(claim.status).includes('reject')).reduce((sum, claim) => sum + claim.amount, 0),
          currentBalance: user.email === 'user@siteconnect.demo' ? 110800 : 0,
        };
      });
  }

  const role = userRole.toLowerCase();
  const { data: users } = await supabase.from('users').select('*');
  const { data: claims } = await supabase.from('claims').select('*');

  if (!users) return [];

  const filteredUsers = (users as any[]).filter(u => {
    const uEmail = u.email.toLowerCase();
    if (role === 'admin' || role === 'super admin') return true;
    if (role === 'manager') return uEmail === userEmail.toLowerCase() || u.manager_email?.toLowerCase() === userEmail.toLowerCase();
    return uEmail === userEmail.toLowerCase();
  });

  const summary = [];
  for (const u of filteredUsers) {
    const uEmail = u.email.toLowerCase();
    let total = 0, pending = 0, approved = 0, rejected = 0;
    (claims || []).forEach((c: any) => {
      if (c.user_email?.toLowerCase() === uEmail) {
        const submitted = getSubmittedAmount(c);
        const verified = c.verified_amount == null ? getClaimAmount(c) : parseFloat(c.verified_amount);
        const status = String(c.status || '').toLowerCase();
        total += submitted; // total claimed stays as submitted
        if (status.includes('pending')) pending += submitted;
        else if (isSettledStatus(status)) {
          approved += verified;
        } else if (status.includes('reject')) {
          rejected += submitted;
        }
      }
    });

    // Additionally, compute rejected/deductions from transactions (claim_waived debits)
    try {
      const { data: waivedTxs } = await supabase.from('transactions').select('debit').eq('user_email', uEmail).eq('type', 'claim_waived');
      if (waivedTxs) {
        for (const wt of waivedTxs as any[]) {
          rejected += parseFloat(wt.debit || 0);
        }
      }
    } catch (e) {
      // ignore
    }

    const balance = await getCurrentBalance(uEmail);
    summary.push({
      name: u.name,
      email: u.email,
      role: u.role,
      initialAdvance: parseFloat(u.advance_amount || 0),
      totalClaimAmount: total,
      pendingClaims: pending,
      approvedClaims: approved,
      rejectedClaims: rejected,
      currentBalance: balance,
    });
  }
  return summary;
}

// ============= APP LISTS MANAGEMENT =============
export async function getAppLists() {
  if (isDemoMode()) {
    return [
      { id: 'demo-project-1', type: 'project', value: 'Metro Station Foundation', project_code: 'PROJ-METRO', active: true },
      { id: 'demo-project-2', type: 'project', value: 'Warehouse Retrofit', project_code: 'PROJ-WARE', active: true },
      ...demoDropdownOptions().categories.map((category, index) => ({ id: `demo-category-${index}`, type: 'category', value: category, active: true })),
      ...demoProjectCodes.map((code, index) => ({ id: `demo-code-${index}`, type: 'projectcode', value: code.label, project_code: code.code, project: code.project, allows_all_categories: code.allowsAllCategories, expense_categories: code.expenseCategories, active: true })),
    ];
  }

  const { data } = await supabase.from('app_lists').select('*').order('type').order('value');
  return (data || []) as any[];
}

export async function addAppListItem(item: {
  type: string;
  value: string;
  project_code?: string;
  project?: string;
  allows_all_categories?: boolean;
  expense_categories?: string[];
}) {
  if (isDemoMode()) return;

  const { error } = await supabase.from('app_lists').insert({ ...item, active: true });
  if (error) throw error;
}

export async function deleteAppListItem(id: string) {
  if (isDemoMode()) return;

  const { error } = await supabase.from('app_lists').delete().eq('id', id);
  if (error) throw error;
}

// ============= GET MANAGER'S ASSIGNED USERS WITH BALANCES =============
export async function getManagerAssignedUsersWithBalances(managerEmail: string) {
  if (isDemoEmail(managerEmail)) {
    return demoUsersDirectory
      .filter((user) => user.manager_email === managerEmail)
      .map((user) => ({
        name: user.name,
        email: user.email,
        balance: 110800,
        lastTransactionDate: demoClaims[0].date,
      }));
  }

  const { data: managedUsers } = await supabase.from('users').select('*').eq('manager_email', managerEmail).order('name');
  
  if (!managedUsers) return [];
  
  const usersWithBalance = [];
  for (const u of (managedUsers || []) as any[]) {
    const balance = await getCurrentBalance(u.email);
    const { data: lastTx } = await supabase.from('transactions')
      .select('created_at')
      .eq('user_email', u.email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    usersWithBalance.push({
      name: u.name,
      email: u.email,
      balance,
      lastTransactionDate: (lastTx as any)?.created_at || null,
    });
  }
  return usersWithBalance;
}

// ============= USERS DIRECTORY (for dropdowns) =============
export async function getUsersDirectory() {
  if (isDemoMode()) {
    return demoUsersDirectory.map(({ name, email, manager_email, role }) => ({ name, email, manager_email, role }));
  }

  const { data } = await supabase.from('users').select('name, email, manager_email, role').order('name');
  return (data || []) as any[];
}

// ============= NOTIFICATIONS =============
export async function getNotifications(userEmail: string) {
  if (isDemoEmail(userEmail)) {
    return [
      { id: 'demo-notification-1', user_email: userEmail, title: 'Demo notification', message: 'This role is running in one-click demo mode.', type: 'info', reference_id: null, is_read: false, created_at: new Date().toISOString() },
    ];
  }

  const { data } = await supabase.from('notifications' as any).select('*')
    .eq('user_email', userEmail)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data || []) as any[];
}

export async function markNotificationRead(id: string) {
  if (isDemoMode()) return;

  await supabase.from('notifications' as any).update({ is_read: true } as any).eq('id', id);
}

export async function markAllNotificationsRead(userEmail: string) {
  if (isDemoEmail(userEmail)) return;

  await supabase.from('notifications' as any).update({ is_read: true } as any).eq('user_email', userEmail).eq('is_read', false);
}

export async function createNotification(userEmail: string, title: string, message: string, type: string = 'info', referenceId?: string) {
  if (isDemoEmail(userEmail)) return;

  await supabase.from('notifications' as any).insert({
    user_email: userEmail,
    title,
    message,
    type,
    reference_id: referenceId || null,
  } as any);
}

// ============= AUDIT LOGS =============
export async function logAudit(action: string, performedBy: string, targetType: string, targetId?: string, details?: string) {
  if (isDemoEmail(performedBy)) return;

  await supabase.from('audit_logs' as any).insert({
    action,
    performed_by: performedBy,
    target_type: targetType,
    target_id: targetId || null,
    details: details || null,
  } as any);
}

export async function getAuditLogs() {
  if (isDemoMode()) {
    return [
      { id: 'demo-audit-1', action: 'claim_submitted', performed_by: 'Site User', target_type: 'claim', target_id: 'CLM-0001', details: 'Demo claim submitted', created_at: demoClaims[0].date },
      { id: 'demo-audit-2', action: 'claim_manager_approved', performed_by: 'Team Manager', target_type: 'claim', target_id: 'CLM-0002', details: 'Forwarded to admin', created_at: demoClaims[1].date },
      { id: 'demo-audit-3', action: 'claim_admin_approved', performed_by: 'Office Admin', target_type: 'claim', target_id: 'CLM-0003', details: 'Settlement approved', created_at: demoClaims[2].date },
    ];
  }

  const { data } = await supabase.from('audit_logs' as any).select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = (data || []) as any[];

  // Resolve performer names (performed_by stored as email) and claim numbers for claim targets
  const performerEmails = [...new Set(rows.map(r => String(r.performed_by || '').toLowerCase()).filter(Boolean))];
  let usersMap: Record<string, string> = {};
  if (performerEmails.length > 0) {
    const { data: users } = await supabase.from('users').select('email, name').in('email', performerEmails);
    (users || []).forEach((u: any) => { usersMap[String(u.email || '').toLowerCase()] = u.name || u.email; });
  }

  const claimIds = [...new Set(rows.filter(r => String(r.target_type || '').toLowerCase() === 'claim').map(r => String(r.target_id || '').trim()).filter(Boolean))];
  let claimMap: Record<string, string> = {};
  if (claimIds.length > 0) {
    const { data: claims } = await supabase.from('claims').select('claim_id, claim_number').in('claim_id', claimIds);
    (claims || []).forEach((c: any) => { claimMap[String(c.claim_id || '')] = String(c.claim_number || c.claim_id || ''); });
  }

  return rows.map((r: any) => ({
    ...r,
    performed_by: (String(r.performed_by || '').toLowerCase() && usersMap[String(r.performed_by || '').toLowerCase()]) ? usersMap[String(r.performed_by || '').toLowerCase()] : r.performed_by,
    target_id: (String(r.target_type || '').toLowerCase() === 'claim' && r.target_id && claimMap[String(r.target_id || '')]) ? claimMap[String(r.target_id || '')] : r.target_id,
  }));
}

// ============= DASHBOARD CHART DATA =============
export async function getDashboardChartData(userEmail: string, userRole: string) {
  if (isDemoEmail(userEmail)) {
    const claims = visibleDemoClaims(userEmail, userRole);
    const catMap = claims.reduce<Record<string, number>>((acc, claim) => {
      claim.expenses.forEach((expense) => {
        const category = expense.category || 'Other';
        acc[category] = (acc[category] || 0) + expense.amount;
      });
      return acc;
    }, {});

    return {
      monthly: [
        { month: 'Jan 26', withBill: 18000, withoutBill: 2500, total: 20500, count: 3 },
        { month: 'Feb 26', withBill: 24000, withoutBill: 3200, total: 27200, count: 4 },
        { month: 'Mar 26', withBill: 65000, withoutBill: 4200, total: 69200, count: claims.length },
      ],
      byCategory: Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      byStatus: Object.entries(claims.reduce<Record<string, number>>((acc, claim) => {
        acc[claim.status] = (acc[claim.status] || 0) + 1;
        return acc;
      }, {})).map(([name, value]) => ({ name, value })),
    };
  }

  const role = userRole.toLowerCase();
  let claimsQuery = supabase.from('claims').select('*');
  
  if (role === 'user') {
    claimsQuery = claimsQuery.eq('user_email', userEmail);
  } else if (role === 'manager') {
    // Manager sees own + managed users
    const { data: managed } = await supabase.from('users').select('email').eq('manager_email', userEmail);
    const emails = [userEmail, ...(managed || []).map((u: any) => u.email)];
    claimsQuery = claimsQuery.in('user_email', emails);
  }

  const { data: claims } = await claimsQuery;
  if (!claims) return { monthly: [], byCategory: [], byStatus: [] };
  if (claims.length === 0) return { monthly: [], byCategory: [], byStatus: [] };

  // Monthly trend: show only months that actually have claims, capped to the latest 6.
  // This keeps new deployments from showing a mostly empty chart.
  const monthMap: Record<string, { month: string; withBill: number; withoutBill: number; total: number; count: number }> = {};
  const monthOrder: string[] = [];

  // By status
  const statusCount: Record<string, number> = {};
  
  for (const c of claims as any[]) {
    const d = new Date(c.created_at);
    const key = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
    const wb = parseFloat(c.total_with_bill || 0);
    const wob = parseFloat(c.total_without_bill || 0);
    if (!monthMap[key]) {
      monthMap[key] = { month: key, withBill: 0, withoutBill: 0, total: 0, count: 0 };
      monthOrder.push(key);
    }
    monthMap[key].withBill += wb;
    monthMap[key].withoutBill += wob;
    monthMap[key].total += wb + wob;
    monthMap[key].count++;
    const status = c.status || 'Unknown';
    statusCount[status] = (statusCount[status] || 0) + 1;
  }

  // By category from the same claim scope used by the dashboard.
  const claimIds = (claims as any[]).map((claim) => claim.claim_id).filter(Boolean);
  const { data: expenses } = await supabase
    .from('expense_items')
    .select('category, amount_with_bill, amount_without_bill')
    .in('claim_id', claimIds);
  const catMap: Record<string, number> = {};
  for (const e of (expenses || []) as any[]) {
    const cat = e.category || 'Other';
    catMap[cat] = (catMap[cat] || 0) + parseFloat(e.amount_with_bill || 0) + parseFloat(e.amount_without_bill || 0);
  }

  return {
    monthly: monthOrder.slice(-6).map((key) => monthMap[key]),
    byCategory: Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    byStatus: Object.entries(statusCount).map(([name, value]) => ({ name, value })),
  };
}
