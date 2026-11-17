import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { HEADER_COLUMNS, HEADER_ALIASES, DETAIL_COLUMNS, DETAIL_ALIASES, serializeSapTxt, sapImportRows, type JournalPayload } from '../lib/sap-journal';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { journalWorkbook, nextSapBatchId, journalAbstractRows } from '../lib/accounting-api';

describe('Excel and TXT parity', () => {
  it('summarizes vendor and GST debit lines without changing the SAP import columns', () => {
    const payload: JournalPayload = { version:1,postingDate:'2026-09-20',claims:[{claimId:'C1',reference:'CLM-1',employeeName:'Engineer',amount:118}],journalClaims:['C1'],
      headers:[HEADER_COLUMNS,HEADER_ALIASES,[1,'20260920','Customer','CLM-1','CLM-1/001','Maintenance','IPI','P1','20260919',' ','20260920','2','Remarks','']],
      details:[DETAIL_COLUMNS,DETAIL_ALIASES,[1,6,6,'VEND-1','100.00','','Cost'],[1,7,7,'GST-C','9.00','','Cost'],[1,8,8,'GST-S','9.00','','Cost'],[1,9,9,'EMP-1','','118.00','Cost']],
    };
    const abstract=journalAbstractRows(payload);
    expect(abstract[0].slice(11,14)).toEqual(['Vendor GL','Input GST','Grand Total']);
    expect(abstract[1].slice(11,14)).toEqual([100,18,118]);
    expect(payload.headers[0]).toEqual(HEADER_COLUMNS);
    expect(payload.details[0]).toEqual(DETAIL_COLUMNS);
  });
  it('keeps identical rows, blank trailing fields, Unicode and text account codes in both formats', async () => {
    const payload: JournalPayload = { version: 1, postingDate: '2026-09-20', claims: [{ claimId:'C1',reference:'CLM-1',employeeName:'Engineer',amount:12.3 }],journalClaims:['C1'],
      headers: [HEADER_COLUMNS,HEADER_ALIASES,[99,'20260920','Customer’s site','CLM-1','CLM-1/001','Maintenance','IPI','8020-Service','20260919',' ','20260920','2','Maintenance Customer’s site','']],
      details: [DETAIL_COLUMNS,DETAIL_ALIASES,[99,1,1,'4330900007','12.30','','Bangalor'],[99,5,5,'001234','','12.30','Bangalor']],
    };
    const abstract = journalAbstractRows(payload);
    expect(abstract[1]).toEqual(['8020-Service','Engineer','Customer’s site','20260920','20260919','CLM-1','Maintenance',0,0,0,12.3,0,0,12.3,'Maintenance Customer’s site']);
    expect(abstract.at(-1)?.slice(7,14)).toEqual([0,0,0,12.3,0,0,12.3]);
    const blob = await journalWorkbook(payload);
    const bytes = await new Promise<ArrayBuffer>((resolve,reject) => { const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=reject;reader.readAsArrayBuffer(blob); });
    const book = XLSX.read(bytes,{type:'array'});
    expect(book.SheetNames).toEqual(['Main Abstract','OJDT - JournalEntries','JDT1']);
    const normalized = sapImportRows(payload);
    for(const [name,expected] of [['OJDT - JournalEntries',normalized.headers],['JDT1',normalized.details]] as const) {
      const rows = XLSX.utils.sheet_to_json<(string|number)[]>(book.Sheets[name],{header:1,defval:'',raw:true});
      expect(rows).toEqual(expected);
      expect(serializeSapTxt(rows)).toBe(serializeSapTxt(expected));
    }
    expect(book.Sheets.JDT1.D4.t).toBe('s');
    expect(book.Sheets.JDT1.D4.v).toBe('001234');
  });
});

 describe('Daily SAP batch numbers', () => {
  it('continues the daily sequence and ignores UUID identifiers and other dates', () => {
    expect(nextSapBatchId('2026-09-10', [])).toBe('SAP-20260910-001');
    expect(nextSapBatchId('2026-09-10', ['SAP-20260910-001', 'SAP-20260910-009', 'SAP-20260911-100', 'SAP-20260910-08ec11fd-da2e'])).toBe('SAP-20260910-010');
    expect(nextSapBatchId('2026-09-10', ['SAP-20260910-999'])).toBe('SAP-20260910-1000');
  });
});
