import { supabase } from '@/integrations/supabase/client';
import { buildSapJournal, serializeSapCsv, sapImportRows, type JournalOptions, type JournalPayload, type SapClaim, type SapMasters } from './sap-journal';

// New tables/functions are introduced by 20260920154750_work_allocation_and_sap_journals.sql.
const db = supabase;
const token = () => localStorage.getItem('claimsToken') || '';
export interface ProjectWork { id: string; project_id: string; name: string; manager_email: string | null; active: boolean }

export async function getAccountingMasters(): Promise<SapMasters> {
  const results = await Promise.all([
    db.from('sap_locations').select('*').order('code'),
    db.from('sap_expense_groups').select('*').order('line_number'),
    db.from('app_lists').select('id,type,value,project,project_code,sap_project_code,sap_location_code,sap_expense_group,default_manager_email,active').order('value'),
    db.from('users').select('email,name,role,active,sap_gl_code,sap_location_code').order('name'),
  ]);
  for (const result of results) if (result.error) throw new Error(`Accounting setup could not be loaded: ${result.error.message}`);
  return { locations: results[0].data, groups: results[1].data, lists: results[2].data, users: results[3].data };
}

export async function getProjectWorks(): Promise<ProjectWork[]> {
  const { data, error } = await db.from('project_works').select('*').order('name');
  if (error) throw new Error(`Work allocation could not be loaded: ${error.message}`);
  return data;
}

export async function saveAccountingMaster(kind: string, id: string, values: Record<string, unknown>) {
  const { error } = await db.rpc('save_accounting_master', { p_token: token(), p_kind: kind, p_id: id, p_values: values });
  if (error) throw new Error(error.message);
}

export async function resolveClaimWork(site: string, workId?: string) {
  if (!workId) throw new Error('Select a work activity before submitting.');
  const { data: work, error } = await db.from('project_works').select('*').eq('id', workId).eq('active', true).single();
  if (error || !work) throw new Error('The selected work is no longer active. Select another work.');
  const { data: project, error: projectError } = await db.from('app_lists').select('value,default_manager_email').eq('id', work.project_id).eq('type', 'project').eq('active', true).single();
  if (projectError || project?.value !== site) throw new Error('The selected work does not belong to this project.');
  const managerEmail = work.manager_email || project.default_manager_email;
  if (!managerEmail) return { workId: work.id as string, workName: work.name as string, managerEmail: '', managerName: '', managerRole: '' };
  const { data: manager, error: managerError } = await db.from('users').select('email,name,role').eq('email', managerEmail).eq('active', true).single();
  if (managerError || !manager || !['Manager', 'Super Admin'].includes(manager.role)) throw new Error('This work has an inactive manager. Ask Admin to update Work Allocation.');
  return { workId: work.id as string, workName: work.name as string, managerEmail: manager.email as string, managerName: manager.name as string, managerRole: manager.role as string };
}

export async function getJournalExportClaims(ids: string[]): Promise<SapClaim[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error('Select at least one claim.');
  const { data, error } = await db.from('claims').select('*,expense_items(*)').in('claim_id', unique).order('claim_id');
  if (error) throw new Error(error.message);
  if (data.length !== unique.length || data.some((c: { status: string; sap_exported: boolean }) => c.status !== 'Accounts Verified' || c.sap_exported)) throw new Error('Some selected claims are no longer available for export. Refresh the list.');
  return data;
}

export async function generateJournalExport(claims: SapClaim[], masters: SapMasters, options: JournalOptions) {
  // Run full validation before reserving identifiers or changing any claim state.
  const preview = buildSapJournal(claims, masters, options);
  const { data: ids, error: idError } = await db.rpc('reserve_sap_journal_ids', { p_token: token(), p_count: preview.journalClaims.length });
  if (idError) throw new Error(idError.message);
  if (!Array.isArray(ids) || ids.length !== preview.journalClaims.length || ids.some(id => !Number.isInteger(Number(id)) || Number(id) < 100000 || Number(id) > 999999)) throw new Error('Apply the six-digit SAP journal sequence database update before exporting.');
  const payload = buildSapJournal(claims, masters, options, ids.map(Number));
  // Verify workbook serialization before committing the batch.
  await journalWorkbook(payload);
  const prefix = `SAP-${options.postingDate.replace(/-/g, '')}-`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from('sap_export_batches').select('batch_id').like('batch_id', `${prefix}%`).order('batch_id').range(offset, offset + 999);
      if (error) throw new Error(error.message);
      existing.push(...data.map(row => row.batch_id));
      if (data.length < 1000) break;
    }
    const batchId = nextSapBatchId(options.postingDate, existing);
    const { error } = await db.rpc('commit_sap_journal_export', { p_token: token(), p_batch_id: batchId, p_payload: payload });
    if (!error) return { batchId, payload };
    // The database's unique batch ID constraint arbitrates concurrent exports.
    if (error.code !== '23505' || !error.message.includes('batch_id')) throw new Error(error.message);
  }
  throw new Error('Another export is being generated. Please try again.');
}

