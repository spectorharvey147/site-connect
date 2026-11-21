import { useAuth } from '@/contexts/AuthContext';
import SettingsView from './SettingsView';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAccountingMasters, saveAccountingMaster, saveVendorGstMaster } from '@/lib/accounting-api';
import type { SapMasters } from '@/lib/sap-journal';

export const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
export function MasterSelect({ label, value, onChange, options, empty = 'Not configured' }: { label: string; value?: string; onChange: (value: string) => void; options: { value: string; label: string }[]; empty?: string }) {
  return <label className="block space-y-1 text-sm"><span>{label}</span><select aria-label={label} className={selectClass} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">{empty}</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}

function MasterRow({ kind, id, title, initial, masters, onSaved }: { kind: string; id: string; title: string; initial: Record<string, string>; masters: SapMasters; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await saveAccountingMaster(kind, id, values); toast.success('Saved'); await onSaved(); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const input = (key: string, label: string) => <label className="block space-y-1 text-sm"><span>{label}</span><Input aria-label={`${title}: ${label}`} value={values[key] || ''} onChange={e => set(key, e.target.value)} /></label>;
  return <form onSubmit={save} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
    <div className="self-center break-words"><p className="font-medium">{title}</p>{kind === 'user' && <p className="text-xs text-muted-foreground">{id}</p>}</div>
    {kind === 'user' && input('sap_gl_code', 'Employee GL code')}
    {['user', 'project'].includes(kind) && <MasterSelect label="Default location" value={values.sap_location_code} onChange={v => set('sap_location_code', v)} options={masters.locations.map(l => ({ value: l.code, label: `${l.code} — ${l.name}` }))} empty={kind === 'project' ? 'Use employee location' : 'Not configured'} />}
    {['project', 'projectcode'].includes(kind) && input('sap_project_code', 'SAP project code')}
    {kind === 'category' && <MasterSelect label="SAP expense group" value={values.sap_expense_group} onChange={v => set('sap_expense_group', v)} options={masters.groups.map(g => ({ value: g.code, label: `${g.name} — ${g.gl_code}` }))} />}
    {kind === 'group' && <>{input('name', 'Expense name')}{input('gl_code', 'Expense GL code')}</>}
    {kind === 'location' && <>{input('name', 'Display name')}{input('costing_code', 'SAP distribution rule')}</>}
    <Button type="submit" disabled={busy} className="self-end justify-self-start">{busy ? 'Saving…' : 'Save'}</Button>
  </form>;
}

function VendorRow({ vendor, onSaved }: { vendor: NonNullable<SapMasters['vendors']>[number]; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState({ vendor_name: vendor.vendor_name, short_form: vendor.short_form, vendor_account_code: vendor.vendor_account_code });
  const [busy, setBusy] = useState(false);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await saveVendorGstMaster('vendor', vendor.id, { ...values, active: vendor.active }); toast.success('Vendor saved'); await onSaved(); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const toggle = async () => {
    setBusy(true);
    try { await saveVendorGstMaster('vendor', vendor.id, { active: !vendor.active }); await onSaved(); toast.success(vendor.active ? 'Vendor deactivated' : 'Vendor activated'); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
    <label className="space-y-1 text-sm"><span>Vendor name</span><Input required value={values.vendor_name} onChange={e => setValues({ ...values, vendor_name: e.target.value })} /></label>
    <label className="space-y-1 text-sm"><span>BP code (unique short form)</span><Input required value={values.short_form} onChange={e => setValues({ ...values, short_form: e.target.value })} /></label>
    <label className="space-y-1 text-sm"><span>Accounts payable GL code (shared)</span><Input required value={values.vendor_account_code} onChange={e => setValues({ ...values, vendor_account_code: e.target.value })} /></label>
    <div className="flex items-end gap-2"><Button disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void toggle()}>{vendor.active ? 'Deactivate' : 'Activate'}</Button><span className="pb-2 text-xs text-muted-foreground">{vendor.active ? 'Active' : 'Inactive'}</span></div>
  </form>;
}

export default function AccountingSetupView() {
  const { user } = useAuth();
  const canManage = ['Admin', 'Super Admin'].includes(user?.role || '');
  const [activeTab, setActiveTab] = useState(canManage ? "masters" : "users");
  const [masters, setMasters] = useState<SapMasters | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [newLocation, setNewLocation] = useState({ code: '', name: '', costing_code: '' });
  const [adding, setAdding] = useState(false);
  const [newVendor, setNewVendor] = useState({ vendor_name: '', short_form: '', vendor_account_code: '' });
  const [newExpenseGl, setNewExpenseGl] = useState({ name: '', gl_code: '' });
  const [gstValues, setGstValues] = useState<Record<string, string>>({});
  const load = async () => { try { const value = await getAccountingMasters(); setMasters(value); setGstValues(Object.fromEntries(['CGST','SGST','IGST'].map(type => [type, value.gst_accounts?.find(x => x.gst_type === type && x.active)?.gl_code || '']))); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  useEffect(() => { void load(); }, []);
  const matches = (...parts: string[]) => parts.join(' ').toLowerCase().includes(search.toLowerCase());
  if (!masters) return <div className="p-4">{error || 'Loading accounting setup…'}{error && <Button onClick={load}>Retry</Button>}</div>;
  return <div className="space-y-4">
    <div className="glass-card p-4"><h2 className="text-lg font-bold">GL &amp; Location Setup</h2><p className="text-sm text-muted-foreground">Manage projects, cost codes, expense categories and their SAP mappings in one place. Project location takes priority over employee location.</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {activeTab !== "masters" && <Input aria-label="Search accounting setup" placeholder="Search name, email or code" value={search} onChange={e => setSearch(e.target.value)} />}
    <Tabs value={activeTab} onValueChange={setActiveTab}><TabsList className="h-auto flex-wrap">{canManage && <TabsTrigger value="masters">Projects &amp; Categories</TabsTrigger>}<TabsTrigger value="users">Employees</TabsTrigger><TabsTrigger value="projects">SAP Projects</TabsTrigger><TabsTrigger value="categories">Expense GL</TabsTrigger><TabsTrigger value="locations">Locations</TabsTrigger><TabsTrigger value="vendors">Vendor GL</TabsTrigger><TabsTrigger value="gst">GST GL</TabsTrigger></TabsList>
      {canManage && <TabsContent value="masters"><SettingsView section="masters" onMastersChanged={load} /></TabsContent>}
      <TabsContent value="users" className="space-y-3">{masters.users.filter(u => matches(u.name,u.email)).map(u => <MasterRow key={u.email} kind="user" id={u.email} title={`${u.name}${u.active ? '' : ' (inactive)'}`} initial={{ sap_gl_code: u.sap_gl_code || '', sap_location_code: u.sap_location_code || '' }} masters={masters} onSaved={load} />)}</TabsContent>
      <TabsContent value="projects" className="space-y-3"><p className="text-sm text-muted-foreground">Enter the exact SAP project code on the project. Reports use this code for all its expenses. If it is blank, the cost-code SAP mapping is used, then the existing cost code.</p>{masters.lists.filter(x => ['project','projectcode'].includes(x.type) && matches(x.value,x.project_code || '',x.project || '')).map(x => <MasterRow key={x.id} kind={x.type} id={x.id} title={(x.type === 'project' ? x.value : `${x.project || 'Common'} / ${x.value} (${x.project_code})`) + (x.active ? '' : ' (inactive)')} initial={{ sap_project_code: x.sap_project_code || '', sap_location_code: x.sap_location_code || '' }} masters={masters} onSaved={load} />)}</TabsContent>
      <TabsContent value="categories" className="space-y-3"><h3 className="font-semibold">Expense GL accounts</h3><p className="text-sm text-muted-foreground">Add an account, then link it to one or more expense categories below. Reports show a separate column for each expense GL name.</p>{masters.groups.map(g => <MasterRow key={g.code} kind="group" id={g.code} title={g.name} initial={{ name: g.name, gl_code: g.gl_code }} masters={masters} onSaved={load} />)}
        <form className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3" onSubmit={async e => { e.preventDefault(); setAdding(true); try { await saveAccountingMaster('group_add','',newExpenseGl); setNewExpenseGl({ name: '', gl_code: '' }); await load(); toast.success('Expense GL added'); } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } finally { setAdding(false); } }}><h3 className="font-semibold sm:col-span-3">Add expense GL</h3><label className="space-y-1 text-sm"><span>Expense name</span><Input required value={newExpenseGl.name} onChange={e => setNewExpenseGl({...newExpenseGl,name:e.target.value})} /></label><label className="space-y-1 text-sm"><span>Expense GL code</span><Input required value={newExpenseGl.gl_code} onChange={e => setNewExpenseGl({...newExpenseGl,gl_code:e.target.value})} /></label><Button disabled={adding} className="self-end">{adding ? 'Adding…' : 'Add expense GL'}</Button></form>
        <h3 className="pt-3 font-semibold">Map existing categories</h3>{masters.lists.filter(x => x.type === 'category' && matches(x.value)).map(x => <MasterRow key={x.id} kind="category" id={x.id} title={x.value + (x.active ? "" : " (inactive)")} initial={{ sap_expense_group: x.sap_expense_group || '' }} masters={masters} onSaved={load} />)}</TabsContent>
      <TabsContent value="locations" className="space-y-3">{masters.locations.filter(l => matches(l.code,l.name)).map(l => <MasterRow key={l.code} kind="location" id={l.code} title={`Location ${l.code}`} initial={{ name: l.name, costing_code: l.costing_code }} masters={masters} onSaved={load} />)}
        <form className="rounded-lg border p-4 space-y-3" onSubmit={async e => { e.preventDefault(); if (masters.locations.some(l => l.code === newLocation.code.trim())) { toast.error('This location code already exists. Edit it above.'); return; } setAdding(true); try { await saveAccountingMaster('location', newLocation.code.trim(), newLocation); setNewLocation({ code: '', name: '', costing_code: '' }); await load(); toast.success('Location added'); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setAdding(false); } }}><h3 className="font-semibold">Add location</h3><div className="grid gap-3 sm:grid-cols-3">{(['code','name','costing_code'] as const).map((key, i) => <label key={key}><Label>{['Location code','Display name','SAP distribution rule'][i]}</Label><Input required value={newLocation[key]} onChange={e => setNewLocation({ ...newLocation, [key]: e.target.value })} /></label>)}</div><Button disabled={adding}>Add location</Button></form>
      </TabsContent>
      <TabsContent value="vendors" className="space-y-3"><p className="text-sm text-muted-foreground">Add vendor details only after confirming the SAP vendor account. Referenced vendors are deactivated instead of deleted.</p>
        <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={async e => { e.preventDefault(); setAdding(true); try { await saveVendorGstMaster('vendor','',newVendor); setNewVendor({ vendor_name:'',short_form:'',vendor_account_code:'' }); await load(); toast.success('Vendor added'); } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } finally { setAdding(false); } }}>
          <label className="space-y-1 text-sm"><span>Vendor name</span><Input required value={newVendor.vendor_name} onChange={e => setNewVendor({...newVendor,vendor_name:e.target.value})} /></label>
          <label className="space-y-1 text-sm"><span>BP code (unique short form)</span><Input required value={newVendor.short_form} onChange={e => setNewVendor({...newVendor,short_form:e.target.value})} /></label>
          <label className="space-y-1 text-sm"><span>Accounts payable GL code (shared)</span><Input required value={newVendor.vendor_account_code} onChange={e => setNewVendor({...newVendor,vendor_account_code:e.target.value})} /></label>
          <Button disabled={adding} className="self-end justify-self-start">{adding ? 'Adding…' : 'Add Vendor'}</Button>
        </form>
        {(masters.vendors || []).filter(v => matches(v.vendor_name,v.short_form,v.vendor_account_code)).map(v => <VendorRow key={v.id} vendor={v} onSaved={load} />)}
      </TabsContent>
      <TabsContent value="gst" className="space-y-3"><p className="text-sm text-muted-foreground">Configure the Input GST ledger codes used for vendor unavailable tax invoices. Codes are supplied by Accounts and are never assumed by the application.</p>
        {(['CGST','SGST','IGST'] as const).map(type => { const record = masters.gst_accounts?.find(x => x.gst_type === type && x.active); return <form key={type} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={async e => { e.preventDefault(); setAdding(true); try { await saveVendorGstMaster('gst',type,{gl_code:gstValues[type]}); await load(); toast.success(`${type} GL saved`); } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); } finally { setAdding(false); } }}>
          <div><p className="font-medium">Input {type}</p><p className="text-sm text-muted-foreground">{record ? 'Active' : 'Not configured'}</p></div>
          <label className="space-y-1 text-sm"><span>GL account code</span><Input required value={gstValues[type] || ''} onChange={e => setGstValues({...gstValues,[type]:e.target.value})} /></label>
          <Button disabled={adding}>{record ? 'Update GL' : 'Configure GL'}</Button>
        </form>; })}
      </TabsContent>
    </Tabs>
  </div>;
}
