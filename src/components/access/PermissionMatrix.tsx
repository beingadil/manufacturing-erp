import { useMemo } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Permission, Role, RolePermission } from '@/types/access';
import { PERMISSION_ACTIONS, MODULE_ORDER } from '@/lib/access';
import { cn } from '@/lib/utils';

interface PermissionMatrixProps {
  role: Role | null;
  permissions: Permission[];
  rolePermissions: RolePermission[];
  isAdmin: boolean;
  onToggle: (permissionId: string, granted: boolean) => Promise<void>;
  loading?: boolean;
}

export function PermissionMatrix({ role, permissions, rolePermissions, isAdmin, onToggle, loading }: PermissionMatrixProps) {
  const modules = useMemo(() => {
    const set = new Set(permissions.map((p) => p.module));
    return MODULE_ORDER.filter((m) => set.has(m));
  }, [permissions]);

  const hasAction = (module: string, action: string) => {
    const perm = permissions.find((p) => p.module === module && p.action === action);
    if (!perm) return false;
    return rolePermissions.some((rp) => rp.role_id === role?.id && rp.permission_id === perm.id);
  };

  const isLocked = role?.name === 'Admin' || !isAdmin;

  const handleToggle = async (module: string, action: string) => {
    const perm = permissions.find((p) => p.module === module && p.action === action);
    if (!perm || isLocked || !role) return;
    const granted = hasAction(module, action);
    await onToggle(perm.id, !granted);
  };

  if (!role) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a role to view permissions
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight">{role.name} Permissions</h3>
          <p className="text-sm text-muted-foreground mt-1">{role.description || 'No description'}</p>
        </div>
        <Badge variant={role.type === 'Default' ? 'default' : 'secondary'}>
          {role.type}
        </Badge>
      </div>

      {role.name === 'Admin' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary border border-primary/20 text-sm">
          <Shield className="h-4 w-4" />
          The Admin role has full system access and its permissions cannot be changed.
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Saving...
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {modules.map((module) => (
          <Card key={module} className="overflow-hidden">
            <CardHeader className="bg-muted/40 px-4 py-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide">{module}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {PERMISSION_ACTIONS.map((action) => {
                  const exists = permissions.some((p) => p.module === module && p.action === action);
                  if (!exists) return null;
                  const granted = hasAction(module, action);
                  return (
                    <label
                      key={`${module}-${action}`}
                      className={cn(
                        'flex items-center justify-between px-4 py-2.5 text-sm transition-colors',
                        isLocked ? 'opacity-70 cursor-default' : 'hover:bg-muted/40 cursor-pointer'
                      )}
                    >
                      <span className="font-medium">{action}</span>
                      <Checkbox
                        checked={granted}
                        disabled={isLocked}
                        onCheckedChange={() => handleToggle(module, action)}
                      />
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
