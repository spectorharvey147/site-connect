import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, UserRoundCog, Users, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  assignUsersToManager,
  getUserAllocationData,
  type UserAllocationRecord,
} from '@/lib/claims-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const UNASSIGNED = '__unassigned__';

export default function UserAllocationView() {
  const { user } = useAuth();
  const [directory, setDirectory] = useState<UserAllocationRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [managerEmail, setManagerEmail] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setDirectory(await getUserAllocationData());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load user allocations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const managers = useMemo(
    () => directory.filter((entry) => entry.active && ['Manager', 'Super Admin'].includes(entry.role)),
    [directory],
  );
  const managerNames = useMemo(
    () => Object.fromEntries(managers.map((manager) => [manager.email.toLowerCase(), manager.name])),
    [managers],
  );
  const employees = useMemo(
    () => directory.filter((entry) => entry.role === 'User'),
    [directory],
  );
  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter((entry) => {
      const matchesSearch = !query
        || entry.name.toLowerCase().includes(query)
        || entry.email.toLowerCase().includes(query);
      const currentManager = entry.managerEmail.toLowerCase();
      const matchesFilter = filter === 'all'
        || (filter === UNASSIGNED ? !currentManager : currentManager === filter.toLowerCase());
      return matchesSearch && matchesFilter;
    });
  }, [employees, filter, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleEmails = visibleEmployees.filter((entry) => entry.active).map((entry) => entry.email);
  const allVisibleSelected = visibleEmails.length > 0 && visibleEmails.every((email) => selectedSet.has(email));
  const assignedCount = employees.filter((entry) => entry.managerEmail).length;

  const toggleVisible = (checked: boolean) => {
    if (checked) {
      setSelected((current) => [...new Set([...current, ...visibleEmails])]);
    } else {
      const visibleSet = new Set(visibleEmails);
      setSelected((current) => current.filter((email) => !visibleSet.has(email)));
    }
  };

  const saveAllocation = async (nextManager: string | null) => {
    if (!user || selected.length === 0) return;
    setSaving(true);
    try {
      const count = await assignUsersToManager(selected, nextManager, user.email);
      toast.success(nextManager ? `${count} user(s) assigned` : `${count} user(s) unassigned`);
      setSelected([]);
      await load();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save user allocation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4 duration-500">
      <div className="glass-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><UserRoundCog className="h-5 w-5 text-primary" /> User Allocation</h2>
            <p className="mt-1 text-sm text-muted-foreground">Assign employees to a manager. The manager dashboard uses these active assignments.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Employees</p><p className="mt-1 text-2xl font-bold">{employees.length}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Assigned</p><p className="mt-1 text-2xl font-bold text-success">{assignedCount}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Unassigned</p><p className="mt-1 text-2xl font-bold text-warning">{employees.length - assignedCount}</p></div>
      </div>

      <section className="space-y-4 border-y bg-card/50 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto]">
          <div>
            <Label htmlFor="allocation-manager">Manager for selected users</Label>
            <Select value={managerEmail} onValueChange={setManagerEmail}>
              <SelectTrigger id="allocation-manager" className="mt-1"><SelectValue placeholder="Select manager" /></SelectTrigger>
              <SelectContent>
                {managers.map((manager) => <SelectItem key={manager.email} value={manager.email}>{manager.name} ({manager.email})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="self-end" disabled={saving || !managerEmail || selected.length === 0} onClick={() => void saveAllocation(managerEmail)}>
            <Users className="mr-2 h-4 w-4" /> Assign {selected.length || ''}
          </Button>
          <Button variant="outline" className="self-end" disabled={saving || selected.length === 0} onClick={() => void saveAllocation(null)}>
            <UserX className="mr-2 h-4 w-4" /> Clear assignment
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">A user can have one active manager. Reassigning replaces the current manager and is recorded in allocation history.</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            <SelectItem value={UNASSIGNED}>Unassigned only</SelectItem>
            {managers.map((manager) => <SelectItem key={manager.email} value={manager.email}>{manager.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"><Checkbox checked={allVisibleSelected} onCheckedChange={(value) => toggleVisible(value === true)} aria-label="Select all visible users" /></TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Current manager</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Loading user allocations...</TableCell></TableRow>
            ) : visibleEmployees.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No employees match these filters.</TableCell></TableRow>
            ) : visibleEmployees.map((employee) => (
              <TableRow key={employee.email}>
                <TableCell><Checkbox disabled={!employee.active} checked={selectedSet.has(employee.email)} onCheckedChange={(value) => setSelected((current) => value === true ? [...new Set([...current, employee.email])] : current.filter((email) => email !== employee.email))} aria-label={`Select ${employee.name}`} /></TableCell>
                <TableCell><p className="font-medium">{employee.name}</p><p className="text-xs text-muted-foreground">{employee.email}</p></TableCell>
                <TableCell>{employee.managerEmail ? <><p className="font-medium">{managerNames[employee.managerEmail.toLowerCase()] || employee.managerEmail}</p><p className="text-xs text-muted-foreground">{employee.managerEmail}</p></> : <Badge variant="outline">Unassigned</Badge>}</TableCell>
                <TableCell><Badge variant="outline" className={employee.active ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'}>{employee.active ? 'Active' : 'Inactive'}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
