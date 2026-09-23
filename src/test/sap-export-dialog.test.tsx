import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SapJournalExportDialog from '../components/views/SapJournalExportDialog';
import { generateJournalExport } from '../lib/accounting-api';

vi.mock('@/lib/accounting-api', () => ({
  getJournalExportClaims: vi.fn(async () => [{ claim_id:'C1',claim_number:'CLM-1',site_name:'AMC',user_email:'employee@test',customer_name:'Customer',verified_amount:150,grand_total:200,expense_items:[{ id:'e1',category:'Travel',project_code:'P1',expense_date:'2026-09-19',amount_with_bill:200,amount_without_bill:0 }] }]),
  getAccountingMasters: vi.fn(async () => ({ locations:[{code:'3',name:'Chennai',costing_code:'Chennai'}],groups:[{code:'travel',name:'Travel',gl_code:'4330900007',line_number:1}],users:[{email:'employee@test',name:'Employee',sap_gl_code:'123'}],lists:[{id:'p',type:'project',value:'AMC',sap_location_code:'3',active:true},{id:'pc',type:'projectcode',project:'AMC',value:'P1',project_code:'P1',active:true},{id:'cat',type:'category',value:'Travel',sap_expense_group:'travel',active:true}] })),
  generateJournalExport: vi.fn(async () => ({ batchId:'TEST-BATCH',payload:{version:1} })),
  downloadJournalFile: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(),error: vi.fn() } }));

describe('SAP export review', () => {
  it('blocks an unallocated approval reduction, then saves once and exposes all three downloads', async () => {
    const onComplete=vi.fn(async()=>{});
    render(<SapJournalExportDialog claimIds={['C1']} onClose={()=>{}} onComplete={onComplete} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('must equal approved amount');
    const generate=screen.getByRole('button',{name:'Generate Excel & CSV files'});
    expect(generate).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'150'}});
    await waitFor(()=>expect(generate).toBeEnabled());
    fireEvent.click(generate);
    await screen.findByRole('button',{name:'Download Excel'});
    expect(screen.getByRole('button',{name:'Claim header.csv'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Claim details.csv'})).toBeInTheDocument();
    expect(generateJournalExport).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateJournalExport).mock.calls[0][2].allocations).toEqual({e1:150});
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
