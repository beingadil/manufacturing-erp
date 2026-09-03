import { Loader2, Lock, Pencil, Plus, Trash2, } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Column, DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { hashPassword, useAccessStore } from '@/store/useAccessStore';
import { Role, UserRow } from '@/types/access';
import { SearchInput } from '../ui/SearchInput';
import { ConfirmDialog } from './ConfirmDialog';
import { PasswordDialog, PasswordFormValues } from './PasswordDialog';
import { UserFormDialog, UserFormValues } from './UserFormDialog';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  inactive: 'secondary',
  suspended: 'destructive',
};

export function UsersTab() {
  const storeUsers = useAccessStore((state) => state.users);
  const storeRoles = useAccessStore((state) => state.roles);
  const addUser = useAccessStore((state) => state.addUser);
  const updateUser = useAccessStore((state) => state.updateUser);
  const deleteUserStore = useAccessStore((state) => state.deleteUser);
  const changePassword = useAccessStore((state) => state.changePassword);
  const logAudit = useAccessStore((state) => state.logAudit);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);

  useEffect(() => {
    fetchData();
  }, [storeUsers, storeRoles]);

  const fetchData = async () => {
    setIsLoading(true);
    const validUsers = storeUsers.filter(u => !u.deleted_at).map(u => ({
      ...u,
      roles: storeRoles.find(r => r.id === u.role_id) || null
    }));
    setUsers(validUsers);
    setRoles(storeRoles);
    setIsLoading(false);
  };

  const roleMap = useMemo(() => {
    const map: Record<string, string> = {};
    roles.forEach((r) => (map[r.id] = r.name));
    return map;
  }, [roles]);

  const filteredUsers = useMemo(() => {
    const s = search.toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !s ||
        (u.name || '').toLowerCase().includes(s) ||
        (u.username || '').toLowerCase().includes(s) ||
        (u.email || '').toLowerCase().includes(s);
      const matchesRole = !roleFilter || u.role_id === roleFilter;
      const matchesStatus = !statusFilter || u.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleSaveUser = async (values: UserFormValues) => {
    setIsSaving(true);
    try {
      const payload = {
        name: values.name,
        username: values.username,
        email: values.email || undefined,
        phone: values.phone || undefined,
        role_id: values.role_id,
        status: values.status as any,
      };

      if (editingUser) {
        updateUser(editingUser.id, payload);
        toast.success('User updated successfully');
        logAudit({
          action_type: 'Updated',
          target_object: 'Users',
          target_id: editingUser.id
        });
      } else {
        if (!values.password || values.password.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }
        const hash = await hashPassword(values.password);
        const newUser = addUser(payload, hash);
        toast.success('User created successfully');
        logAudit({
          action_type: 'Created',
          target_object: 'Users',
          target_id: newUser.id
        });
      }
      setFormOpen(false);
      setEditingUser(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserRow) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    setIsSaving(true);
    try {
      updateUser(user.id, { status: newStatus });
      toast.success(`User ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      logAudit({
        action_type: newStatus === 'active' ? 'Activated' : 'Deactivated',
        target_object: 'Users',
        target_id: user.id
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setIsSaving(true);
    try {
      deleteUserStore(deleteUser.id);
      toast.success('User deleted successfully');
      logAudit({
        action_type: 'Deleted',
        target_object: 'Users',
        target_id: deleteUser.id
      });
      setDeleteOpen(false);
      setDeleteUser(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (values: PasswordFormValues) => {
    if (!passwordUser) return;
    setIsSaving(true);
    try {
      const hash = await hashPassword(values.password);
      changePassword(passwordUser.id, hash);
      toast.success('Password changed successfully');
      logAudit({
        action_type: 'Password Changed',
        target_object: 'Users',
        target_id: passwordUser.id
      });
      setPasswordOpen(false);
      setPasswordUser(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    setFormOpen(true);
  };

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      label: 'User',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
            {(u.name?.charAt(0) || u.username?.charAt(0) || 'U').toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{u.name || 'Unnamed'}</div>
            <div className="text-xs text-muted-foreground truncate">{u.username || u.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'email', label: 'Email', sortable: true, render: (u) => u.email || '-' },
    {
      key: 'role_id',
      label: 'Role',
      sortable: true,
      render: (u) => roleMap[u.role_id || ''] || u.roles?.name || '-',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (u) => (
        <Badge variant={statusVariant[u.status] || 'secondary'} className="capitalize">
          {u.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (u) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Edit" aria-label={`Edit user ${u.username}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setPasswordUser(u); setPasswordOpen(true); }}
            title="Change Password"
            aria-label={`Change password for ${u.username}`}
          >
            <Lock className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setDeleteUser(u); setDeleteOpen(true); }}
            className="text-destructive hover:text-destructive"
            title="Delete"
            aria-label={`Delete user ${u.username}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    {
      key: 'active',
      label: 'Active',
      render: (u) => (
        <Switch
          checked={u.status === 'active'}
          onCheckedChange={() => handleToggleStatus(u)}
          disabled={isSaving}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search users..."
            className="w-full md:w-64"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="">All Roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <Button
          onClick={() => { setEditingUser(null); setFormOpen(true); }}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading users…
          </div>
        ) : (
          <DataTable
            data={filteredUsers}
            columns={columns}
            searchKeys={[]}
            persistKey="users-list"
            emptyStateMessage="No users found."
          />
        )}
      </div>

      <UserFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingUser(null); }}
        user={editingUser}
        roles={roles}
        departments={[]}
        costCenters={[]}
        onSubmit={handleSaveUser}
        isLoading={isSaving}
      />

      <PasswordDialog
        open={passwordOpen}
        onOpenChange={(open) => { setPasswordOpen(open); if (!open) setPasswordUser(null); }}
        userName={passwordUser?.name || undefined}
        onSubmit={handleChangePassword}
        isLoading={isSaving}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteUser(null); }}
        title="Delete User"
        description={
          <>
            Are you sure you want to delete <strong>{deleteUser?.name || deleteUser?.email}</strong>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        isLoading={isSaving}
        onConfirm={handleDelete}
      />
    </div>
  );
}
