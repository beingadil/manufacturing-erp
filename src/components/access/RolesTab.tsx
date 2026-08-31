import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Column, DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useAccessStore } from '@/store/useAccessStore';
import { Permission, Role, RolePermission } from '@/types/access';
import { ConfirmDialog } from './ConfirmDialog';
import { PermissionMatrix } from './PermissionMatrix';
import { RoleFormDialog, RoleFormValues } from './RoleFormDialog';

export function RolesTab() {
  const { isAdmin, refreshProfile, profile } = useAuth();

  const storeRoles = useAccessStore((state) => state.roles);
  const storePermissions = useAccessStore((state) => state.permissions);
  const storeRolePermissions = useAccessStore((state) => state.rolePermissions);
  const storeUsers = useAccessStore((state) => state.users);

  const addRole = useAccessStore((state) => state.addRole);
  const updateRoleStore = useAccessStore((state) => state.updateRole);
  const deleteRoleStore = useAccessStore((state) => state.deleteRole);
  const setRolePermissionsStore = useAccessStore((state) => state.setRolePermissions);
  const logAudit = useAccessStore((state) => state.logAudit);

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);

  useEffect(() => {
    fetchData();
  }, [storeRoles, storePermissions, storeRolePermissions, storeUsers]);

  const fetchData = async () => {
    setIsLoading(true);
    
    setRoles(storeRoles);
    if (!selectedRole && storeRoles.length > 0) {
      setSelectedRole(storeRoles[0]);
    }
    setPermissions(storePermissions);
    setRolePermissions(storeRolePermissions);

    const counts: Record<string, number> = {};
    storeUsers.filter(u => !u.deleted_at).forEach(u => {
      if (u.role_id) {
        counts[u.role_id] = (counts[u.role_id] || 0) + 1;
      }
    });
    setUserCounts(counts);
    
    setIsLoading(false);
  };

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
  };

  const checkDuplicateName = (name: string, excludeId?: string) => {
    return storeRoles.some(r => r.name.toLowerCase() === name.toLowerCase() && r.id !== excludeId);
  };

  const handleSaveRole = async (values: RoleFormValues) => {
    setIsSaving(true);
    try {
      const normalizedName = values.name.trim();
      if (editingRole) {
        if (editingRole.type === 'Default' && normalizedName.toLowerCase() !== editingRole.name.toLowerCase()) {
          throw new Error('Cannot rename a default role');
        }
        const isDuplicate = checkDuplicateName(normalizedName, editingRole.id);
        if (isDuplicate) throw new Error('Role name already exists');

        updateRoleStore(editingRole.id, { name: normalizedName, description: values.description });
        toast.success('Role updated successfully');
        logAudit({
          action_type: 'Updated',
          target_object: 'Roles',
          target_id: editingRole.id,
          changes: { name: normalizedName }
        });
        if (selectedRole?.id === editingRole.id) {
          setSelectedRole({ ...selectedRole, name: normalizedName, description: values.description });
        }
      } else {
        const isDuplicate = checkDuplicateName(normalizedName);
        if (isDuplicate) throw new Error('Role name already exists');

        const newRole = addRole({ name: normalizedName, description: values.description, type: 'Custom', is_system: false });
        toast.success('Role created successfully');
        logAudit({
          action_type: 'Created',
          target_object: 'Roles',
          target_id: newRole.id,
          changes: { name: normalizedName }
        });
        setSelectedRole(newRole);
      }
      setFormOpen(false);
      setEditingRole(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save role');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!deleteRole) return;
    setIsSaving(true);
    try {
      if (deleteRole.type === 'Default') throw new Error('Cannot delete a default role');
      if ((userCounts[deleteRole.id] || 0) > 0) throw new Error('Cannot delete role with assigned users');

      deleteRoleStore(deleteRole.id);

      toast.success('Role deleted successfully');
      logAudit({
        action_type: 'Deleted',
        target_object: 'Roles',
        target_id: deleteRole.id,
        changes: { name: deleteRole.name }
      });
      if (selectedRole?.id === deleteRole.id) setSelectedRole(null);
      setDeleteOpen(false);
      setDeleteRole(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete role');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePermission = async (permissionId: string, granted: boolean) => {
    if (!selectedRole) return;
    try {
      let newPerms;
      if (granted) {
        const current = storeRolePermissions.filter(rp => rp.role_id === selectedRole.id).map(rp => rp.permission_id);
        newPerms = [...current, permissionId];
      } else {
        newPerms = storeRolePermissions.filter(rp => rp.role_id === selectedRole.id && rp.permission_id !== permissionId).map(rp => rp.permission_id);
      }
      
      setRolePermissionsStore(selectedRole.id, newPerms);
      
      const perm = permissions.find((p) => p.id === permissionId);
      logAudit({
        action_type: 'Permission Updated',
        target_object: 'Roles',
        target_id: selectedRole.id,
        changes: {
          permission: `${perm?.module} - ${perm?.action}`,
          granted,
        }
      });
      
      if (profile?.role_id === selectedRole.id) await refreshProfile();
      toast.success('Permission updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update permission');
    }
  };

  const columns: Column<Role>[] = [
    {
      key: 'name',
      label: 'Role Name',
      sortable: true,
      render: (r) => (
        <button
          onClick={() => handleRoleSelect(r)}
          className={`text-left font-medium hover:underline ${selectedRole?.id === r.id ? 'text-primary' : ''}`}
        >
          {r.name}
        </button>
      ),
    },
    { key: 'description', label: 'Description', render: (r) => r.description || '-' },
    {
      key: 'type',
      label: 'Type',
      render: (r) => <Badge variant={r.type === 'Default' ? 'default' : 'secondary'}>{r.type}</Badge>,
    },
    {
      key: 'users',
      label: 'Users',
      render: (r) => userCounts[r.id] || 0,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setEditingRole(r); setFormOpen(true); }}
            title="Edit"
            aria-label={`Edit role ${r.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setDeleteRole(r); setDeleteOpen(true); }}
            className="text-destructive hover:text-destructive"
            title="Delete"
            aria-label={`Delete role ${r.name}`}
            disabled={r.type === 'Default'}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[500px]">
      <div className="w-full md:w-80 border-r border-border bg-muted/10 p-4 space-y-4 flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Roles</h3>
          <Button size="sm" onClick={() => { setEditingRole(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4">
            <DataTable
              data={roles}
              columns={columns}
              searchKeys={['name']}
              searchPlaceholder="Search roles..."
              persistKey="roles-list"
              itemsPerPageOptions={[10, 25, 50]}
              emptyStateMessage="No roles found."
            />
          </div>
        )}
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <PermissionMatrix
          role={selectedRole}
          permissions={permissions}
          rolePermissions={rolePermissions}
          isAdmin={isAdmin}
          onToggle={handleTogglePermission}
          loading={isSaving}
        />
      </div>

      <RoleFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingRole(null); }}
        role={editingRole}
        onSubmit={handleSaveRole}
        isLoading={isSaving}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteRole(null); }}
        title="Delete Role"
        description={
          <>
            Are you sure you want to delete <strong>{deleteRole?.name}</strong>?{' '}
            {deleteRole && userCounts[deleteRole.id] > 0 && (
              <span className="text-destructive">This role has {userCounts[deleteRole.id]} assigned users.</span>
            )}
          </>
        }
        confirmLabel="Delete"
        destructive
        isLoading={isSaving}
        onConfirm={handleDeleteRole}
      />
    </div>
  );
}
