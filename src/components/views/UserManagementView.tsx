import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers, createUser, updateUser, deleteUser, addUserAdvance } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Users, RefreshCw, Plus, Edit, Trash2, Loader2, Search, UserCheck, UserX, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import RupeeIcon from '@/components/icons/RupeeIcon';
import ImageUpload from '@/components/ImageUpload';
import { PASSWORD_REQUIREMENTS, validatePassword } from '@/lib/password-validation';

function canUseSignature(role?: string) {
  return Boolean(String(role || '').trim());
}

export default function UserManagementView() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [advanceModal, setAdvanceModal] = useState<{ email: string; name: string } | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'User', advance: '0', manager: '', signatureUrl: '' });

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllUsers();
      setUsers(data);
      setAllUsers(data);
    } catch (e) { 
      console.error('Error loading users:', e);
      setError((e as any).message || 'Failed to load users');
    }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const roles = useMemo(() => [...new Set(users.map((entry) => entry.role).filter(Boolean))].sort(), [users]);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((entry) => {
      const matchesSearch = !query || String(entry.name || '').toLowerCase().includes(query) || String(entry.email || '').toLowerCase().includes(query);
      const matchesRole = roleFilter === 'all' || entry.role === roleFilter;
      const isActive = entry.active !== false;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? isActive : !isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, search, statusFilter, users]);
  const userSummary = useMemo(() => users.reduce((summary, entry) => ({
    active: summary.active + (entry.active !== false ? 1 : 0),
    inactive: summary.inactive + (entry.active === false ? 1 : 0),
    approvers: summary.approvers + (['Manager', 'Admin', 'Super Admin'].includes(entry.role) ? 1 : 0),
    balance: summary.balance + Number(entry.balance || 0),
  }), { active: 0, inactive: 0, approvers: 0, balance: 0 }), [users]);

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordError = validatePassword(form.password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    setProcessing(true);
    try {
      await createUser({ ...form, advance: parseFloat(form.advance) || 0 });
      toast.success('User created');
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'User', advance: '0', manager: '', signatureUrl: '' });
      loadUsers();
    } catch (err: any) { toast.error(err.message); }
    setProcessing(false);
  };

  const handleUpdate = async () => {
    if (editUser?.password) {
      const passwordError = validatePassword(editUser.password);
      if (passwordError) {
        toast.error(passwordError);
        return;
      }
    }
    setProcessing(true);
    try {
      await updateUser({
        originalEmail: editUser.originalEmail,
        name: editUser.name,
        email: editUser.email,
        role: editUser.role,
        password: editUser.password || undefined,
        manager: editUser.manager,
        signatureUrl: editUser.signatureUrl || '',
      });
      toast.success('User updated');
      setEditUser(null);
      loadUsers();
    } catch (err: any) { toast.error(err.message); }
    setProcessing(false);
  };

  const handleDelete = async (email: string) => {
    if (!confirm(`Delete user ${email}?`)) return;
    try {
      await deleteUser(email);
      toast.success('User deleted');
      loadUsers();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleToggleActive = async (email: string, currentActive: boolean) => {
    try {
      await supabase.from('users').update({ active: !currentActive } as any).eq('email', email);
      toast.success(`User ${!currentActive ? 'activated' : 'deactivated'}`);
      loadUsers();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSignatureUploaded = async (targetUser: any, url: string) => {
    const signatureUrl = url || '';
    try {
      const { error } = await supabase
        .from('users')
        .update({ signature_url: signatureUrl || null } as any)
        .eq('email', targetUser.email);
      if (error) throw error;

      const applySignature = (entry: any) => entry.email === targetUser.email ? { ...entry, signatureUrl } : entry;
      setUsers(prev => prev.map(applySignature));
      setAllUsers(prev => prev.map(applySignature));
      if (editUser?.email === targetUser.email) setEditUser({ ...editUser, signatureUrl });
      toast.success(signatureUrl ? 'Signature saved' : 'Signature removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save signature');
      loadUsers();
    }
  };

  const handleAddAdvance = async () => {
    if (!advanceModal || !advanceAmount) return;
    setProcessing(true);
    try {
      await addUserAdvance(advanceModal.email, parseFloat(advanceAmount), user!.email);
      toast.success(`Rs. ${advanceAmount} added to ${advanceModal.name}`);
      setAdvanceModal(null);
      setAdvanceAmount('');
      loadUsers();
    } catch (err: any) { toast.error(err.message); }
    setProcessing(false);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg border border-destructive/20">
          Error: {error}
        </div>
      )}
      <div className="glass-card">
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border">
          <div>
            <h2 className="font-bold flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> User Management</h2>
            <p className="mt-1 text-sm text-muted-foreground">Manage access, roles, managers, signatures and employee advances.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading} className="flex-1 sm:flex-none h-10 sm:h-9">
              <RefreshCw className={`h-4 w-4 sm:mr-1 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} className="flex-1 sm:flex-none h-10 sm:h-9">
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Add User</span>
            </Button>
          </div>
        </div>

        <div className="border-b border-border bg-muted/20 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Active Users</p><p className="mt-1 flex items-center gap-2 text-xl font-bold text-success"><UserCheck className="h-4 w-4" />{userSummary.active}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Inactive Users</p><p className="mt-1 flex items-center gap-2 text-xl font-bold text-destructive"><UserX className="h-4 w-4" />{userSummary.inactive}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Approval Roles</p><p className="mt-1 flex items-center gap-2 text-xl font-bold text-info"><ShieldCheck className="h-4 w-4" />{userSummary.approvers}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Combined Balance</p><p className="mt-1 text-xl font-bold text-primary">Rs. {userSummary.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative xl:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-10" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All roles</SelectItem>{roles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active only</SelectItem><SelectItem value="inactive">Inactive only</SelectItem></SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={resetFilters} title="Reset filters"><X className="h-4 w-4" /></Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Showing {filteredUsers.length} of {users.length} users</p>
        </div>
        
        {/* Mobile Card View */}
        <div className="block md:hidden p-3 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-border rounded-lg p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No users match these filters</div>
          ) : filteredUsers.map(u => (
            <div key={u.email} className="border border-border rounded-lg p-4 space-y-3 bg-card hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{u.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                </div>
                <Badge className={u.active !== false ? 'bg-success/10 text-success border-success/30' : 'bg-destructive/10 text-destructive border-destructive/30'} variant="outline">
                  {u.active !== false ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{u.role}</Badge>
                {u.manager && <span className="text-muted-foreground">Manager: {u.manager}</span>}
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <Label className="mb-2 block text-xs">Signature</Label>
                <ImageUpload
                  bucket="user-avatars"
                  currentUrl={u.signatureUrl || null}
                  onUploaded={(url) => void handleSignatureUploaded(u, url)}
                  folder={`signatures/${u.email}`}
                  variant="signature"
                  acceptedTypes={['image/png', 'image/jpeg']}
                  buttonLabel={u.signatureUrl ? 'Change' : 'Upload'}
                  helperText="Shown on vouchers"
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <p className="text-lg font-bold text-primary">Rs. {u.balance.toFixed(2)}</p>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={u.active !== false}
                    onCheckedChange={() => handleToggleActive(u.email, u.active !== false)}
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setEditUser({ ...u, originalEmail: u.email, password: '', signatureUrl: u.signatureUrl || '' })}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-success" onClick={() => setAdvanceModal({ email: u.email, name: u.name })}>
                    <RupeeIcon className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => handleDelete(u.email)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden max-h-[720px] overflow-auto md:block">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-sm"><tr className="bg-muted/50"><th className="p-3 text-left">Name</th><th className="p-3 text-left">Email</th><th className="p-3 text-left">Role</th><th className="p-3 text-center">Actions</th><th className="p-3 text-center">Sign</th><th className="p-3 text-left">Manager</th><th className="p-3 text-center">Status</th><th className="p-3 text-right">Balance</th></tr></thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">No users match these filters</td></tr>
              ) : filteredUsers.map(u => (
                <tr key={u.email} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{u.name}</td>
                  <td className="p-3 text-sm">{u.email}</td>
                  <td className="p-3">{u.role}</td>
                  <td className="p-3 text-center space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setEditUser({ ...u, originalEmail: u.email, password: '', signatureUrl: u.signatureUrl || '' })}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-success" onClick={() => setAdvanceModal({ email: u.email, name: u.name })}><RupeeIcon className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(u.email)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                  <td className="p-3 min-w-[280px]">
                    <ImageUpload
                      bucket="user-avatars"
                      currentUrl={u.signatureUrl || null}
                      onUploaded={(url) => void handleSignatureUploaded(u, url)}
                      folder={`signatures/${u.email}`}
                      variant="signature"
                      acceptedTypes={['image/png', 'image/jpeg']}
                      buttonLabel={u.signatureUrl ? 'Change' : 'Upload'}
                      helperText="Shown on vouchers"
                    />
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{u.manager || '—'}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Switch
                        checked={u.active !== false}
                        onCheckedChange={() => handleToggleActive(u.email, u.active !== false)}
                      />
                      <Badge className={u.active !== false ? 'bg-success/10 text-success border-success/30' : 'bg-destructive/10 text-destructive border-destructive/30'} variant="outline">
                        {u.active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </td>
                  <td className="p-3 text-right font-bold">Rs. {u.balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input className="h-11 sm:h-10" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Enter full name" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input className="h-11 sm:h-10" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required placeholder="Enter email" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input className="h-11 sm:h-10" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required placeholder="Create password" />
              <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                  <SelectTrigger className="h-11 sm:h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="User">User</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Accounts">Accounts</SelectItem>
                    <SelectItem value="Super Admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Initial Advance (Rs.)</Label>
                <Input className="h-11 sm:h-10" type="number" min="0" value={form.advance} onChange={e => setForm({ ...form, advance: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Manager</Label>
              <Select value={form.manager} onValueChange={v => setForm({ ...form, manager: v })}>
                <SelectTrigger className="h-11 sm:h-10"><SelectValue placeholder="Select Manager (Optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Manager</SelectItem>
                  {allUsers.filter(u => u.role === 'Manager' || u.role === 'Admin' || u.role === 'Super Admin').map(u => (
                    <SelectItem key={u.email} value={u.email}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <Label>Signature</Label>
              <ImageUpload
                bucket="user-avatars"
                currentUrl={form.signatureUrl || null}
                onUploaded={(url) => setForm({ ...form, signatureUrl: url })}
                folder={`signatures/${form.email || 'new-user'}`}
                variant="signature"
                acceptedTypes={['image/png', 'image/jpeg']}
              />
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="w-full sm:w-auto h-11 sm:h-10">Cancel</Button>
              <Button type="submit" disabled={processing} className="w-full sm:w-auto h-11 sm:h-10">
                {processing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />} Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input className="h-11 sm:h-10" value={editUser.name} onChange={e => setEditUser({ ...editUser, name: e.target.value })} placeholder="Enter name" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input className="h-11 sm:h-10" value={editUser.email} onChange={e => setEditUser({ ...editUser, email: e.target.value })} placeholder="Enter email" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editUser.role} onValueChange={v => setEditUser({ ...editUser, role: v })}>
                  <SelectTrigger className="h-11 sm:h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="User">User</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Accounts">Accounts</SelectItem>
                    <SelectItem value="Super Admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Password (leave blank to keep current)</Label>
                <Input className="h-11 sm:h-10" type="password" value={editUser.password} onChange={e => setEditUser({ ...editUser, password: e.target.value })} placeholder="Enter new password" />
                <p className="text-xs text-muted-foreground">If changed, {PASSWORD_REQUIREMENTS.toLowerCase()}</p>
              </div>
              <div className="space-y-2">
                <Label>Manager</Label>
                <Select value={editUser.manager || 'none'} onValueChange={v => setEditUser({ ...editUser, manager: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-11 sm:h-10"><SelectValue placeholder="Select Manager" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Manager</SelectItem>
                    {allUsers.filter(u => u.email !== editUser.originalEmail && ['Manager', 'Admin', 'Super Admin'].includes(u.role)).map(u => (
                      <SelectItem key={u.email} value={u.email}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <Label>Signature</Label>
                <ImageUpload
                  bucket="user-avatars"
                  currentUrl={editUser.signatureUrl || null}
                  onUploaded={(url) => setEditUser({ ...editUser, signatureUrl: url })}
                  folder={`signatures/${editUser.email || editUser.originalEmail}`}
                  variant="signature"
                  acceptedTypes={['image/png', 'image/jpeg']}
                />
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setEditUser(null)} className="w-full sm:w-auto h-11 sm:h-10">Cancel</Button>
                <Button onClick={handleUpdate} disabled={processing} className="w-full sm:w-auto h-11 sm:h-10">Save Changes</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Advance Modal */}
      <Dialog open={!!advanceModal} onOpenChange={() => setAdvanceModal(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader><DialogTitle>Add Advance - {advanceModal?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Amount (Rs.)</Label>
            <Input className="h-11 sm:h-10" type="number" min="1" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} placeholder="Enter amount" />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAdvanceModal(null)} className="w-full sm:w-auto h-11 sm:h-10">Cancel</Button>
            <Button onClick={handleAddAdvance} disabled={processing} className="w-full sm:w-auto h-11 sm:h-10">Add Advance</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
