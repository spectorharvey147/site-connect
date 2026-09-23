// SAP import layout follows the supplied TXT files, including both header rows.
export const HEADER_COLUMNS = ['JdtNum', 'ReferenceDate', 'Memo', 'Reference', 'Reference2', 'Reference3', 'TransactionCode', 'ProjectCode', 'TaxDate', 'Indicator', 'DueDate', 'LocationCode', 'U_REMARKS', 'U_Month'];
export const HEADER_ALIASES = ['JDT_NUM', 'RefDate', 'Memo', 'Ref1', 'Ref2', 'Ref3', 'TransCode', 'Project', 'TaxDate', 'Indicator', 'DueDate', 'Location', 'CIG', 'CUP'];
export const DETAIL_COLUMNS = ['ParentKey', 'LineNum', 'Line_ID', 'AccountCode', 'Debit', 'Credit', 'CostingCode'];
export const DETAIL_ALIASES = ['JDT_NUM', 'LineNum', 'Line_ID', 'Account', 'Debit', 'Credit', 'ProfitCode'];
export type SapRow = (string | number)[];
// Normalize saved batches as well as new exports to the confirmed CSV layout.
export function sapImportRows(payload: JournalPayload): { headers: SapRow[]; details: SapRow[] } {
  return {
    headers: payload.headers.map((row, index) => {
      const copy = [...row];
      if (copy.length === 14) copy.push(index === 0 ? 'U_Year' : index === 1 ? 'AdjTran' : '');
      if (index > 1) copy[9] = String(copy[9]).trim();
      return copy;
    }),
    details: payload.details.map((row, index) => index > 1 ? row.map((value, column) => column === 2 ? '' : column === 3 ? String(value).replace(/^'+/, '') : value) : [...row]),
  };
}

export function randomJournalIds(count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 900000) throw new Error('Invalid journal count.');
  const ids = new Set<number>();
  while (ids.size < count) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    if (value < 4294800000) ids.add(100000 + value % 900000);
  }
  return [...ids];
}

export function serializeSapCsv(rows: SapRow[]): string {
  const width = rows[0]?.length;
  if (!width || rows.some(row => row.length !== width)) throw new Error('SAP column count mismatch.');
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = String(value);
    if (text.includes('\0')) throw new Error('SAP fields cannot contain null characters.');
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join(',')).join('\r\n') + '\r\n';
}
export type SapGroup = 'travel' | 'da' | 'other' | 'boarding';
export interface SapLocation { code: string; name: string; costing_code: string }
export interface SapExpenseGroup { code: SapGroup; name: string; gl_code: string; line_number: number }
export interface SapMaster { id: string; type: string; value: string; project?: string; project_code?: string; sap_project_code?: string; sap_location_code?: string; sap_expense_group?: SapGroup; default_manager_email?: string; active: boolean }
export interface SapEmployee { email: string; name: string; role: string; active: boolean; sap_gl_code?: string; sap_location_code?: string }
export interface SapExpense { approved_amount?: number | null; id: string; category: string; project_code: string; customer_name?: string; expense_date: string; amount_with_bill: number; amount_without_bill: number }
export interface SapClaim { claim_id: string; claim_number?: string; site_name: string; customer_name?: string; user_email: string; work_name?: string; verified_amount?: number; grand_total: number; expense_items: SapExpense[] }
export interface SapMasters { locations: SapLocation[]; groups: SapExpenseGroup[]; lists: SapMaster[]; users: SapEmployee[] }
export interface JournalOptions { postingDate: string; dueDate: string; transactionCode: string; allocations?: Record<string, number> }
export interface JournalPayload { version: 1; headers: SapRow[]; details: SapRow[]; claims: { claimId: string; reference: string; employeeName: string; amount: number }[]; journalClaims: string[]; postingDate: string }

export function moneyCents(value: unknown): number {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) throw new Error('Amounts must be valid non-negative numbers.');
  if (Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) throw new Error('Amounts must have at most two decimal places.');
  return Math.round(n * 100);
}
function required(value: unknown, label: string): string {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(`${label} is missing.`);
  if (/[\t\r\n]/.test(s) || s.includes('\0')) throw new Error(`${label} contains a tab or line break. Please correct it before exporting.`);
  return s;
}
function sapDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`Invalid SAP date: ${value}`);
  return value.replace(/-/g, '');
}
function only<T>(rows: T[], label: string): T | undefined {
  if (rows.length > 1) throw new Error(`Multiple mappings found for ${label}. Resolve duplicates before exporting.`);
  return rows[0];
}

