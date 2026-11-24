import { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { assignUsersToDepartment, getDepartmentAllocationData, type DepartmentOption, type DepartmentUser } from '@/lib/department-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const NO_DEPARTMENT = '__none__';
const CENTRAL_ROLES = new Set(['accounts', 'master admin']);

export default function DepartmentAllocationView() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [users, setUsers] = useState<DepartmentUser[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [destination, setDestination] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEmail, setSavingEmail] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getDepartmentAllocationData();
      setDepartments(result.departments);
      setUsers(result.users);
      setSelectedEmails([]);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load department allocation.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeDepartments = useMemo(() => departments.filter((department) => department.active), [departments]);
  const departmentNames = useMemo(() => new Map(departments.map((department) => [department.id, department.name])), [departments]);
  const assignableUsers = useMemo(() => users.filter((entry) => !CENTRAL_ROLES.has(entry.role.toLowerCase())), [users]);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assignableUsers.filter((entry) => {
      const matchesSearch = !query || entry.name.toLowerCase().includes(query) || entry.email.toLowerCase().includes(query);
      const matchesDepartment = departmentFilter === 'all'
        || (departmentFilter === NO_DEPARTMENT ? !entry.departmentId : entry.departmentId === departmentFilter);
      return matchesSearch && matchesDepartment;
    });
  }, [assignableUsers, departmentFilter, search]);

  const assignedCount = assignableUsers.filter((entry) => entry.departmentId).length;
  const visibleEmails = filteredUsers.map((entry) => entry.email);
  const allVisibleSelected = visibleEmails.length > 0 && visibleEmails.every((email) => selectedEmails.includes(email));

  const applyAllocation = async (emails: string[], departmentId: string | null) => {
    if (!user || !emails.length) return;
    try {
      const updatedCount = await assignUsersToDepartment(emails, departmentId);
      const departmentName = departmentId ? departmentNames.get(departmentId) || 'the selected department' : 'no department';
      toast.success(`${updatedCount} user${updatedCount === 1 ? '' : 's'} assigned to ${departmentName}`);
      await load();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save department allocation.');
    }
  };

  const applyToSelected = async () => {
    if (!destination) {
      toast.error('Choose a department first.');
      return;
    }
    setSaving(true);
    try {
      await applyAllocation(selectedEmails, destination === NO_DEPARTMENT ? null : destination);
    } finally {
      setSaving(false);
    }
  };

  const changeOneUser = async (entry: DepartmentUser, value: string) => {
    setSavingEmail(entry.email);
    try {
      await applyAllocation([entry.email], value === NO_DEPARTMENT ? null : value);
    } finally {
      setSavingEmail('');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Department Allocation</h1>
          <p className="text-sm text-muted-foreground">Assign users to departments. New claims will use the submitter’s department.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || saving}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="h-4 w-4" /> Active departments</div><div className="mt-2 text-2xl font-semibold">{activeDepartments.length}</div></div>
        <div className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Assigned users</div><div className="mt-2 text-2xl font-semibold">{assignedCount} <span className="text-sm font-normal text-muted-foreground">of {assignableUsers.length}</span></div></div>
        <div className="rounded-lg border bg-card p-4"><div className="text-sm text-muted-foreground">Departments available for assignment</div><div className="mt-2 truncate text-lg font-semibold">{activeDepartments.map((department) => department.name).join(', ') || 'None yet'}</div></div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users by name or email" /></div>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Filter by department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            <SelectItem value={NO_DEPARTMENT}>Unassigned</SelectItem>
            {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}{department.active ? '' : ' (inactive)'}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">{selectedEmails.length} selected. Accounts and Master Admin stay central.</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger className="w-full sm:w-60"><SelectValue placeholder="Choose department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_DEPARTMENT}>Unassign department</SelectItem>
              {activeDepartments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => void applyToSelected()} disabled={!selectedEmails.length || !destination || saving || loading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Apply to selected
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading department assignments…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No users match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10"><Checkbox aria-label="Select all visible users" checked={allVisibleSelected} onCheckedChange={(checked) => setSelectedEmails(checked ? [...new Set([...selectedEmails, ...visibleEmails])] : selectedEmails.filter((email) => !visibleEmails.includes(email)))} /></TableHead>
                <TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Department</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredUsers.map((entry) => (
                  <TableRow key={entry.email}>
                    <TableCell><Checkbox aria-label={`Select ${entry.name || entry.email}`} checked={selectedEmails.includes(entry.email)} onCheckedChange={(checked) => setSelectedEmails((current) => checked ? [...new Set([...current, entry.email])] : current.filter((email) => email !== entry.email))} /></TableCell>
                    <TableCell><div className="font-medium">{entry.name || 'Unnamed user'}</div><div className="text-xs text-muted-foreground">{entry.email}</div></TableCell>
                    <TableCell><Badge variant="secondary">{entry.role}</Badge></TableCell>
                    <TableCell><Badge variant={entry.active ? 'default' : 'outline'}>{entry.active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell>
                      <Select value={entry.departmentId || NO_DEPARTMENT} onValueChange={(value) => void changeOneUser(entry, value)} disabled={Boolean(savingEmail) || saving}>
                        <SelectTrigger className="min-w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_DEPARTMENT}>Unassigned</SelectItem>
                          {departments.filter((department) => department.active || department.id === entry.departmentId).map((department) => <SelectItem key={department.id} value={department.id}>{department.name}{department.active ? '' : ' (inactive)'}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
