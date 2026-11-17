import { describe, expect, it } from 'vitest';
import { buildSapJournal, serializeSapTxt, sapImportRows, HEADER_COLUMNS, HEADER_ALIASES, DETAIL_COLUMNS, DETAIL_ALIASES, moneyCents, type SapClaim, type SapMasters, type JournalOptions } from '../lib/sap-journal';

function fixture() {
  const masters: SapMasters = {
    locations: [{ code: '2', name: 'Bangalore', costing_code: 'Bangalor' }, { code: '3', name: 'Chennai', costing_code: 'Chennai' }],
    groups: [
      { code: 'travel', name: 'Travel', gl_code: '4330900007', line_number: 1 },
      { code: 'da', name: 'DA', gl_code: '4310000007', line_number: 2 },
      { code: 'other', name: 'Other', gl_code: '4332000016', line_number: 3 },
      { code: 'boarding', name: 'Boarding', gl_code: '4330900001', line_number: 4 },
    ],
    lists: [
      { id: 'project', type: 'project', value: 'AMC', sap_project_code: '8020-Service', sap_location_code: '2', active: true },
      ...['P1','P2'].map(code => ({ id: code,type: 'projectcode',value: code,project_code: code,project: 'AMC',active: true })),
      ...(['travel','da','other','boarding'] as const).map(code => ({ id: code,type: 'category',value: code,sap_expense_group: code,active: true })),
    ],
    users: [{ email: 'engineer@example.test',name: 'Engineer',role: 'User',active: true,sap_gl_code: '001214422433',sap_location_code: '3' }],
    vendors: [{ id:'v-1',vendor_name:'Example Supplier',short_form:'ES',vendor_account_code:'VEND-100',active:true }],
  };
  const claim: SapClaim = { claim_id: 'C-1',claim_number: 'CLM-0001',site_name: 'AMC',user_email: 'engineer@example.test',customer_name: 'Customer',work_name: 'Maintenance',grand_total: 200,expense_items: [
    { id: 'e1',category: 'travel',project_code: 'P1',expense_date: '2026-09-19',amount_with_bill: 100,amount_without_bill: 0 },
    { id: 'e2',category: 'da',project_code: 'P1',expense_date: '2026-09-19',amount_with_bill: 0,amount_without_bill: 100 },
  ] };
  const options: JournalOptions = { postingDate: '2026-09-20',dueDate: '2026-09-20',transactionCode: 'IPI' };
  return { masters,claim,options };
}