export function buildSapJournal(claims: SapClaim[], masters: SapMasters, options: JournalOptions, journalIds?: number[]): JournalPayload {
  if (!claims.length) throw new Error('Select at least one claim.');
  if (new Set(claims.map(c => c.claim_id)).size !== claims.length) throw new Error('Duplicate claims in export.');
  const posting = sapDate(options.postingDate), due = sapDate(options.dueDate);
  const transaction = required(options.transactionCode, 'Transaction code');
  const payload: JournalPayload = { version: 1, headers: [HEADER_COLUMNS, HEADER_ALIASES], details: [DETAIL_COLUMNS, DETAIL_ALIASES], claims: [], journalClaims: [], postingDate: options.postingDate };
  const lists = masters.lists.filter(x => x.active);
  const usedIds = new Set<number>();
  for (const claim of [...claims].sort((a, b) => a.claim_id.localeCompare(b.claim_id))) {
    const ref = required(claim.claim_number || claim.claim_id, 'Claim reference');
    const employee = only(masters.users.filter(u => u.email.toLowerCase() === claim.user_email.toLowerCase()), claim.user_email);
    const employeeGl = required(employee?.sap_gl_code, `${ref}: employee GL`);
    const project = only(lists.filter(x => x.type === 'project' && x.value === claim.site_name), claim.site_name);
    if (!project) throw new Error(`${ref}: project mapping is missing.`);
    const groups = new Map<string, { project: string; customer: string; date: string; location: SapLocation; amounts: Map<SapGroup, number> }>();
    let claimCents = 0;
    for (const item of [...claim.expense_items].sort((a, b) => a.id.localeCompare(b.id))) {
      const submittedCents = moneyCents(item.amount_with_bill) + moneyCents(item.amount_without_bill);
      if (item.approved_amount != null && options.allocations?.[item.id] != null && moneyCents(options.allocations[item.id]) !== moneyCents(item.approved_amount)) throw new Error(`${ref}: SAP allocation must match the approved expense row amount.`);
      const amount = options.allocations?.[item.id] == null ? (item.approved_amount == null ? submittedCents : moneyCents(item.approved_amount)) : moneyCents(options.allocations[item.id]);
      if (!amount) continue;
      const category = only(lists.filter(x => x.type === 'category' && x.value === item.category), item.category);
      const expenseGroup = masters.groups.find(g => g.code === category?.sap_expense_group);
      if (!expenseGroup) throw new Error(`${ref}: map expense category "${item.category}" to a SAP expense group.`);
      required(expenseGroup.gl_code, `${item.category} GL`);
      const matchingCodes = lists.filter(x => x.type === 'projectcode' && x.project_code === item.project_code);
      const code = only(matchingCodes.filter(x => x.project === claim.site_name), item.project_code)
        || only(matchingCodes.filter(x => !x.project), item.project_code);
      if (!code) throw new Error(`${ref}: project cost code ${item.project_code} is not mapped.`);
      const sapProject = required(project.sap_project_code || code.sap_project_code || code.project_code, `${ref}: SAP project code`);
      // A project's configured location takes precedence over the employee default.
      const locationCode = project.sap_location_code || employee?.sap_location_code;
      const location = masters.locations.find(l => l.code === locationCode);
      if (!location) throw new Error(`${ref}: project or employee location is missing.`);
      required(location.costing_code, `${ref}: distribution rule`);
      const customer = required(item.customer_name || claim.customer_name, `${ref}: customer`);
      const date = sapDate(item.expense_date);
      // Keep distinct internal projects separate even when they share one SAP code.
      const key = JSON.stringify([item.project_code, sapProject, customer, date, location.code]);
      let group = groups.get(key);
      if (!group) { group = { project: sapProject, customer, date, location, amounts: new Map() }; groups.set(key, group); }
      group.amounts.set(expenseGroup.code, (group.amounts.get(expenseGroup.code) || 0) + amount);
      claimCents += amount;
    }
    const approved = moneyCents(claim.verified_amount ?? claim.grand_total);
    if (!approved || claimCents !== approved) throw new Error(`${ref}: expense allocation ${(claimCents / 100).toFixed(2)} must equal approved amount ${(approved / 100).toFixed(2)}. Review the expense amounts before export.`);
    payload.claims.push({ claimId: claim.claim_id, reference: ref, employeeName: employee?.name || claim.user_email, amount: approved / 100 });
    let part = 0;
    for (const group of groups.values()) {
      const index = payload.journalClaims.length;
      const id = journalIds ? journalIds[index] : index + 1;
      if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) throw new Error('Invalid or duplicate journal ID.');
      usedIds.add(id);
      const work = String(claim.work_name || 'Claim expenses');
      const subRef = `${ref}/${String(++part).padStart(3, '0')}`;
      payload.headers.push([id, posting, group.customer, ref, subRef, work, transaction, group.project, group.date, ' ', due, group.location.code, `${work} ${group.customer}`, '']);
      let total = 0;
      for (const mapping of [...masters.groups].sort((a, b) => a.line_number - b.line_number)) {
        const cents = group.amounts.get(mapping.code) || 0;
        if (!cents) continue;
        payload.details.push([id, mapping.line_number, mapping.line_number, mapping.gl_code, (cents / 100).toFixed(2), '', group.location.costing_code]);
        total += cents;
      }
      payload.details.push([id, 5, 5, employeeGl, '', (total / 100).toFixed(2), group.location.costing_code]);
      payload.journalClaims.push(claim.claim_id);
    }
  }
  if (journalIds && journalIds.length !== payload.journalClaims.length) throw new Error('Journal ID count does not match export.');
  // Also validates text fields that are assembled above.
  serializeSapTxt(payload.headers); serializeSapTxt(payload.details);
  return payload;
}

export function serializeSapTxt(rows: SapRow[]): string {
  const width = rows[0]?.length;
  if (!width || rows.some(row => row.length !== width)) throw new Error('SAP column count mismatch.');
  return rows.map(row => row.map(value => {
    const text = String(value);
    if (/[\t\r\n]/.test(text) || text.includes('\0')) throw new Error('SAP fields cannot contain tabs or line breaks.');
    return text;
  }).join('\t')).join('\r\n') + '\r\n';
}
