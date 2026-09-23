import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAccountingMasters, getProjectWorks, saveAccountingMaster, type ProjectWork } from '@/lib/accounting-api';
import type { SapMasters } from '@/lib/sap-journal';
import { MasterSelect } from './AccountingSetupView';

function WorkRow({ work, managers, onSave }: { work: ProjectWork; managers: { value: string; label: string }[]; onSave: () => Promise<void> }) {
  const [name, setName] = useState(work.name), [manager, setManager] = useState(work.manager_email || '');
  const [active, setActive] = useState(work.active), [busy, setBusy] = useState(false);
  return <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await saveAccountingMaster('work', work.id, { project_id: work.project_id, name, manager_email: manager, active }); await onSave(); toast.success('Work allocation saved'); } catch(e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }}>
    <label className="text-sm space-y-1"><span>Work / activity</span><Input required value={name} onChange={e => setName(e.target.value)} /></label>
    <MasterSelect label="Assigned manager" value={manager} onChange={setManager} options={managers} empty="Use project manager" />
    <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active</label>
    <Button disabled={busy} className="self-end">Save work</Button>
  </form>;
}

export default function WorkAllocationView() {
  const [masters, setMasters] = useState<SapMasters | null>(null), [works, setWorks] = useState<ProjectWork[]>([]);
  const [projectId, setProjectId] = useState(''), [defaultManager, setDefaultManager] = useState('');
  const [name, setName] = useState(''), [manager, setManager] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = async () => { try { const [m,w] = await Promise.all([getAccountingMasters(), getProjectWorks()]); setMasters(m); setWorks(w); setError(''); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } };
  useEffect(() => { void load(); }, []);
  const projects = masters?.lists.filter(x => x.type === 'project' && x.active) || [];
  const managers = masters?.users.filter(u => u.active && ['Manager','Super Admin'].includes(u.role)).map(u => ({ value: u.email, label: `${u.name} (${u.email})` })) || [];
  const save = async (kind: string, id: string, values: Record<string, unknown>) => { setBusy(true); try { await saveAccountingMaster(kind,id,values); await load(); toast.success('Allocation saved'); if (kind === 'work') { setName(''); setManager(''); } } catch(e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  return <div className="space-y-4">
    <div className="glass-card p-4"><h2 className="text-lg font-bold">Work Allocation</h2><p className="text-sm text-muted-foreground">Assign a project manager first, then add work activities with separate managers as needed. Existing submitted claims keep their assigned manager.</p></div>
    {error && <p role="alert" className="text-destructive">{error} <Button onClick={load}>Retry</Button></p>}
    <MasterSelect label="Project" value={projectId} onChange={id => { setProjectId(id); setDefaultManager(projects.find(p => p.id === id)?.default_manager_email || ''); }} options={projects.map(p => ({ value:p.id,label:p.value }))} empty="Select project" />
    {projectId && <>
      <form className="rounded-lg border p-4 space-y-3" onSubmit={e => { e.preventDefault(); void save('project_manager',projectId,{ manager_email:defaultManager }); }}><MasterSelect label="Default project manager" value={defaultManager} onChange={setDefaultManager} options={managers} /><p className="text-xs text-muted-foreground">The first assignment creates “General work”. Rename it or add specific activities below.</p><Button disabled={busy}>Save project manager</Button></form>
      {works.filter(w => w.project_id === projectId).map(w => <WorkRow key={w.id} work={w} managers={managers} onSave={load} />)}
      <form className="rounded-lg border p-4 space-y-3" onSubmit={e => { e.preventDefault(); void save('work','',{ project_id:projectId,name,manager_email:manager,active:true }); }}><h3 className="font-semibold">Add work activity</h3><label className="block text-sm space-y-1"><span>Work name</span><Input required value={name} onChange={e => setName(e.target.value)} /></label><MasterSelect label="Assigned manager" value={manager} onChange={setManager} options={managers} empty="Use project manager" /><Button disabled={busy}>Add work</Button></form>
    </>}
  </div>;
}
