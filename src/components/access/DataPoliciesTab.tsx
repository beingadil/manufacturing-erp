import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { useAccessStore } from '@/store/useAccessStore';
import { DataAccessPolicy } from '@/types/access';

export function DataPoliciesTab() {
  const storePolicies = useAccessStore((state) => state.dataPolicies);
  const storeRoles = useAccessStore((state) => state.roles);

  const [policies, setPolicies] = useState<DataAccessPolicy[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const joinedPolicies = storePolicies.map(p => ({
      ...p,
      roles: p.role_id ? { name: storeRoles.find(r => r.id === p.role_id)?.name || 'Unknown Role' } : null
    }));
    setPolicies(joinedPolicies);
    
    const map: Record<string, string> = {};
    storeRoles.forEach((r) => (map[r.id] = r.name));
    setRoles(map);
    
    setIsLoading(false);
  }, [storePolicies, storeRoles]);

  const columns = [
    { key: 'name', label: 'Policy Name', sortable: true },
    {
      key: 'role',
      label: 'Role',
      render: (p: DataAccessPolicy) => p.roles?.name || roles[p.role_id || ''] || '-',
    },
    { key: 'access_level', label: 'Access Level', sortable: true },
    {
      key: 'max_amount',
      label: 'Max Amount',
      render: (p: DataAccessPolicy) => (p.max_amount ? `≤ ${p.max_amount}` : 'No Limit'),
    },
    {
      key: 'status',
      label: 'Status',
      render: (p: DataAccessPolicy) => (
        <Badge variant={p.status === 'ACTIVE' ? 'default' : 'secondary'}>{p.status}</Badge>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold tracking-tight">Data Access Policies</h3>
        <p className="text-sm text-muted-foreground">Attribute-based access control policies.</p>
      </div>
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading policies...
        </div>
      ) : (
        <DataTable
          data={policies}
          columns={columns}
          searchKeys={['name', 'access_level', 'status']}
          searchPlaceholder="Search policies..."
          persistKey="data-policies"
          emptyStateMessage="No data access policies found."
        />
      )}
    </div>
  );
}