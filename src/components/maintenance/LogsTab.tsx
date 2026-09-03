import { format } from 'date-fns';
import { Download, Filter, Terminal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLogStore } from '@/store/useLogStore';
import { SearchInput } from '../ui/SearchInput';

export function LogsTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  
  const logs = useLogStore(state => state.logs);

  const filteredLogs = logs.filter(log => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase()) && !log.source.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const exportLogs = () => {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          System Logs
        </CardTitle>
        <CardDescription>View application events, database actions, and security audits</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search logs..."
            className="flex-1"
          />
          <Select value={filterLevel} onValueChange={setFilterLevel}>
            <SelectTrigger className="w-[150px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportLogs}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>

        </div>

        <div className="flex-1 border rounded-md overflow-hidden flex flex-col bg-muted/30">
          <div className="overflow-y-auto flex-1 p-0">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium w-full">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No logs match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider
                          ${log.level === 'error' ? 'bg-destructive/100/10 text-destructive' : 
                            log.level === 'warning' ? 'bg-warning/10 text-amber-600' : 
                            'bg-info/100/10 text-info'}`}
                        >
                          {log.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">
                        {log.source}
                      </td>
                      <td className="px-4 py-3">
                        {log.message}
                        {log.details && (
                          <p className="text-xs text-muted-foreground mt-1 font-mono">{log.details}</p>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}