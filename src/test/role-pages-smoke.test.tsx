import { cleanup, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import DashboardView from '@/components/views/DashboardView';
import SubmitClaimView from '@/components/views/SubmitClaimView';
import ClaimHistoryView from '@/components/views/ClaimHistoryView';
import TransactionsView from '@/components/views/TransactionsView';
import UserBalanceView from '@/components/views/UserBalanceView';
import ApprovalView from '@/components/views/ApprovalView';
import AccountsProcessingView from '@/components/views/AccountsProcessingView';
import AccountsSapEntryView from '@/components/views/AccountsSapEntryView';
import AccountingSetupView from '@/components/views/AccountingSetupView';
import WorkAllocationView from '@/components/views/WorkAllocationView';
import PaymentVoucherView from '@/components/views/PaymentVoucherView';
import UserManagementView from '@/components/views/UserManagementView';
import SettingsView from '@/components/views/SettingsView';
import AuditLogView from '@/components/views/AuditLogView';
import UserProfileView from '@/components/views/UserProfileView';
import AppSidebar from '@/components/AppSidebar';

const authState = vi.hoisted(() => ({
  user: { email: 'tester@example.com', name: 'Test User', role: 'Super Admin' as string },
}));

const emptyMasters = { locations: [], groups: [], lists: [], users: [] };
const emptyDropdowns = { projects: [], categories: [], projectCodes: [], byProject: {} };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    token: 'test-token',
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    isAdmin: true,
    isManagerOrAbove: true,
  }),
}));

vi.mock('@/lib/claims-api', () => ({
  getAccountsClaims: vi.fn(async () => []),
  getPendingManagerClaims: vi.fn(async () => []),
  getPendingAdminClaims: vi.fn(async () => []),
  getPendingSuperAdminClaims: vi.fn(async () => []),
  getClaimById: vi.fn(async () => null),
  getClaimsHistory: vi.fn(async () => []),
  getTransactions: vi.fn(async () => []),
  getUsersDirectory: vi.fn(async () => []),
  getAllUsers: vi.fn(async () => []),
  getAuditLogs: vi.fn(async () => []),
  getUserBalanceSummary: vi.fn(async () => []),
  getManagerAssignedUsersWithBalances: vi.fn(async () => []),
  getDashboardSummary: vi.fn(async () => ({ role: authState.user.role })),
  getDashboardChartData: vi.fn(async () => ({ monthly: [], byCategory: [], byStatus: [] })),
  getCompanySettings: vi.fn(async () => ({})),
  getDropdownOptions: vi.fn(async () => emptyDropdowns),
  getCurrentBalance: vi.fn(async () => 0),
  getAppLists: vi.fn(async () => []),
  getSapPendingClaims: vi.fn(async () => []),
  getSapHistoricalClaims: vi.fn(async () => []),
  getSapExportBatches: vi.fn(async () => []),
  getSapExportBatchClaims: vi.fn(async () => []),
  getClaimApprovalTrail: vi.fn(async () => []),
  validateClaimSubmissionRules: vi.fn(() => null),
  approveClaimAsAccounts: vi.fn(),
  markClaimPaid: vi.fn(),
  approveClaimAsManager: vi.fn(),
  approveClaimAsAdmin: vi.fn(),
  approveClaimAsSuperAdmin: vi.fn(),
  rejectClaim: vi.fn(),
  submitClaim: vi.fn(),
  resubmitRejectedClaim: vi.fn(),
  ensurePaymentVoucherCode: vi.fn(),
  downloadSapPreviewExcel: vi.fn(),
  logSapReportDownloaded: vi.fn(),
  updateCompanySettings: vi.fn(),
  addAppListItem: vi.fn(),
  updateAppListItem: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  addUserAdvance: vi.fn(),
}));

vi.mock('@/lib/accounting-api', () => ({
  getAccountingMasters: vi.fn(async () => emptyMasters),
  getProjectWorks: vi.fn(async () => []),
  getJournalExportClaims: vi.fn(async () => []),
  saveAccountingMaster: vi.fn(),
  resolveClaimWork: vi.fn(),
  generateJournalExport: vi.fn(),
  downloadJournalFile: vi.fn(),
}));

vi.mock('@/components/ImageUpload', () => ({ default: () => <div data-testid="image-upload" /> }));
vi.mock('@/components/views/FileUpload', () => ({ default: () => <div data-testid="file-upload" /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

afterEach(() => {
  authState.user.role = 'Super Admin';
  cleanup();
});

function Page({ component: Component }: { component: ComponentType }) {
  return <MemoryRouter><Component /></MemoryRouter>;
}

describe('role page smoke checks', () => {
  const pages: Array<[string, ComponentType]> = [
    ['dashboard', DashboardView],
    ['submit claim', SubmitClaimView],
    ['claim history', ClaimHistoryView],
    ['ledger', TransactionsView],
    ['balances', UserBalanceView],
    ['accounts processing', AccountsProcessingView],
    ['accounts SAP entry', AccountsSapEntryView],
    ['accounting setup', AccountingSetupView],
    ['work allocation', WorkAllocationView],
    ['payment voucher', PaymentVoucherView],
    ['user management', UserManagementView],
    ['settings', SettingsView],
    ['audit log', AuditLogView],
    ['profile', UserProfileView],
  ];

  it.each(pages)('renders the %s page without crashing', async (_name, Component) => {
    const { container } = render(<Page component={Component} />);
    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });

  it.each([
    ['manager approval', 'manager'],
    ['admin approval', 'admin'],
    ['final approval', 'super-admin'],
  ] as const)('renders the %s page without crashing', async (_name, type) => {
    const { container } = render(<MemoryRouter><ApprovalView type={type} /></MemoryRouter>);
    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });

  it.each([
    ['User', ['Dashboard', 'Submit Claim', 'Claim History', 'Ledger Statement', 'User Balances', 'My Profile']],
    ['Manager', ['Dashboard', 'Submit Claim', 'Claim History', 'Ledger Statement', 'User Balances', 'Manager Approval', 'My Profile']],
    ['Admin', ['Dashboard', 'Submit Claim', 'Claim History', 'Ledger Statement', 'User Balances', 'Admin Verification', 'GL & Location Setup', 'Work Allocation', 'Payment Voucher', 'User Management', 'Audit Trail', 'Settings', 'My Profile']],
    ['Accounts', ['Dashboard', 'Claim History', 'Ledger Statement', 'User Balances', 'Accounts Processing', 'Accounts SAP Entry', 'GL & Location Setup', 'Payment Voucher', 'My Profile']],
    ['Super Admin', ['Dashboard', 'Submit Claim', 'Claim History', 'Ledger Statement', 'User Balances', 'Manager Approval', 'Admin Verification', 'Final Approval', 'Accounts Processing', 'Accounts SAP Entry', 'GL & Location Setup', 'Work Allocation', 'Payment Voucher', 'User Management', 'Audit Trail', 'Settings', 'My Profile']],
  ] as const)('shows the correct modules for the %s role', (role, expectedLabels) => {
    authState.user.role = role;
    const { getByRole } = render(<AppSidebar activeView="dashboard" onNavigate={vi.fn()} />);
    const navigation = getByRole('navigation', { name: 'Application sections' });
    const labels = within(navigation).getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => label !== 'Logout');
    expect(labels).toEqual(expectedLabels);
  });
});