describe('SAP journal export', () => {
  it('exports historical claims after their project, cost codes and categories become inactive', () => {
    const { masters, claim, options } = fixture();
    const before = buildSapJournal([claim], masters, options, [100001]);
    masters.lists.forEach(row => { row.active = false; });
    expect(buildSapJournal([claim], masters, options, [100001])).toEqual(before);
  });

  it('matches both TXT layouts, confirmed travel GL, account identifiers and project location', () => {
    const { masters,claim,options } = fixture();
    const out = buildSapJournal([claim],masters,options,[5341]);
    expect(out.headers.slice(0,2)).toEqual([HEADER_COLUMNS,HEADER_ALIASES]);
    expect(out.details.slice(0,2)).toEqual([
      ['ParentKey','LineNum','Line_ID','AccountCode','Debit','Credit','CostingCode'],
      ['JDT_NUM','LineNum','Line_ID','Account','Debit','Credit','ProfitCode'],
    ]);
    expect(out.headers[2]).toEqual([5341,'20260920','Customer','CLM-0001','CLM-0001/001','Maintenance','IPI','8020-Service','20260919',' ','20260920','2','Maintenance Customer','']);
    expect(out.details.slice(2)).toEqual([
      [5341,1,1,'4330900007','100','','Bangalor'],
      [5341,2,2,'4310000007','100','','Bangalor'],
      [5341,5,5,'001214422433','','200','Bangalor'],
    ]);
    const text = serializeSapTxt(out.headers);
    expect(text.endsWith('\t\r\n')).toBe(true);
    expect(text.split('\r\n').slice(0,-1).every(row => row.split('\t').length===14)).toBe(true);
    expect(serializeSapTxt(out.details).split('\r\n').slice(0,-1).every(row => row.split('\t').length===7)).toBe(true);
    const imported = sapImportRows(out);
    expect(imported.headers[0]).toEqual(['JdtNum','ReferenceDate','Memo','Reference','Reference2','Reference3','TransactionCode','ProjectCode','TaxDate','Indicator','DueDate','LocationCode','U_REMARKS','U_Month','U_Year']);
    expect(imported.details[0]).toEqual(['ParentKey','LineNum','Line_ID','AccountCode','ShortName','Debit','Credit','CostingCode']);
    expect(imported.details.slice(2)).toEqual([
      [5341,1,'','4330900007','','100','','Bangalor'],
      [5341,2,'','4310000007','','100','','Bangalor'],
      [5341,5,'','001214422433','','','200','Bangalor'],
    ]);
    expect(serializeSapTxt(imported.details).split('\r\n').slice(0,-1).every(row => row.split('\t').length===8)).toBe(true);
  });
  it('splits internal projects even if they share a SAP code and balances each journal', () => {
    const { masters,claim,options } = fixture(); claim.expense_items[1].project_code='P2';
    const out = buildSapJournal([claim],masters,options,[10,11]);
    expect(out.journalClaims).toEqual(['C-1','C-1']);
    expect(out.headers.slice(2).map(h=>h[3])).toEqual(['CLM-0001','CLM-0001']);
    expect(out.headers.slice(2).map(h=>h[4])).toEqual(['CLM-0001/001','CLM-0001/002']);
    for (const id of [10,11]) {
      const rows=out.details.slice(2).filter(r=>r[0]===id);
      expect(rows.reduce((n,r)=>n+Number(r[4] || 0)-Number(r[5] || 0),0)).toBe(0);
    }
  });
  it.each(['customer','date'])('splits differing %s values instead of taking the first expense', key => {
    const { masters,claim,options } = fixture();
    if(key==='customer') claim.expense_items[1].customer_name='Second customer'; else claim.expense_items[1].expense_date='2026-09-18';
    expect(buildSapJournal([claim],masters,options).journalClaims.length).toBe(2);
  });
  it('uses the exact project SAP code ahead of cost-code overrides', () => {
    const { masters,claim,options }=fixture();
    masters.lists.find(x=>x.id==='P1')!.sap_project_code='OLD-OVERRIDE';
    masters.lists[0].sap_project_code='2107-F-Emgee-Cons-Se';
    expect(buildSapJournal([claim],masters,options,[123456]).headers[2][7]).toBe('2107-F-Emgee-Cons-Se');
    const out = buildSapJournal([claim],masters,options,[123456]);
    expect(out.details.slice(2).every(row=>row[0]===out.headers[2][0])).toBe(true);
  });
  it('uses employee location only when the project has no location', () => {
    const { masters,claim,options }=fixture(); masters.lists[0].sap_location_code='';
    expect(buildSapJournal([claim],masters,options).headers[2][11]).toBe('3');
  });
  it('requires an explicit allocation when approval changes the total', () => {
    const { masters,claim,options }=fixture(); claim.verified_amount=150;
    expect(()=>buildSapJournal([claim],masters,options)).toThrow('must equal approved amount');
    options.allocations={ e1: 50, e2: 100 };
    const out=buildSapJournal([claim],masters,options);
    expect(out.details.at(-1)?.[5]).toBe('150');
    expect(claim.expense_items[0].amount_with_bill).toBe(100);
  });
  it('exports approved row amounts instead of submitted amounts, including zero', () => {
    const { masters,claim,options }=fixture();
    claim.verified_amount=75;
    claim.expense_items[0].approved_amount=75;
    claim.expense_items[1].approved_amount=0;
    const out=buildSapJournal([claim],masters,options,[100000]);
    expect(out.details.slice(2).map(row=>[row[4],row[5]])).toEqual([['75',''],['','75']]);
    expect(out.claims[0].amount).toBe(75);
    options.allocations={e1:50,e2:25};
    expect(()=>buildSapJournal([claim],masters,options)).toThrow('must match the approved expense row');
  });
  it('handles decimal amounts without floating point balance errors', () => {
    const { masters,claim,options }=fixture(); claim.grand_total=.3; claim.expense_items[0].amount_with_bill=.1;claim.expense_items[1].amount_without_bill=.2;
    expect(buildSapJournal([claim],masters,options).details.at(-1)?.[5]).toBe('0.30');
  });
  it('debits a vendor GL for the complete vendor-available tax invoice and keeps employee GL as credit', () => {
    const { masters,claim,options }=fixture();
    claim.expense_items=[{ id:'vendor-row',category:'travel',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:118,amount_without_bill:0,has_tax_invoice:true,vendor_available:true,vendor_id:'v-1',vendor_account_code_snapshot:'VEND-100',vendor_short_form_snapshot:'ES' }];
    claim.grand_total=118;
    const rows=buildSapJournal([claim],masters,options,[100001]).details.slice(2);
    expect(rows).toEqual([[100001,6,6,'VEND-100','118','','Bangalor'],[100001,7,7,'001214422433','','118','Bangalor']]);
    expect(sapImportRows(buildSapJournal([claim],masters,options,[100001])).details.slice(2)).toEqual([[100001,6,'','VEND-100','ES','118','','Bangalor'],[100001,7,'','001214422433','','','118','Bangalor']]);
  });
  it('debits taxable value and configured CGST and SGST GLs when the vendor is unavailable', () => {
    const { masters,claim,options }=fixture();
    masters.gst_accounts=[{id:'g1',gst_type:'CGST',gl_code:'GST-C',active:true},{id:'g2',gst_type:'SGST',gl_code:'GST-S',active:true}];
    claim.expense_items=[{ id:'gst-row',category:'other',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:118,amount_without_bill:0,has_tax_invoice:true,vendor_available:false,taxable_amount:100,cgst_amount:9,sgst_amount:9,igst_amount:0 }];
    claim.grand_total=118;
    expect(buildSapJournal([claim],masters,options,[100002]).details.slice(2)).toEqual([
      [100002,3,3,'4332000016','100','','Bangalor'],[100002,7,7,'GST-C','9','','Bangalor'],[100002,8,8,'GST-S','9','','Bangalor'],[100002,9,9,'001214422433','','118','Bangalor'],
    ]);
  });
  it('debits taxable value and configured IGST GL when the vendor is unavailable', () => {
    const { masters,claim,options }=fixture();
    masters.gst_accounts=[{id:'g3',gst_type:'IGST',gl_code:'GST-I',active:true}];
    claim.expense_items=[{ id:'igst-row',category:'other',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:118,amount_without_bill:0,has_tax_invoice:true,vendor_available:false,taxable_amount:100,cgst_amount:0,sgst_amount:0,igst_amount:18 }];
    claim.grand_total=118;
    expect(buildSapJournal([claim],masters,options,[100003]).details.slice(2)).toEqual([
      [100003,3,3,'4332000016','100','','Bangalor'],[100003,9,9,'GST-I','18','','Bangalor'],[100003,10,10,'001214422433','','118','Bangalor'],
    ]);
  });
  it('rejects unbalanced invoice tax, missing vendor details and missing GST configuration', () => {
    const { masters,claim,options }=fixture();
    claim.expense_items=[{ id:'tax',category:'travel',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:118,amount_without_bill:0,has_tax_invoice:true,vendor_available:false,taxable_amount:100,cgst_amount:9,sgst_amount:8,igst_amount:0 }]; claim.grand_total=118;
    expect(()=>buildSapJournal([claim],masters,options)).toThrow('must equal the approved expense row amount');
    claim.expense_items[0]={...claim.expense_items[0],vendor_available:true};
    expect(()=>buildSapJournal([claim],masters,options)).toThrow('vendor SAP account code');
    claim.expense_items[0]={...claim.expense_items[0],vendor_available:false,cgst_amount:18,sgst_amount:0};
    expect(()=>buildSapJournal([claim],masters,options)).toThrow('Input CGST GL');
  });
  it('rejects an inactive vendor even if its old account snapshot is present', () => {
    const { masters,claim,options }=fixture();
    masters.vendors![0].active=false;
    claim.expense_items=[{ id:'vendor-row',category:'travel',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:118,amount_without_bill:0,has_tax_invoice:true,vendor_available:true,vendor_id:'v-1',vendor_account_code_snapshot:'VEND-100' }]; claim.grand_total=118;
    expect(()=>buildSapJournal([claim],masters,options)).toThrow('inactive or missing');
  });
  it('balances normal, multiple vendor and IGST rows together in one claim journal', () => {
    const { masters,claim,options }=fixture();
    masters.vendors!.push({ id:'v-2',vendor_name:'Second Supplier',short_form:'SS',vendor_account_code:'VEND-200',active:true });
    masters.gst_accounts=[{id:'g3',gst_type:'IGST',gl_code:'GST-I',active:true}];
    claim.expense_items=[
      { id:'a-normal',category:'travel',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:10,amount_without_bill:0 },
      { id:'b-vendor-1',category:'travel',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:118,amount_without_bill:0,has_tax_invoice:true,vendor_available:true,vendor_id:'v-1',vendor_account_code_snapshot:'VEND-100' },
      { id:'c-vendor-2',category:'other',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:118,amount_without_bill:0,has_tax_invoice:true,vendor_available:false,taxable_amount:100,cgst_amount:0,sgst_amount:0,igst_amount:18 },
    ];
    claim.grand_total=246;
    const rows=buildSapJournal([claim],masters,options,[100004]).details.slice(2);
    expect(rows.filter(row=>row[4]).map(row=>[row[3],row[4]])).toEqual([
      ['4330900007','10'],['4332000016','100'],['VEND-100','118'],['GST-I','18'],
    ]);
    expect(rows.filter(row=>row[5]).map(row=>[row[3],row[5]])).toEqual([['001214422433','246']]);
    expect(rows.reduce((sum,row)=>sum+Number(row[4]||0)-Number(row[5]||0),0)).toBe(0);
  });
  it.each(['gl','category','location','project','customer'])('blocks a missing %s mapping', key => {
    const { masters,claim,options }=fixture();
    if(key==='gl') masters.users[0].sap_gl_code='';
    if(key==='category') masters.lists.find(x=>x.id==='travel')!.sap_expense_group=undefined;
    if(key==='location') { masters.lists[0].sap_location_code=''; masters.users[0].sap_location_code=''; }
    if(key==='project') claim.expense_items[0].project_code='unknown';
    if(key==='customer') claim.customer_name='';
    expect(()=>buildSapJournal([claim],masters,options)).toThrow();
  });
  it('rejects ambiguous category mappings instead of silently selecting a GL', () => {
    const { masters,claim,options }=fixture(); masters.lists.push({ ...masters.lists.find(x=>x.id==='travel')!,id:'duplicate' });
    expect(()=>buildSapJournal([claim],masters,options)).toThrow('Multiple mappings');
  });
  it('rejects duplicate journals and embedded TXT delimiters', () => {
    const { masters,claim,options }=fixture();claim.expense_items[1].project_code='P2';
    expect(()=>buildSapJournal([claim],masters,options,[1,1])).toThrow('duplicate journal');
    claim.customer_name='Bad\tcustomer';
    expect(()=>buildSapJournal([claim],masters,options)).toThrow('tab or line break');
  });
  it('preserves non-ASCII customer names', () => {
    const { masters,claim,options }=fixture();claim.customer_name='Fisherman’s Cove – Chennai';
    expect(serializeSapTxt(buildSapJournal([claim],masters,options).headers)).toContain(claim.customer_name);
  });
  it.each([-1,NaN,Infinity,0.001,'',null])('rejects invalid money %s', value => { expect(()=>moneyCents(value)).toThrow(); });
  it('rejects invalid calendar dates', () => { const { masters,claim,options }=fixture(); options.postingDate='2026-02-30'; expect(()=>buildSapJournal([claim],masters,options)).toThrow('Invalid SAP date'); });
});
