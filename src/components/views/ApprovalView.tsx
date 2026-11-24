import ExpenseApprovalEditor, { type ExpenseDetailDraft } from './ExpenseApprovalEditor';
import { initialRowAmounts, approvedRows, type ApprovalExpense, type RowAmounts } from '@/lib/expense-approval';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getPendingManagerClaims, getPendingAdminClaims, getPendingSuperAdminClaims, approveClaimAsManager, approveClaimAsAdmin, approveClaimAsSuperAdmin, rejectClaim, getClaimById, getDropdownOptions, type ProjectCodeOption } from '@/lib/claims-api';
import { correctPendingClaimExpenses, correctPendingClaimProject, getProjectWorks, removePendingClaimAttachment, type ProjectWork } from '@/lib/accounting-api';
import { Button } from '@/components/ui/button';
import { ResponsiveOverlay } from '@/components/ui/responsive-overlay';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Eye, RefreshCw, UserCheck, ShieldCheck, Loader2, Paperclip, Search, Clock3, ReceiptText, WalletCards, BadgeCheck, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import AttachmentPreview from '@/components/views/AttachmentPreview';
import ClaimApprovalTimeline from '@/components/views/ClaimApprovalTimeline';
import ClaimDetailsOverview from '@/components/views/ClaimDetailsOverview';
import ClaimAttachmentsSection from '@/components/views/ClaimAttachmentsSection';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function availableProjectCodes(projectCodes: ProjectCodeOption[], site: string, category: string, customerName: string) {
  if (!site || !category) return [];
  const categoryKey = category.trim().toLowerCase();
  const customerKey = customerName.trim().toLowerCase();
  const matches = projectCodes.filter((code) =>
    (!code.project || code.project === site)
    && (code.allowsAllCategories || code.expenseCategories.some((item) => item.trim().toLowerCase() === categoryKey))
    && (!code.customerNames.length || !customerKey || code.customerNames.some((item) => item.trim().toLowerCase() === customerKey)),
  );
  const unique = new Map<string, ProjectCodeOption>();
  matches.forEach((code) => {
    const existing = unique.get(code.code);
    if (!existing || (existing.project === '' && code.project === site)) unique.set(code.code, code);
  });
  return [...unique.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function projectCustomerNames(project: any, projectCodes: ProjectCodeOption[]) {
  if (project?.customerNames?.length) return project.customerNames as string[];
  const site = String(project?.name || '');
  return [...new Set(projectCodes
    .filter((code) => !code.project || code.project === site)
    .flatMap((code) => code.customerNames || []))];
}

function initialCorrectedProjectCodes(expenses: any[], projectCodes: ProjectCodeOption[], site: string, customerName: string) {
  return Object.fromEntries(expenses.map((expense) => {
    const choices = availableProjectCodes(projectCodes, site, expense.category || '', customerName);
    const currentCode = String(expense.projectCode || '');
    const selectedCode = choices.some((choice) => choice.code === currentCode)
      ? currentCode
      : choices.length === 1 ? choices[0].code : '';
    return [expense.id, selectedCode];
  }));
}

function formatDate(date: string) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initialExpenseDetailDrafts(expenses: ApprovalExpense[]): Record<string, ExpenseDetailDraft> {
  return Object.fromEntries(expenses.map((expense) => [expense.id, {
    category: expense.category || '',
    claimDate: expense.claimDate || '',
    description: expense.description || '',
    amountWithBill: Number(expense.amountWithBill || 0).toFixed(2),
    amountWithoutBill: Number(expense.amountWithoutBill || 0).toFixed(2),
  }]));
}

interface ApprovalViewProps {
  type: 'manager' | 'admin' | 'super-admin';
}

function ClaimExpenseDetails({ claim }: { claim: any }) {
  if (!claim?.expenses?.length) return null;

  return (
    <>
      <div className="block space-y-2 sm:hidden">
        {claim.expenses.map((expense: any, i: number) => (
          <div key={i} className="space-y-1 rounded border border-border bg-card p-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Category</span><span className="font-medium text-right">{expense.category}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Code</span><span className="text-right">{expense.projectCode || '-'}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Claim Date</span><span className="text-right">{formatDate(expense.claimDate || claim.date)}</span></div>
            {expense.description && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Description</span><span className="max-w-[60%] break-words text-right">{expense.description}</span></div>}
            {expense.attachmentIds?.length > 0 && (
              <div className="mt-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Bills</span>
                <p className="mt-1 text-xs font-medium text-primary">{expense.attachmentIds.length} file(s) shown in Attachments</p>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-primary">Rs. {(expense.amount ?? 0).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden max-w-full overflow-x-auto sm:block">
        <table className="min-w-[1080px] w-full table-fixed border text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="w-[14%] border p-2 text-left">Category</th>
              <th className="w-[18%] border p-2 text-left">Code</th>
              <th className="w-[12%] border p-2 text-left">Claim Date</th>
              <th className="w-[24%] border p-2 text-left">Description</th>
              <th className="border p-2 text-right">With Bill (Rs.)</th>
              <th className="border p-2 text-right">Without Bill (Rs.)</th>
              <th className="w-[16%] border p-2 text-left">Bills</th>
              <th className="border p-2 text-right">Total (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {claim.expenses.map((expense: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="break-words border p-2">{expense.category}</td>
                <td className="break-words border p-2">{expense.projectCode}</td>
                <td className="border p-2">{formatDate(expense.claimDate || claim.date)}</td>
                <td className="break-words border p-2">{expense.description}</td>
                <td className="border p-2 text-right">Rs. {(expense.amountWithBill ?? 0).toFixed(2)}</td>
                <td className="border p-2 text-right">Rs. {(expense.amountWithoutBill ?? 0).toFixed(2)}</td>
                <td className="border p-2">
                  {expense.attachmentIds?.length > 0 ? (
                    <span className="text-xs font-medium text-primary">{expense.attachmentIds.length} file(s)</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No bill</span>
                  )}
                </td>
                <td className="border p-2 text-right font-medium">Rs. {(expense.amount ?? 0).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-bold">
              <td colSpan={4} className="border p-2 text-right">TOTAL</td>
              <td className="border p-2 text-right">Rs. {(claim.totalWithBill ?? 0).toFixed(2)}</td>
              <td className="border p-2 text-right">Rs. {(claim.totalWithoutBill ?? 0).toFixed(2)}</td>
              <td className="border p-2"></td>
              <td className="border p-2 text-right">Rs. {(claim.amount ?? 0).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ApprovalView({ type }: ApprovalViewProps) {
  const { user } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ claimId: string; internalId?: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveModal, setApproveModal] = useState<{ claimId: string; internalId?: string } | null>(null);
  const [approveDescription, setApproveDescription] = useState('');
  const [rowAmounts, setRowAmounts] = useState<RowAmounts>({});
  const [projectWorks, setProjectWorks] = useState<ProjectWork[]>([]);
  const [projectWorksReady, setProjectWorksReady] = useState(false);
  const [projectOptions, setProjectOptions] = useState<any[]>([]);
  const [projectCodeOptions, setProjectCodeOptions] = useState<ProjectCodeOption[]>([]);
  const [projectOptionsReady, setProjectOptionsReady] = useState(false);
  const [correctedSite, setCorrectedSite] = useState('');
  const [correctedCustomerName, setCorrectedCustomerName] = useState('');
  const [correctedProjectCodes, setCorrectedProjectCodes] = useState<Record<string, string>>({});
  const [projectMappingTouched, setProjectMappingTouched] = useState(false);
  const [correctedWorkId, setCorrectedWorkId] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [expenseDetailDrafts, setExpenseDetailDrafts] = useState<Record<string, ExpenseDetailDraft>>({});

  const [processing, setProcessing] = useState(false);
  const [viewClaim, setViewClaim] = useState<any>(null);
  const [approveDetails, setApproveDetails] = useState<any>(null);
  const [savingExpenseDetails, setSavingExpenseDetails] = useState(false);
  let verifiedAmount = '';
  try { verifiedAmount = approvedRows(approveDetails?.expenses || [], rowAmounts).total.toFixed(2); } catch { /* The expense editor displays validation errors; leave approval disabled. */ }
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('oldest');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filteredClaims = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = claims.filter((claim) => !query || [
      claim.claimId,
      claim.submittedBy,
      claim.userEmail,
      claim.site,
      claim.status,
    ].some((value) => String(value || '').toLowerCase().includes(query)));

    return [...matching].sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === 'amount-high') return (b.amount || 0) - (a.amount || 0);
      if (sortBy === 'amount-low') return (a.amount || 0) - (b.amount || 0);
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [claims, search, sortBy]);

  const totalAmount = claims.reduce((sum, claim) => sum + Number(claim.amount || 0), 0);
  const totalWithBill = claims.reduce((sum, claim) => sum + Number(claim.totalWithBill || 0), 0);
  const oldestClaim = claims.reduce<any | null>((oldest, claim) => !oldest || new Date(claim.date) < new Date(oldest.date) ? claim : oldest, null);
  const oldestWaitingDays = oldestClaim ? Math.max(0, Math.floor((Date.now() - new Date(oldestClaim.date).getTime()) / 86400000)) : 0;
  const pageCount = Math.max(1, Math.ceil(filteredClaims.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedClaims = filteredClaims.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const loadClaims = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = type === 'manager'
        ? await getPendingManagerClaims(user.email, user.role)
        : type === 'admin'
          ? await getPendingAdminClaims()
          : await getPendingSuperAdminClaims(user.email, user.role);
      setClaims(data);
      setPage(1);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadClaims(); }, [user, type]);
  useEffect(() => {
    if (type !== 'admin') return;
    getProjectWorks().then(setProjectWorks).catch(() => setProjectWorks([])).finally(() => setProjectWorksReady(true));
    getDropdownOptions().then((options) => {
      setProjectOptions(options.projects || []);
      setProjectCodeOptions(options.projectCodes || []);
      setCategoryOptions(options.categories || []);
      setProjectOptionsReady(true);
    }).catch(() => { setProjectOptions([]); setProjectCodeOptions([]); setCategoryOptions([]); setProjectOptionsReady(true); });
  }, [type]);
  useEffect(() => {
    if (type !== 'admin' || !approveDetails || !projectOptionsReady || projectMappingTouched) return;
    const project = projectOptions.find((item) => item.name === approveDetails.site);
    const customers = projectCustomerNames(project, projectCodeOptions);
    const storedCustomer = approveDetails.customerName || '';
    const expectedCustomer = customers.length === 1
      ? customers[0]
      : customers.includes(storedCustomer) ? storedCustomer : customers.length ? '' : storedCustomer;
    if (correctedSite !== approveDetails.site) return;
    setCorrectedCustomerName(expectedCustomer);
    setCorrectedProjectCodes(initialCorrectedProjectCodes(
      approveDetails.expenses || [], projectCodeOptions, approveDetails.site || '', expectedCustomer,
    ));
  }, [type, approveDetails, projectOptions, projectOptionsReady, projectCodeOptions, correctedSite, projectMappingTouched]);
  useEffect(() => {
    if (type !== 'admin' || !approveDetails || !approveModal || !projectWorksReady || correctedSite !== (approveDetails.site || '')) return;
    const project = projectOptions.find((item) => item.name === correctedSite);
    const works = projectWorks.filter((work) => work.active && work.project_id === project?.id);
    if (correctedWorkId === (approveDetails.workId || '') && !works.some((work) => work.id === correctedWorkId)) {
      setCorrectedWorkId(works.length === 1 ? works[0].id : '');
    }
  }, [type, approveDetails, approveModal, projectWorksReady, projectOptions, projectWorks, correctedSite, correctedWorkId]);
  useEffect(() => {
    if (viewClaim || approveModal) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [viewClaim, approveModal]);

  const adminProjectMappingDirty = type === 'admin' && Boolean(approveDetails) && (
    correctedSite !== (approveDetails?.site || '')
    || correctedCustomerName !== (approveDetails?.customerName || '')
    || correctedWorkId !== (approveDetails?.workId || '')
    || (approveDetails?.expenses || []).some((expense: any) =>
      (correctedProjectCodes[expense.id] ?? expense.projectCode ?? '') !== (expense.projectCode || ''),
    )
  );
  const expenseDetailsDirty = type === 'admin' && Boolean(approveDetails) && (approveDetails.expenses || []).some((expense: ApprovalExpense) => {
    const draft = expenseDetailDrafts[expense.id];
    return Boolean(draft) && (
      draft.category !== (expense.category || '')
      || draft.claimDate !== (expense.claimDate || '')
      || draft.description !== (expense.description || '')
      || draft.amountWithBill !== Number(expense.amountWithBill || 0).toFixed(2)
      || draft.amountWithoutBill !== Number(expense.amountWithoutBill || 0).toFixed(2)
    );
  });

  const handleCorrectedProjectChange = (siteName: string) => {
    setProjectMappingTouched(true);
    const project = projectOptions.find((item) => item.name === siteName);
    const customers = projectCustomerNames(project, projectCodeOptions);
    const customer = customers.length === 1 ? customers[0] : '';
    setCorrectedSite(siteName);
    setCorrectedCustomerName(customer);
    const works = projectWorks.filter((work) => work.active && work.project_id === project?.id);
    setCorrectedWorkId(works.length === 1 ? works[0].id : '');
    setCorrectedProjectCodes(initialCorrectedProjectCodes(approveDetails?.expenses || [], projectCodeOptions, siteName, customer));
  };

  const handleCorrectedCustomerChange = (customerName: string) => {
    setProjectMappingTouched(true);
    setCorrectedCustomerName(customerName);
    const reconciled = Object.fromEntries((approveDetails?.expenses || []).map((expense: any) => {
      const category = expenseDetailDrafts[expense.id]?.category ?? expense.category;
      const choices = availableProjectCodes(projectCodeOptions, correctedSite, category || '', customerName);
      const currentCode = correctedProjectCodes[expense.id] ?? expense.projectCode ?? '';
      const selectedCode = choices.some((choice) => choice.code === currentCode)
        ? currentCode
        : choices.length === 1 ? choices[0].code : '';
      return [expense.id, selectedCode];
    }));
    setCorrectedProjectCodes(reconciled);
  };

  const handleExpenseDetailChange = (expenseId: string, patch: Partial<ExpenseDetailDraft>) => {
    setExpenseDetailDrafts((previous) => ({ ...previous, [expenseId]: { ...previous[expenseId], ...patch } }));
    if (patch.category === undefined || !approveDetails) return;
    setProjectMappingTouched(true);
    const storedCode = approveDetails.expenses.find((expense: ApprovalExpense) => expense.id === expenseId)?.projectCode || '';
    const currentCode = correctedProjectCodes[expenseId] || storedCode;
    const choices = availableProjectCodes(projectCodeOptions, correctedSite, patch.category, correctedCustomerName);
    const selectedCode = choices.some((choice) => choice.code === currentCode)
      ? currentCode
      : choices.length === 1 ? choices[0].code : '';
    setCorrectedProjectCodes((previous) => ({ ...previous, [expenseId]: selectedCode }));
  };

  const handleSaveExpenseDetails = async () => {
    if (!approveModal || !approveDetails || type !== 'admin') return;
    let corrections;
    try {
      corrections = (approveDetails.expenses || []).map((expense: ApprovalExpense) => {
        const draft = expenseDetailDrafts[expense.id];
        if (!draft?.category.trim()) throw new Error(`Choose an expense category for ${expense.category || 'each row'}`);
        const amountWithBill = Number(draft.amountWithBill);
        const amountWithoutBill = Number(draft.amountWithoutBill);
        const validMoney = (value: number) => Number.isFinite(value) && value >= 0
          && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
        if (!validMoney(amountWithBill) || !validMoney(amountWithoutBill) || amountWithBill + amountWithoutBill <= 0) {
          throw new Error('Enter a positive expense total with nonnegative amounts to two decimal places.');
        }
        return {
          id: expense.id,
          category: draft.category.trim(),
          claimDate: draft.claimDate,
          description: draft.description.trim(),
          amountWithBill,
          amountWithoutBill,
        };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Review the expense details before saving');
      return;
    }

    setSavingExpenseDetails(true);
    try {
      await correctPendingClaimExpenses(approveModal.internalId || approveModal.claimId, corrections);
      const details = await getClaimById(approveModal.internalId || approveModal.claimId);
      if (!details) throw new Error('Expense details were saved, but the claim could not be reloaded. Refresh the claim.');
      setApproveDetails(details);
      setExpenseDetailDrafts(initialExpenseDetailDrafts(details.expenses || []));
      setRowAmounts(initialRowAmounts((details.expenses || []) as ApprovalExpense[], details.verifiedAmount));
      loadClaims();
      toast.success('Expense details updated and claim totals recalculated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update expense details');
    } finally {
      setSavingExpenseDetails(false);
    }
  };

  const handleSaveProjectMapping = async () => {
    if (!approveModal || !approveDetails) return;
    if (expenseDetailsDirty) {
      toast.error('Update the expense details before saving project cost codes');
      return;
    }
    const project = projectOptions.find((item) => item.name === correctedSite);
    if (!project) {
      toast.error('Choose an active project');
      return;
    }
    if (projectCustomerNames(project, projectCodeOptions).length > 0 && !correctedCustomerName) {
      toast.error('Choose the customer mapped to this project');
      return;
    }

    const expenseCodes = (approveDetails.expenses || []).map((expense: any) => {
      const category = expenseDetailDrafts[expense.id]?.category ?? expense.category;
      const projectCode = correctedProjectCodes[expense.id] ?? expense.projectCode ?? '';
      const choices = availableProjectCodes(projectCodeOptions, correctedSite, category || '', correctedCustomerName);
      return { expense, projectCode, choices };
    });
    const incompleteCode = expenseCodes.find(({ projectCode, choices }) => choices.length > 0 && !projectCode);
    if (incompleteCode) {
      toast.error(`Choose a project cost code for ${incompleteCode.expense.category || 'each expense'} before saving`);
      return;
    }
    const invalidCode = expenseCodes.find(({ projectCode, choices }) => projectCode && !choices.some((choice) => choice.code === projectCode));
    if (invalidCode) {
      toast.error(`Choose a project cost code valid for ${invalidCode.expense.category || 'this expense'} and customer`);
      return;
    }

    setProcessing(true);
    try {
      await correctPendingClaimProject(
        approveModal.internalId || approveModal.claimId,
        correctedSite,
        correctedCustomerName,
        correctedWorkId || null,
        expenseCodes.map(({ expense, projectCode }) => ({ id: expense.id, projectCode })),
      );
      const details = await getClaimById(approveModal.internalId || approveModal.claimId);
      if (!details) throw new Error('Project details were saved, but the claim could not be reloaded. Refresh the claim.');
      setApproveDetails(details);
      setCorrectedSite(details.site || '');
      setCorrectedCustomerName(details.customerName || '');
      setCorrectedWorkId(details.workId || '');
      setCorrectedProjectCodes(Object.fromEntries((details.expenses || []).map((expense: any) => [expense.id, expense.projectCode || ''])));
      setProjectMappingTouched(false);
      loadClaims();
      toast.success('Project, customer, work routing, and expense cost codes updated');
    } catch (error: any) {
      toast.error(error.message || 'Could not update project details');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!approveModal) return;
    if (expenseDetailsDirty) {
      toast.error('Update the expense details before verifying this claim');
      return;
    }
    if (adminProjectMappingDirty) {
      toast.error('Save the project and cost code corrections before verifying this claim');
      return;
    }
    const amount = Number(verifiedAmount);
    if ((type === 'admin' || type === 'manager' || type === 'super-admin') && (!verifiedAmount || Number.isNaN(amount) || amount < 0)) {
      toast.error('Enter a valid final approved amount');
      return;
    }
    setProcessing(true);
    try {
      const internalId = approveModal.internalId || approveModal.claimId;
      const approved = approvedRows(approveDetails.expenses, rowAmounts);
      const rows = Object.fromEntries(approved.rows.map(row => [row.id, row.amount]));
      if (type === 'manager') await approveClaimAsManager(internalId, user!.email, approveDescription, amount, rows);
      else if (type === 'super-admin') await approveClaimAsSuperAdmin(internalId, user!.email, approveDescription, amount, rows);
      else await approveClaimAsAdmin(internalId, user!.email, approveDescription, amount, rows);
      toast.success(type === 'admin' ? 'Claim verified and forwarded' : type === 'super-admin' ? 'Claim sent for accounts verification' : 'Claim approved');
      setApproveModal(null);
      setApproveDetails(null);
      setApproveDescription('');
      setCorrectedSite('');
      setCorrectedCustomerName('');
      setCorrectedProjectCodes({});
      setProjectMappingTouched(false);
      setCorrectedWorkId('');
      setRowAmounts({});
      setExpenseDetailDrafts({});
      loadClaims();
    } catch (e: any) {
      toast.error(e.message);
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    setProcessing(true);
    try {
      const internal = rejectModal!.internalId || rejectModal!.claimId;
      await rejectClaim(internal, rejectReason, user!.email, type === 'manager' ? 'Manager' : type === 'super-admin' ? 'Super Admin' : 'Admin');
      toast.success('Claim rejected');
      setRejectModal(null);
      setRejectReason('');
      loadClaims();
    } catch (e: any) {
      toast.error(e.message);
    }
    setProcessing(false);
  };

  const handleView = async (internalId: string) => {
    const data = await getClaimById(internalId);
    setViewClaim(data);
  };

  const openApproveModal = (claim: any) => {
    setApproveModal({ claimId: claim.claimId, internalId: claim.claimIdInternal || claim.claimId });
    setApproveDetails(null);
    setApproveDescription('');
    setRowAmounts({});
    setCorrectedSite('');
    setCorrectedCustomerName('');
    setCorrectedProjectCodes({});
    setProjectMappingTouched(false);
    setCorrectedWorkId('');
    setExpenseDetailDrafts({});
    // Fetch full claim details so approver can review attachments and line items in the same modal
    void (async () => {
      try {
        const details = await getClaimById(claim.claimIdInternal || claim.claimId);
        setApproveDetails(details);
        setExpenseDetailDrafts(initialExpenseDetailDrafts((details?.expenses || []) as ApprovalExpense[]));
        setCorrectedSite(details?.site || '');
        const claimProject = projectOptions.find((item) => item.name === details?.site);
        const customers = projectCustomerNames(claimProject, projectCodeOptions);
        const currentCustomer = details?.customerName || '';
        const customer = customers.length === 1
          ? customers[0]
          : customers.includes(currentCustomer) ? currentCustomer : customers.length ? '' : currentCustomer;
        setCorrectedCustomerName(customer);
        setCorrectedProjectCodes(initialCorrectedProjectCodes(details?.expenses || [], projectCodeOptions, details?.site || '', customer));
        setCorrectedWorkId(details?.workId || '');
        setRowAmounts(initialRowAmounts((details?.expenses || []) as unknown as ApprovalExpense[], details?.verifiedAmount));
      } catch (e) {
        console.error('Failed to load claim details for approval', e);
        setApproveDetails(null);
      }
    })();
  };

  const Icon = type === 'manager' ? UserCheck : type === 'admin' ? ShieldCheck : BadgeCheck;
  const title = type === 'manager' ? 'Manager Approval' : type === 'admin' ? 'Admin Verification' : 'Final Approval';
  const approveLabel = type === 'admin' ? 'Verify & Forward' : type === 'super-admin' ? 'Final Approve' : 'Approve';
  const stageColor = type === 'manager' ? 'text-indigo-600' : type === 'admin' ? 'text-sky-600' : 'text-violet-600';
  const statusBadge = (
    <Badge variant="outline" className={type === 'manager'
      ? 'border-indigo-200 bg-indigo-100 text-indigo-800 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300'
      : type === 'admin'
        ? 'border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300'
        : 'border-violet-200 bg-violet-100 text-violet-800 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300'}>
      {type === 'admin' ? 'Pending Verification' : type === 'super-admin' ? 'Pending Final Approval' : 'Pending Manager Approval'}
    </Badge>
  );

  if (viewClaim) {
    return (
      <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-right-4 space-y-4 pb-8 duration-300">
        <div className="sticky top-0 z-20 flex flex-col gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setViewClaim(null)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold sm:text-lg">Claim Details</h2>
              <p className="truncate text-xs text-muted-foreground">{viewClaim.claimId} · {viewClaim.submittedBy}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setViewClaim(null)}>Close Details</Button>
        </div>

        <ClaimDetailsOverview claim={viewClaim} />
        <ClaimAttachmentsSection claim={viewClaim} inlinePreview />
        <ClaimApprovalTimeline claim={viewClaim} />
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="mb-4 text-base font-semibold">Expense Details</h3>
          <ClaimExpenseDetails claim={viewClaim} />
        </section>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setViewClaim(null)}><ArrowLeft className="mr-1 h-4 w-4" /> Back to {title}</Button>
        </div>
      </div>
    );
  }

  if (approveModal) {
    const closeApprovalPage = () => {
      setApproveModal(null);
      setApproveDetails(null);
      setApproveDescription('');
      setCorrectedSite('');
      setCorrectedCustomerName('');
      setCorrectedProjectCodes({});
      setProjectMappingTouched(false);
      setCorrectedWorkId('');
      setRowAmounts({});
      setExpenseDetailDrafts({});
    };

    return (
      <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-right-4 space-y-4 pb-8 duration-300">
        <div className="sticky top-0 z-20 flex flex-col gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" onClick={closeApprovalPage}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold sm:text-lg">{approveLabel} Claim</h2>
              <p className="truncate text-xs text-muted-foreground">{approveModal.claimId}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeApprovalPage}>Cancel</Button>
            <Button className="gradient-success text-success-foreground" onClick={handleApprove} disabled={processing || !approveDetails || adminProjectMappingDirty || expenseDetailsDirty}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} {approveLabel}
            </Button>
          </div>
        </div>

        {!approveDetails ? (
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <ClaimDetailsOverview claim={approveDetails} />
            {type === 'admin' && (() => {
              const project = projectOptions.find((item) => item.name === correctedSite);
              const worksForProject = projectWorks.filter((work) => work.active && work.project_id === project?.id);
              const customerNames = projectCustomerNames(project, projectCodeOptions);
              return (
                <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950/20">
                  <div className="flex flex-col gap-1">
                    <Label>Correct project and cost code mapping</Label>
                    <p className="text-xs text-muted-foreground">Changing the project updates customer details, available expense codes, and manager routing together. Save corrections before verifying.</p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="admin-correct-project">Project / Site</Label>
                      <Select value={correctedSite} onValueChange={handleCorrectedProjectChange} disabled={processing || !projectOptionsReady || !projectWorksReady}>
                        <SelectTrigger id="admin-correct-project"><SelectValue placeholder="Choose project / site" /></SelectTrigger>
                        <SelectContent>{projectOptions.map((option) => <SelectItem key={option.id || option.name} value={option.name}>{option.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="admin-correct-customer">Customer</Label>
                      {customerNames.length > 1 ? (
                        <Select value={correctedCustomerName} onValueChange={handleCorrectedCustomerChange} disabled={processing}>
                          <SelectTrigger id="admin-correct-customer"><SelectValue placeholder="Choose customer" /></SelectTrigger>
                          <SelectContent>{customerNames.map((name: string) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input id="admin-correct-customer" value={customerNames[0] || 'No customer mapped'} readOnly className="bg-background" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="admin-correct-work">Work activity / Manager routing</Label>
                      <Select value={correctedWorkId} onValueChange={(value) => { setProjectMappingTouched(true); setCorrectedWorkId(value); }} disabled={processing || !projectWorksReady || worksForProject.length === 0}>
                        <SelectTrigger id="admin-correct-work"><SelectValue placeholder={worksForProject.length ? 'Choose the correct work' : 'No active work for this project'} /></SelectTrigger>
                        <SelectContent>{worksForProject.map((work) => <SelectItem key={work.id} value={work.id}>{work.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">The assigned manager is updated from the selected work activity.</p>
                    <Button type="button" variant="outline" onClick={handleSaveProjectMapping} disabled={processing || !projectOptionsReady || !projectWorksReady || !adminProjectMappingDirty}>
                      {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save Project & Cost Codes
                    </Button>
                  </div>
                </section>
              );
            })()}
            <ClaimAttachmentsSection claim={approveDetails} inlinePreview onRemove={type === 'admin' ? (fileId) => {
              if (!window.confirm('Remove this attachment from the claim? If no other claim uses it, the stored file will be permanently deleted.')) return;
              void (async () => {
                setProcessing(true);
                try {
                  await removePendingClaimAttachment(approveModal.internalId || approveModal.claimId, fileId);
                  const details = await getClaimById(approveModal.internalId || approveModal.claimId);
                  setApproveDetails(details);
                  loadClaims();
                  toast.success('Attachment removed from the claim');
                } catch (error: any) {
                  toast.error(error.message || 'Could not remove attachment');
                  const details = await getClaimById(approveModal.internalId || approveModal.claimId).catch(() => null);
                  if (details) setApproveDetails(details);
                } finally {
                  setProcessing(false);
                }
              })();
            } : undefined} />
            <ClaimApprovalTimeline claim={approveDetails} />
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <h3 className="mb-4 text-base font-semibold">Expense Summary</h3>
              <ExpenseApprovalEditor
                expenses={approveDetails.expenses}
                amounts={rowAmounts}
                onChange={setRowAmounts}
                disabled={processing || savingExpenseDetails}
                detailDrafts={type === 'admin' ? expenseDetailDrafts : undefined}
                categoryOptions={categoryOptions}
                onDetailChange={type === 'admin' ? handleExpenseDetailChange : undefined}
                detailsDirty={expenseDetailsDirty}
                savingDetails={savingExpenseDetails}
                onSaveDetails={handleSaveExpenseDetails}
              />
            </section>
          </>
        )}

        <section className="rounded-xl border border-primary/20 bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Approval Decision</h3>
            <p className="mt-1 text-xs text-muted-foreground">Review the claim above before confirming this action.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <Label>Final Approved Amount *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={verifiedAmount}
                readOnly
                placeholder="Enter final approved amount"
                className="mt-1"
              />
              {approveDetails?.submittedAmount != null && (
                <p className="mt-1 text-xs text-muted-foreground">Submitted: Rs. {approveDetails.submittedAmount.toFixed(2)}</p>
              )}
            </div>
            <div>
              <Label>Notes / Description (optional)</Label>
              <Textarea
                placeholder="Add notes about this approval..."
                value={approveDescription}
                onChange={(event) => setApproveDescription(event.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closeApprovalPage}>Cancel</Button>
            <Button className="gradient-success text-success-foreground" onClick={handleApprove} disabled={processing || !approveDetails || adminProjectMappingDirty || expenseDetailsDirty}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Confirm {approveLabel}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4 duration-500">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Pending Claims</p>
            <span className="rounded-lg bg-orange-100 p-2 text-orange-600 dark:bg-orange-950/50"><Clock3 className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-2xl font-bold">{claims.length}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Awaiting this stage</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Pending Amount</p>
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><WalletCards className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-xl font-bold text-primary">Rs. {totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Current claim value</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">With Bills</p>
            <span className="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-950/50"><ReceiptText className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-xl font-bold">Rs. {totalWithBill.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Documented expenses</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Oldest Waiting</p>
            <span className={`rounded-lg bg-muted p-2 ${stageColor}`}><Icon className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-2xl font-bold">{oldestWaitingDays} <span className="text-sm font-medium text-muted-foreground">days</span></p>
          <p className="mt-1 text-[11px] text-muted-foreground">Queue ageing</p>
        </div>
      </div>

      <div className="glass-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><Icon className={`h-5 w-5 ${stageColor}`} /> {title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Review claims in oldest-first priority</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadClaims()}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
        </div>

        <div className="grid grid-cols-1 gap-2 border-b border-border bg-muted/20 p-3 sm:grid-cols-[minmax(240px,1fr)_200px] sm:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search claim, employee, email or site..."
              className="pl-9"
            />
          </div>
          <select
            value={sortBy}
            onChange={(event) => { setSortBy(event.target.value); setPage(1); }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Sort approval queue"
          >
            <option value="oldest">Oldest First</option>
            <option value="newest">Newest First</option>
            <option value="amount-high">Amount: High to Low</option>
            <option value="amount-low">Amount: Low to High</option>
          </select>
        </div>

        <div className="block space-y-3 p-3 md:hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <Skeleton className="mb-3 h-5 w-1/2" />
                <Skeleton className="mb-2 h-4 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))
          ) : filteredClaims.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="font-medium text-foreground">No matching pending claims</p>
              <p className="mt-1 text-xs">Try a different employee, claim number, or site.</p>
            </div>
          ) : paginatedClaims.map((claim) => (
            <div key={claim.claimId} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{claim.claimId}</p>
                  <p className="mt-2 text-2xl font-bold text-primary">Rs. {claim.amount.toFixed(2)}</p>
                  {claim.submittedAmount != null && claim.submittedAmount !== claim.amount && (
                    <p className="text-xs text-muted-foreground">Submitted Rs. {claim.submittedAmount.toFixed(2)}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{claim.site}</p>
                  {claim.workName && <p className="text-sm text-muted-foreground">Work: {claim.workName}</p>}
                  <p className="text-sm text-muted-foreground">{formatDate(claim.date)}</p>
                  <p className="text-xs text-muted-foreground">Submitted by {claim.submittedBy}</p>
                </div>
                {statusBadge}
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">With Bill</p>
                  <p className="font-medium">Rs. {(claim.totalWithBill ?? 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Without Bill</p>
                  <p className="font-medium">Rs. {(claim.totalWithoutBill ?? 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleView(claim.claimIdInternal || claim.claimId)}>
                  <Eye className="mr-1 h-4 w-4" /> Details
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-success" onClick={() => openApproveModal(claim)} disabled={processing}>
                  <Check className="mr-1 h-4 w-4" /> {approveLabel}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-destructive" onClick={() => setRejectModal({ claimId: claim.claimId, internalId: claim.claimIdInternal || claim.claimId })}>
                  <X className="mr-1 h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden max-w-full overflow-x-auto md:block">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted shadow-sm">
              <tr className="bg-muted/50">
                <th className="p-3 text-left">Claim ID</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Site</th>
                <th className="p-3 text-right">With Bill</th>
                <th className="p-3 text-right">Without Bill</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-center">Stage</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredClaims.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No matching pending claims</td></tr>
              ) : paginatedClaims.map((claim) => (
                <tr key={claim.claimId} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{claim.claimId}</td>
                  <td className="p-3">{formatDate(claim.date)}</td>
                  <td className="p-3 break-words">{claim.submittedBy}</td>
                  <td className="p-3 break-words">{claim.site}{claim.workName && <p className="text-xs text-muted-foreground">Work: {claim.workName}</p>}</td>
                  <td className="p-3 text-right">Rs. {(claim.totalWithBill ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right">Rs. {(claim.totalWithoutBill ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right text-base font-bold">
                    Rs. {claim.amount.toFixed(2)}
                    {claim.submittedAmount != null && claim.submittedAmount !== claim.amount && (
                      <div className="text-xs font-normal text-muted-foreground">Submitted Rs. {claim.submittedAmount.toFixed(2)}</div>
                    )}
                  </td>
                  <td className="p-3 text-center">{statusBadge}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => handleView(claim.claimIdInternal || claim.claimId)}><Eye className="mr-1 h-4 w-4" /> Details</Button>
                      <Button variant="outline" size="sm" className="whitespace-nowrap border-success/30 bg-success/5 text-success hover:bg-success/10" onClick={() => openApproveModal(claim)} disabled={processing}><Check className="mr-1 h-4 w-4" /> {approveLabel}</Button>
                      <Button variant="outline" size="sm" className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10" onClick={() => setRejectModal({ claimId: claim.claimId, internalId: claim.claimIdInternal || claim.claimId })}><X className="mr-1 h-4 w-4" /> Reject</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filteredClaims.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border bg-muted/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredClaims.length)} of {filteredClaims.length} pending claims
            </p>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="min-w-20 text-center text-xs font-medium">Page {currentPage} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ResponsiveOverlay
        open={!!approveModal}
        onOpenChange={(open) => {
          if (!open) {
            setApproveModal(null);
            setApproveDetails(null);
            setApproveDescription('');
            setRowAmounts({});
          }
        }}
        title={`${approveLabel} Claim - ${approveModal?.claimId || ''}`}
        footer={approveModal ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setApproveModal(null)}>Cancel</Button>
            <Button className="gradient-success text-success-foreground" onClick={handleApprove} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} {approveLabel}
            </Button>
          </div>
        ) : undefined}
        desktopClassName="max-w-7xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[74vh] overflow-y-auto pr-1"
        >
        <div className="space-y-3">
          {approveDetails && (
            <div className="rounded-lg border border-border bg-muted/20 p-2">
              <ClaimDetailsOverview claim={approveDetails} />

              {approveDetails.generalFileIds && approveDetails.generalFileIds.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> General Attachments ({approveDetails.generalFileIds.length})</h4>
                  <AttachmentPreview fileIds={approveDetails.generalFileIds} claimId={approveDetails.claimId} inlinePreview />
                </div>
              )}
            </div>
          )}
          {approveDetails && <ClaimApprovalTimeline claim={approveDetails} />}
          {approveDetails?.expenses?.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <h4 className="mb-3 text-sm font-semibold">Expense Details</h4>
              <ExpenseApprovalEditor expenses={approveDetails.expenses} amounts={rowAmounts} onChange={setRowAmounts} disabled={processing} />
            </div>
          )}
          {(type === 'admin' || type === 'manager' || type === 'super-admin') && (
            <div>
              <Label>Final Approved Amount *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={verifiedAmount}
                readOnly
                placeholder="Enter final approved amount"
              />
            </div>
          )}
          {approveModal && (
            <div className="text-xs text-muted-foreground">Submitted: Rs. {claims.find(c => c.claimId === approveModal.claimId)?.submittedAmount?.toFixed(2) ?? '0.00'}</div>
          )}
          <div>
            <Label>Notes / Description (optional)</Label>
            <Textarea
              placeholder="Add any notes about this approval..."
              value={approveDescription}
              onChange={e => setApproveDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={!!rejectModal}
        onOpenChange={(open) => {
          if (!open) {
            setRejectModal(null);
            setRejectReason('');
          }
        }}
        title={`Reject Claim - ${rejectModal?.claimId || ''}`}
        footer={rejectModal ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />} Reject
            </Button>
          </div>
        ) : undefined}
      >
        <div>
          <Label>Reason for Rejection *</Label>
          <Textarea placeholder="Reason for rejection..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={5} />
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={!!viewClaim}
        onOpenChange={(open) => {
          if (!open) setViewClaim(null);
        }}
        title={`Claim Details - ${viewClaim?.claimId || ''}`}
        desktopClassName="max-w-7xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[75vh] overflow-y-auto"
        footer={viewClaim ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setViewClaim(null)}>Close</Button>
          </div>
        ) : undefined}
      >
        {viewClaim && (
          <div className="space-y-4">
            <ClaimDetailsOverview claim={viewClaim} />

            {viewClaim.generalFileIds && viewClaim.generalFileIds.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Paperclip className="h-4 w-4" /> General Attachments ({viewClaim.generalFileIds.length})
                </h4>
                <AttachmentPreview fileIds={viewClaim.generalFileIds} claimId={viewClaim.claimId} inlinePreview />
              </div>
            )}

            <ClaimApprovalTimeline claim={viewClaim} />

            <ClaimExpenseDetails claim={viewClaim} />
          </div>
        )}
      </ResponsiveOverlay>
    </div>
  );
}
