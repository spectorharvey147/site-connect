import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { randomJournalIds, sapImportRows, serializeSapCsv, HEADER_COLUMNS, HEADER_ALIASES, DETAIL_COLUMNS, DETAIL_ALIASES, type JournalPayload } from '../lib/sap-journal';

describe('SAP CSV import files', () => {
  it('matches the successful sample columns and preserves links, blanks and quoted Unicode', () => {
    const payload: JournalPayload = {
      version: 1, postingDate: '2026-09-20', claims: [], journalClaims: ['C1'],
      headers: [HEADER_COLUMNS, HEADER_ALIASES, [123456, '20260920', 'Customer, "Chennai" – site', 'CLM-0472', 'CLM-0472/001', 'Claim expenses', 'IPI', '2107-F-Emgee-Cons-Se', '20260916', ' ', '20260920', '3', 'Claim expenses', '']],
      details: [DETAIL_COLUMNS, DETAIL_ALIASES, [123456, 1, 1, '04330900007', '772.00', '', 'Chennai'], [123456, 5, 5, '1241100010', '', '772.00', 'Chennai']],
    };
    const rows = sapImportRows(payload);
    expect(rows.headers[0].join(',')).toBe('JdtNum,ReferenceDate,Memo,Reference,Reference2,Reference3,TransactionCode,ProjectCode,TaxDate,Indicator,DueDate,LocationCode,U_REMARKS,U_Month,U_Year');
    expect(rows.headers[1].join(',')).toBe('JDT_NUM,RefDate,Memo,Ref1,Ref2,Ref3,TransCode,Project,TaxDate,Indicator,DueDate,Location,CIG,CUP,AdjTran');
    expect(rows.headers[2][9]).toBe('');
    expect(rows.details.slice(2).every(row => row[0] === rows.headers[2][0] && row[2] === '')).toBe(true);
    for (const table of [rows.headers, rows.details]) {
      const csv = serializeSapCsv(table);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv.endsWith('\r\n')).toBe(true);
      const book = XLSX.read(csv.slice(1), { type: 'string', raw: true });
      expect(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' })).toEqual(table.map(row => row.map(String)));
    }
    expect(payload.details[2][2]).toBe(1);
    expect(sapImportRows({ ...payload, ...rows })).toEqual(rows);
  });
  it('generates unique six-digit references for every journal in a batch', () => {
    const ids = randomJournalIds(10000);
    expect(new Set(ids).size).toBe(10000);
    expect(ids.every(id => Number.isInteger(id) && id >= 100000 && id <= 999999)).toBe(true);
    expect(() => randomJournalIds(900001)).toThrow('Invalid journal count');
  });
});
