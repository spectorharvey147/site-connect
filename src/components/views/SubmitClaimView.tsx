import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { submitClaim, resubmitRejectedClaim, getDropdownOptions, getCurrentBalance, getClaimById, ProjectCodeOption } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, PlusCircle, Trash2, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import FileUpload, { FileUploadHandle } from '@/components/views/FileUpload';
import RupeeIcon from '@/components/icons/RupeeIcon';
import AttachmentPreview from '@/components/views/AttachmentPreview';

interface ExpenseRow {
  id: string;
  category: string;
  projectCode: string;
  claimDate: string;
  description: string;
  amountWithBill: number;
  amountWithoutBill: number;
  attachmentIds: string[];
}

function emptyExpenseRow(): ExpenseRow {
  return {
    id: crypto.randomUUID(),
    category: '',
    projectCode: '',
    claimDate: '',
    description: '',
    amountWithBill: 0,
    amountWithoutBill: 0,
    attachmentIds: [],
  };
}

function parseAmountInput(value: string) {
  const normalized = value.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SubmitClaimView() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileUploadRef = useRef<FileUploadHandle>(null);
  const rowFileUploadRefs = useRef<Record<string, FileUploadHandle | null>>({});
  const expenseCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingExpenseFocusRef = useRef<string | null>(null);
  const [site, setSite] = useState('');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([emptyExpenseRow()]);
  const [activeExpenseId, setActiveExpenseId] = useState(() => expenses[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [dropdown, setDropdown] = useState<any>({ projects: [], categories: [], projectCodes: [], byProject: {} });
  const [tempClaimId, setTempClaimId] = useState(() => 'C-' + Date.now());
  const [balance, setBalance] = useState<number | null>(null);
  const [fileUploadKey, setFileUploadKey] = useState(0);
  const [editingClaim, setEditingClaim] = useState<any>(null);
  const [existingFileIds, setExistingFileIds] = useState<string[]>([]);
  const editClaimId = searchParams.get('editClaim');

  const uniqueFileIds = (fileIds: string[]) => [...new Set(fileIds.map((fileId) => String(fileId || '').trim()).filter(Boolean))];

  useEffect(() => {
    getDropdownOptions().then(setDropdown);
    if (user) getCurrentBalance(user.email).then(setBalance);
  }, [user]);

  useEffect(() => {
    if (!user || !editClaimId) return;
    let cancelled = false;
    setLoading(true);
    getClaimById(editClaimId)
      .then((claim) => {
        if (cancelled) return;
        if (!claim) {
          toast.error('Claim not found');
          navigate('/history');
          return;
        }
        if (claim.userEmail?.toLowerCase() !== user.email.toLowerCase() || !claim.status?.toLowerCase().includes('reject')) {
          toast.error('Only your rejected claims can be edited and resubmitted');
          navigate('/history');
          return;
        }

        const rows = claim.expenses?.length
          ? claim.expenses.map((expense: any) => ({
              id: crypto.randomUUID(),
              category: expense.category || '',
              projectCode: expense.projectCode || '',
              claimDate: expense.claimDate || '',
              description: expense.description || '',
              amountWithBill: expense.amountWithBill || 0,
              amountWithoutBill: expense.amountWithoutBill || 0,
              attachmentIds: expense.attachmentIds || [],
            }))
          : [emptyExpenseRow()];
        const rowAttachmentIds = new Set(rows.flatMap((row) => row.attachmentIds || []));
        setEditingClaim(claim);
        setSite(claim.site || '');
        setExpenses(rows);
        setActiveExpenseId(rows[0]?.id || '');
        setExistingFileIds((claim.fileIds || []).filter((fileId: string) => !rowAttachmentIds.has(fileId)));
        setTempClaimId(claim.claimIdInternal || claim.claimId || `C-${Date.now()}`);
      })
      .catch((error) => {
        toast.error(error.message || 'Could not load claim for editing');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editClaimId, navigate, user]);

  const getFilteredProjectCodes = (category: string) => {
    if (!site || !category) return [];

    const matchingCategory = category.trim().toLowerCase();
    const scopedCodes = [...(dropdown.byProject?.[site] || []), ...(dropdown.byProject?.[''] || [])] as ProjectCodeOption[];
    const unique = new Map<string, ProjectCodeOption>();

    scopedCodes.forEach((code) => {
      const isAllowed = code.allowsAllCategories
        || code.expenseCategories.some((item) => item.trim().toLowerCase() === matchingCategory);

      if (isAllowed) {
        unique.set(`${code.project}|${code.code}`, code);
      }
    });

    return [...unique.values()];
  };

  const addRow = () => {
    const nextRow = emptyExpenseRow();
    pendingExpenseFocusRef.current = nextRow.id;
    setExpenses((prev) => [...prev, nextRow]);
    setActiveExpenseId(nextRow.id);
  };

  const removeRow = (id: string) => {
    if (expenses.length <= 1) return;
    const removedIndex = expenses.findIndex((expense) => expense.id === id);
    const nextExpenses = expenses.filter((expense) => expense.id !== id);
    setExpenses(nextExpenses);
    if (activeExpenseId === id) {
      setActiveExpenseId(nextExpenses[Math.max(0, removedIndex - 1)]?.id || nextExpenses[0]?.id || '');
    }
  };

  const updateRow = (id: string, field: keyof ExpenseRow, value: string | number) => {
    setExpenses((prev) => prev.map((expense) => {
      if (expense.id !== id) return expense;

      const nextExpense = { ...expense, [field]: value };
      if (field === 'category') {
        const availableCodes = getFilteredProjectCodes(String(value));
        const isCurrentCodeValid = availableCodes.some((code) => code.code === expense.projectCode);
        if (!isCurrentCodeValid) nextExpense.projectCode = '';
      }

      return nextExpense;
    }));
  };

  const totalWithBill = expenses.reduce((sum, expense) => sum + (expense.amountWithBill || 0), 0);
  const totalWithoutBill = expenses.reduce((sum, expense) => sum + (expense.amountWithoutBill || 0), 0);
  const grandTotal = totalWithBill + totalWithoutBill;

  useEffect(() => {
    if (editingClaim) return;
    setExpenses((prev) => prev.map((expense) => ({ ...expense, projectCode: '' })));
  }, [site, editingClaim]);

  useEffect(() => {
    const focusId = pendingExpenseFocusRef.current;
    if (!focusId) return;

    expenseCardRefs.current[focusId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    pendingExpenseFocusRef.current = null;
  }, [expenses, activeExpenseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site) {
      toast.error('Please select a project site');
      return;
    }
    if (expenses.some((expense) => !expense.category || !expense.projectCode || (expense.amountWithBill === 0 && expense.amountWithoutBill === 0))) {
      toast.error('Every row needs a category, a matching cost code, and an amount');
      return;
    }
    const hasClaimLevelAttachments = ((fileUploadRef.current?.getFileCount() || 0) + existingFileIds.length) > 0;
    const firstMissingBillRow = expenses.findIndex((expense) => {
      const rowCount = (expense.attachmentIds?.length || 0) + (rowFileUploadRefs.current[expense.id]?.getFileCount() || 0);
      return expense.amountWithBill > 0 && rowCount === 0 && !hasClaimLevelAttachments;
    });
    if (firstMissingBillRow >= 0) {
      toast.error(`Attach a bill to expense #${firstMissingBillRow + 1} or use the bottom attachment area`);
      return;
    }

    setLoading(true);
    try {
      let uploadedPaths: string[] = [];
      if (fileUploadRef.current) {
        uploadedPaths = await fileUploadRef.current.uploadAll();
      }
      const expensesWithAttachments = await Promise.all(expenses.map(async (expense) => {
        const uploadedRowPaths = await (rowFileUploadRefs.current[expense.id]?.uploadAll() || Promise.resolve([]));
        return {
          category: expense.category,
          projectCode: expense.projectCode,
          claimDate: expense.claimDate,
          description: expense.description,
          amountWithBill: expense.amountWithBill || 0,
          amountWithoutBill: expense.amountWithoutBill || 0,
          attachmentIds: uniqueFileIds([...(expense.attachmentIds || []), ...uploadedRowPaths]),
        };
      }));
      const allFileIds = uniqueFileIds([
        ...existingFileIds,
        ...uploadedPaths,
        ...expensesWithAttachments.flatMap((expense) => expense.attachmentIds),
      ]);
      if (expenses.some((expense) => expense.amountWithBill > 0) && allFileIds.length === 0) {
        throw new Error('Please upload bill attachments before submitting this claim.');
      }

      const payload = {
        site,
        expenses: expensesWithAttachments,
        fileIds: allFileIds,
      };
      const result = editingClaim
        ? await resubmitRejectedClaim(editingClaim.claimIdInternal || editingClaim.claimId, payload, user!.email, user!.name)
        : await submitClaim(payload, user!.email, user!.name);

      if (result.ok) {
        toast.success(result.message);
        setSite('');
        const nextRow = emptyExpenseRow();
        setExpenses([nextRow]);
        setActiveExpenseId(nextRow.id);
        setTempClaimId('C-' + Date.now());
        setFileUploadKey((prev) => prev + 1);
        setEditingClaim(null);
        setExistingFileIds([]);
        if (user) getCurrentBalance(user.email).then(setBalance);
        if (editClaimId) navigate('/history');
      }
    } catch (err: any) {
      toast.error(err.message || 'Submission failed');
    }
    setLoading(false);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 md:pb-0">
      {balance !== null && (
        <div className="glass-card mb-4 flex flex-col justify-between gap-3 border-l-4 border-l-primary p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="flex items-center gap-3">
            <RupeeIcon className="h-6 w-6 flex-shrink-0 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground sm:text-sm">Available Balance</p>
              <p className="text-xl font-bold text-primary sm:text-2xl">Rs. {balance.toFixed(2)}</p>
            </div>
          </div>
          {grandTotal > 0 && (
            <div className="border-t pt-2 text-left sm:border-t-0 sm:pt-0 sm:text-right">
              <p className="text-xs text-muted-foreground sm:text-sm">After this claim</p>
              <p className={`text-lg font-bold ${(balance - grandTotal) < 0 ? 'text-destructive' : 'text-success'}`}>
                Rs. {(balance - grandTotal).toFixed(2)}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="glass-card p-4 sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Send className="h-5 w-5 text-primary" /> New Claim Submission
          {editingClaim && <span className="text-sm font-normal text-muted-foreground">Editing rejected claim {editingClaim.claimId}</span>}
        </h2>
        {editingClaim?.rejectionReason && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <strong>Required changes:</strong> {editingClaim.rejectionReason}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={user?.name || ''} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Project Site</Label>
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger><SelectValue placeholder="Select project site" /></SelectTrigger>
                <SelectContent>
                  {dropdown.projects.map((project: any) => (
                    <SelectItem key={project.name} value={project.name}>{project.name} {project.code ? `(${project.code})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold sm:text-base">Expense Details</h3>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <PlusCircle className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Add Expense</span>
            </Button>
          </div>

          <div className="mb-4 block space-y-4 md:hidden">
            {expenses.map((expense, idx) => {
              const filteredCodes = getFilteredProjectCodes(expense.category);
              const isActive = expense.id === activeExpenseId;
              const subtotal = (expense.amountWithBill || 0) + (expense.amountWithoutBill || 0);
              return (
                <div
                  key={expense.id}
                  ref={(node) => { expenseCardRefs.current[expense.id] = node; }}
                  className="rounded-lg border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setActiveExpenseId(expense.id)}
                    >
                      {isActive ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">Expense #{idx + 1}</span>
                        {!isActive && (
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {expense.category || 'No category'}{expense.projectCode ? ` - ${expense.projectCode}` : ''} - Rs. {subtotal.toFixed(2)}
                          </span>
                        )}
                      </span>
                    </button>
                    {expenses.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeRow(expense.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className={isActive ? 'space-y-3' : 'hidden'}>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Category</Label>
                          <Select value={expense.category} onValueChange={(value) => updateRow(expense.id, 'category', value)}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {dropdown.categories.map((category: string) => (
                                <SelectItem key={category} value={category}>{category}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Date</Label>
                          <Input type="date" value={expense.claimDate} onChange={e => updateRow(expense.id, 'claimDate', e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Project Code</Label>
                        <Select
                          value={expense.projectCode}
                          onValueChange={(value) => updateRow(expense.id, 'projectCode', value)}
                          disabled={!site || !expense.category}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={!site ? 'Select site first' : !expense.category ? 'Select category first' : 'Select code'} />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredCodes.length === 0 ? (
                              <SelectItem value="none" disabled>No matching cost codes</SelectItem>
                            ) : filteredCodes.map((code) => (
                              <SelectItem key={`${code.project}-${code.code}`} value={code.code}>{code.code} - {code.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Cost codes now follow the selected expense category automatically.</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Input value={expense.description} onChange={e => updateRow(expense.id, 'description', e.target.value)} placeholder="Enter description" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">With Bill (Rs.)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*[.]?[0-9]*"
                            value={expense.amountWithBill || ''}
                            onChange={e => updateRow(expense.id, 'amountWithBill', parseAmountInput(e.target.value))}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Without Bill (Rs.)</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*[.]?[0-9]*"
                            value={expense.amountWithoutBill || ''}
                            onChange={e => updateRow(expense.id, 'amountWithoutBill', parseAmountInput(e.target.value))}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2">
                        <span className="text-sm text-muted-foreground">Subtotal</span>
                        <span className="text-lg font-bold text-primary">Rs. {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="rounded-md border border-border bg-muted/20 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <Label className="text-xs">Bill Attachments</Label>
                          {expense.attachmentIds.length > 0 && <span className="text-xs text-muted-foreground">{expense.attachmentIds.length} saved</span>}
                        </div>
                        {expense.attachmentIds.length > 0 && (
                          <div className="mb-3 rounded-md border border-border bg-background p-2">
                            <AttachmentPreview fileIds={expense.attachmentIds} claimId={editingClaim?.claimId || tempClaimId} compact />
                          </div>
                        )}
                        <FileUpload
                          ref={(node) => { rowFileUploadRefs.current[expense.id] = node; }}
                          claimId={`${tempClaimId}/expense-${idx + 1}`}
                          maxFiles={5}
                          maxSizeMB={5}
                        />
                      </div>
                  </div>
                </div>
              );
            })}

            <div className="space-y-2 rounded-lg bg-primary/10 p-4">
              <div className="flex justify-between text-sm">
                <span>Total With Bill</span>
                <span className="font-medium">Rs. {totalWithBill.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Without Bill</span>
                <span className="font-medium">Rs. {totalWithoutBill.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-primary/20 pt-2 text-lg font-bold">
                <span>Grand Total</span>
                <span className="text-primary">Rs. {grandTotal.toFixed(2)}</span>
              </div>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={addRow}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          </div>

          <div className="mb-4 hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-2 text-left text-xs font-semibold">#</th>
                  <th className="p-2 text-left text-xs font-semibold">Category</th>
                  <th className="p-2 text-left text-xs font-semibold">Project Code</th>
                  <th className="p-2 text-left text-xs font-semibold">Date</th>
                  <th className="p-2 text-left text-xs font-semibold">Description</th>
                  <th className="p-2 text-right text-xs font-semibold">With Bill (Rs.)</th>
                  <th className="p-2 text-right text-xs font-semibold">Without Bill (Rs.)</th>
                  <th className="p-2 text-left text-xs font-semibold">Bill Attachments</th>
                  <th className="p-2 text-right text-xs font-semibold">Total (Rs.)</th>
                  <th className="p-2 text-center text-xs font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense, idx) => {
                  const filteredCodes = getFilteredProjectCodes(expense.category);
                  return (
                    <tr key={expense.id} className="border-t border-border transition-colors hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground">{idx + 1}</td>
                      <td className="p-2">
                        <Select value={expense.category} onValueChange={(value) => updateRow(expense.id, 'category', value)}>
                          <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
                          <SelectContent>
                            {dropdown.categories.map((category: string) => (
                              <SelectItem key={category} value={category}>{category}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select
                          value={expense.projectCode}
                          onValueChange={(value) => updateRow(expense.id, 'projectCode', value)}
                          disabled={!site || !expense.category}
                        >
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue placeholder={!site ? 'Site first' : !expense.category ? 'Category first' : 'Code'} />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredCodes.length === 0 ? (
                              <SelectItem value="none" disabled>No matching cost codes</SelectItem>
                            ) : filteredCodes.map((code) => (
                              <SelectItem key={`${code.project}-${code.code}`} value={code.code}>{code.code} - {code.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input type="date" className="h-10 text-sm" value={expense.claimDate} onChange={e => updateRow(expense.id, 'claimDate', e.target.value)} />
                      </td>
                      <td className="p-2">
                        <Input className="h-10 text-sm" value={expense.description} onChange={e => updateRow(expense.id, 'description', e.target.value)} placeholder="Description" />
                      </td>
                      <td className="p-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.]?[0-9]*"
                          className="h-10 text-right text-sm"
                          value={expense.amountWithBill || ''}
                          onChange={e => updateRow(expense.id, 'amountWithBill', parseAmountInput(e.target.value))}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.]?[0-9]*"
                          className="h-10 text-right text-sm"
                          value={expense.amountWithoutBill || ''}
                          onChange={e => updateRow(expense.id, 'amountWithoutBill', parseAmountInput(e.target.value))}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="min-w-[250px] p-2">
                        <div className="space-y-2">
                          {expense.attachmentIds.length > 0 && (
                            <div className="rounded-md border border-border bg-background p-2">
                              <p className="mb-1 text-[11px] font-medium text-muted-foreground">{expense.attachmentIds.length} saved file(s)</p>
                              <AttachmentPreview fileIds={expense.attachmentIds} claimId={editingClaim?.claimId || tempClaimId} compact />
                            </div>
                          )}
                          <FileUpload
                            ref={(node) => { rowFileUploadRefs.current[expense.id] = node; }}
                            claimId={`${tempClaimId}/expense-${idx + 1}`}
                            maxFiles={5}
                            maxSizeMB={5}
                          />
                        </div>
                      </td>
                      <td className="p-2 text-right text-xs font-medium">
                        Rs. {((expense.amountWithBill || 0) + (expense.amountWithoutBill || 0)).toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        {expenses.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={() => removeRow(expense.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/50 font-semibold">
                  <td colSpan={5} className="p-2 text-right text-xs">TOTAL</td>
                  <td className="p-2 text-right text-xs">Rs. {totalWithBill.toFixed(2)}</td>
                  <td className="p-2 text-right text-xs">Rs. {totalWithoutBill.toFixed(2)}</td>
                  <td className="p-2 text-xs text-muted-foreground">Use this column for row bills</td>
                  <td className="p-2 text-right text-xs text-primary">Rs. {grandTotal.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mb-4 rounded-lg border border-border bg-muted/10 p-3 sm:p-4">
            <h3 className="mb-2 text-sm font-semibold">Attachments (Bills / Receipts)</h3>
            {existingFileIds.length > 0 && (
              <div className="mb-3 rounded-md border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Existing attachments kept with this claim</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setExistingFileIds([])}>
                    Clear Existing
                  </Button>
                </div>
                <AttachmentPreview fileIds={existingFileIds} claimId={editingClaim?.claimId || tempClaimId} compact />
              </div>
            )}
            <FileUpload
              ref={fileUploadRef}
              key={fileUploadKey}
              claimId={tempClaimId}
              maxFiles={10}
              maxSizeMB={5}
            />
          </div>

          <Button type="submit" className="w-full gradient-primary text-base text-primary-foreground sm:text-sm" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {loading ? 'Submitting...' : editingClaim ? 'Resubmit Claim' : 'Submit Claim'}
          </Button>
        </form>
      </div>
    </div>
  );
}
