import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SettingsView from '@/components/views/SettingsView';
import { updateAppListItem } from '@/lib/claims-api';
vi.mock('@/lib/claims-api', () => ({
  getCompanySettings: vi.fn(async () => ({ company_name:'Test' })),
  getAppLists: vi.fn(async () => [
    {id:'p1',type:'project',value:'Current project',project_code:'P1',active:true},
    {id:'p2',type:'project',value:'Closed project',project_code:'P2',active:false},
    {id:'c1',type:'projectcode',value:'Closed cost code',project_code:'CC',project:'Closed project',active:false,inactive_by_project:true},
  ]),
  getDropdownOptions: vi.fn(async () => ({projects:[]})),
  updateAppListItem: vi.fn(async () => {}), updateCompanySettings:vi.fn(),addAppListItem:vi.fn(),deleteAppListItem:vi.fn(),getAllUsers:vi.fn(),createUser:vi.fn(),
}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/components/ImageUpload',()=>({default:()=>null}));
describe('Master data organization',()=>{
 it('moves project management out of company settings',async()=>{
  render(<MemoryRouter><SettingsView /></MemoryRouter>);
  expect(await screen.findByRole('link',{name:'Open Projects & Categories'})).toHaveAttribute('href','/accounting-setup?tab=masters');
  expect(screen.queryByRole('button',{name:'Deactivate Current project'})).not.toBeInTheDocument();
 });
 it('shows lifecycle controls and prevents activating a code under a closed project',async()=>{
  const refreshed=vi.fn(async()=>{});
  render(<MemoryRouter><SettingsView section="masters" onMastersChanged={refreshed} /></MemoryRouter>);
  const deactivate=await screen.findByRole('button',{name:'Deactivate Current project'});
  expect(screen.getByRole('button',{name:'Activate Closed cost code'})).toBeDisabled();
  expect(screen.queryByText('Company Settings')).not.toBeInTheDocument();
  fireEvent.click(deactivate);
  await waitFor(()=>expect(updateAppListItem).toHaveBeenCalledWith('p1',{active:false}));
  await waitFor(()=>expect(refreshed).toHaveBeenCalled());
  fireEvent.change(screen.getByRole('combobox',{name:'Filter master status'}),{target:{value:'inactive'}});
  expect(screen.queryByRole('button',{name:'Deactivate Current project'})).not.toBeInTheDocument();
 });
});