export function nextSapBatchId(postingDate: string, existing: string[]): string {
  const prefix = `SAP-${postingDate.replace(/-/g, '')}-`;
  const maximum = existing.reduce((max, id) => {
    const suffix = id.startsWith(prefix) ? id.slice(prefix.length) : '';
    return /^\d{3,}$/.test(suffix) && Number.isSafeInteger(Number(suffix)) ? Math.max(max, Number(suffix)) : max;
  }, 0);
  return `${prefix}${String(maximum + 1).padStart(3, '0')}`;
}

export async function journalWorkbook(payload: JournalPayload): Promise<Blob> {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  const importRows = sapImportRows(payload);
  const abstract = XLSX.utils.aoa_to_sheet(journalAbstractRows(payload));
  abstract['!cols'] = [28, 25, 40, 16, 16, 20, 25, 24, 22, 20, 34, 20, 48].map(wch => ({ wch }));
  for (let row = 1; row <= payload.journalClaims.length + 1; row++) {
    for (let col = 7; col <= 11; col++) {
      const cell = abstract[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell) cell.z = '#,##0.00';
    }
  }
  XLSX.utils.book_append_sheet(book, abstract, 'Main Abstract');
  for (const [name, rows] of [['OJDT - JournalEntries', importRows.headers], ['JDT1', importRows.details]] as const) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = rows[0].map((_, index) => ({ wch: Math.min(55, Math.max(14, ...rows.slice(0, 30).map(row => String(row[index]).length + 2))) }));
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return new Blob([XLSX.write(book, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function journalAbstractRows(payload: JournalPayload) {
  const rows: (string | number)[][] = [['Project code', 'Employee Name', 'CustName', 'PostingDate', 'Visit Dt', 'ID', 'Service Type', 'BOARDING(ROOM RENT)', 'OTHER EXPENSES', 'PERDIEM (DA)', 'TRAVEL EXPENSE- BUS,TRAIN,BIKE', 'Grand Total', 'Remarks']];
  for (const [index, header] of payload.headers.slice(2).entries()) {
    const claim = payload.claims.find(claim => claim.claimId === payload.journalClaims[index]);
    const details = payload.details.slice(2).filter(row => row[0] === header[0]);
    const amount = (line: number) => details.filter(row => Number(row[1]) === line).reduce((sum, row) => sum + Math.round(Number(row[4] || 0) * 100), 0) / 100;
    const total = details.reduce((sum, row) => sum + Math.round(Number(row[4] || 0) * 100), 0) / 100;
    rows.push([header[7], claim?.employeeName || '', header[2], header[1], header[8], header[3], header[5], amount(4), amount(3), amount(2), amount(1), total, header[12]]);
  }
  rows.push(['Grand Total', '', '', '', '', '', '', ...[7, 8, 9, 10, 11].map(column => rows.slice(1).reduce((sum, row) => sum + Math.round(Number(row[column]) * 100), 0) / 100), '']);
  return rows;
}

export async function downloadJournalFile(report: { batch_id: string; export_payload: JournalPayload }, kind: 'excel' | 'header' | 'details') {
  const payload = report.export_payload;
  if (!payload || payload.version !== 1) throw new Error('This batch has no journal files.');
  const importRows = sapImportRows(payload);
  const blob = kind === 'excel' ? await journalWorkbook(payload)
    : new Blob([serializeSapCsv(kind === 'header' ? importRows.headers : importRows.details)], { type: 'text/csv;charset=utf-8' });
  const name = kind === 'excel' ? `${report.batch_id}.xlsx` : kind === 'header' ? 'Claim header.csv' : 'Claim details.csv';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
