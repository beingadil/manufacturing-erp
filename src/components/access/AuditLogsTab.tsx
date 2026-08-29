import { Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Column, DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAccessStore } from '@/store/useAccessStore';
import { AuditLog } from '@/types/access';

export function AuditLogsTab() {
  const storeLogs = useAccessStore((state) => state.auditLogs);
  const storeUsers = useAccessStore((state) => state.users);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    setIsLoading(true);
    const joinedLogs = storeLogs.map(log => ({
      ...log,
      profiles: log.user_id ? { name: storeUsers.find(u => u.id === log.user_id)?.name || 'Unknown User' } : null
    }));
    setLogs(joinedLogs);
    setIsLoading(false);
  }, [storeLogs, storeUsers]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return logs.filter((l) => {
      const matchesSearch =
        !s ||
        (l.profiles?.name || '').toLowerCase().includes(s) ||
        l.target_object.toLowerCase().includes(s) ||
        l.action_type.toLowerCase().includes(s) ||
        (l.target_id || '').toLowerCase().includes(s);
      const matchesModule = !moduleFilter || l.target_object === moduleFilter;
      const matchesAction = !actionFilter || l.action_type === actionFilter;
      return matchesSearch && matchesModule && matchesAction;
    });
  }, [logs, search, moduleFilter, actionFilter]);

  const modules = useMemo(() => [...new Set(logs.map((l) => l.target_object))].sort(), [logs]);
  const actions = useMemo(() => [...new Set(logs.map((l) => l.action_type))].sort(), [logs]);

  const columns: Column<AuditLog>[] = [
    {
      key: 'created_at',
      label: 'Date / Time',
      sortable: true,
      render: (l) => new Date(l.created_at).toLocaleString(),
    },
    {
      key: 'user',
      label: 'User',
      render: (l) => l.profiles?.name || 'System',
    },
    {
      key: 'target_object',
      label: 'Module',
      render: (l) => <Badge variant="outline">{l.target_object}</Badge>,
    },
    { key: 'action_type', label: 'Action', sortable: true },
    {
      key: 'target_id',
      label: 'Record ID',
      render: (l) => l.target_id || '-',
    },
    {
      key: 'changes',
      label: 'Details',
      render: (l) => (
        <span className="text-xs text-muted-foreground truncate max-w-[200px] inline-block">
          {l.changes ? JSON.stringify(l.changes) : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold tracking-tight">Audit & Security Logs</h3>
        <p className="text-sm text-muted-foreground">Track changes across the system.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user, module, action, record ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">All Modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">All Actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading audit logs...
        </div>
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          searchKeys={[]}
          persistKey="audit-logs"
          emptyStateMessage="No audit logs found."
        />
      )}
    </div>
  );
}