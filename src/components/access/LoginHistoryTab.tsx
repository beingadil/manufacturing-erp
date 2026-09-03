import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Column, DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { useAccessStore } from '@/store/useAccessStore';
import { LoginHistory } from '@/types/access';
import { SearchInput } from '../ui/SearchInput';

export function LoginHistoryTab() {
  const storeHistory = useAccessStore((state) => state.loginHistory);
  const storeUsers = useAccessStore((state) => state.users);

  const [history, setHistory] = useState<LoginHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setIsLoading(true);
    const joinedHistory = storeHistory.map(h => ({
      ...h,
      profiles: h.user_id ? { name: storeUsers.find(u => u.id === h.user_id)?.name || 'Unknown User' } : null
    }));
    setHistory(joinedHistory);
    setIsLoading(false);
  }, [storeHistory, storeUsers]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return history.filter((h) => {
      const matchesSearch = !s || (h.profiles?.name || '').toLowerCase().includes(s);
      const matchesStatus = !statusFilter || h.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [history, search, statusFilter]);

  const columns: Column<LoginHistory>[] = [
    {
      key: 'profiles.name',
      label: 'User',
      render: (h) => h.profiles?.name || 'Unknown',
    },
    {
      key: 'login_time',
      label: 'Login Time',
      sortable: true,
      render: (h) => new Date(h.login_time).toLocaleString(),
    },
    {
      key: 'logout_time',
      label: 'Logout Time',
      render: (h) => (h.logout_time ? new Date(h.logout_time).toLocaleString() : '-'),
    },
    {
      key: 'status',
      label: 'Status',
      render: (h) => {
        const variant = h.status === 'Active' ? 'default' : h.status === 'Logged Out' ? 'secondary' : 'destructive';
        return <Badge variant={variant}>{h.status}</Badge>;
      },
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold tracking-tight">Login History</h3>
        <p className="text-sm text-muted-foreground">Simple session tracking for users.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by user..."
          className="flex-1 max-w-md"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Logged Out">Logged Out</option>
          <option value="Session Expired">Session Expired</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading login history…
        </div>
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          searchKeys={[]}
          persistKey="login-history"
          emptyStateMessage="No login history found."
        />
      )}
    </div>
  );
}