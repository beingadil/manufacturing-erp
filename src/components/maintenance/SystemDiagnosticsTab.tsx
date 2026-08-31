import { Cpu, Database, FileJson, HardDrive, ListOrdered, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getVersionInfo, IS_PRODUCTION } from '@/config/version';
import { SQLiteStorageAdapter } from '@/database/sqlite/SQLiteStorageAdapter';
import { Desktop } from '@/lib/desktop/DesktopInterop';
import { useERPStore } from '@/store/useERPStore';
import { useSettingsStore } from '@/store/useSettingsStore';

export function SystemDiagnosticsTab() {
  const [dbSize, setDbSize] = useState<string>('Calculating…');

  const state = useERPStore();
  const settings = useSettingsStore();
  
  useEffect(() => {
    // Rough estimation of DB size in memory for browser
    const getDbSize = async () => {
      try {
        // Read through the unified adapter (mirror-aware) so the estimate
        // reflects the actual persisted blob, not the localStorage envelope.
        const erp = await SQLiteStorageAdapter.getItem('erp-storage') || '';
        const access = await SQLiteStorageAdapter.getItem('erp-access-storage') || '';
        const settings = await SQLiteStorageAdapter.getItem('erp-settings') || '';
        const logs = await SQLiteStorageAdapter.getItem('erp-system-logs') || '';
        const bytes = erp.length + access.length + settings.length + logs.length;
        if (bytes > 1024 * 1024) {
          setDbSize(`${(bytes / (1024 * 1024)).toFixed(2)} MB`);
        } else {
          setDbSize(`${(bytes / 1024).toFixed(2)} KB`);
        }
      } catch {
        setDbSize('Unknown');
      }
    };
    getDbSize();
  }, []);

  const stats = [
    { label: 'Company Name', value: settings.dashboardName },
    { label: 'Primary Color', value: settings.primaryColor },
    { label: 'App Version', value: getVersionInfo() },
    { label: 'Environment', value: IS_PRODUCTION ? 'Production' : 'Development' },
    { label: 'OS Platform', value: Desktop.platform.getOS().toUpperCase() },
    { label: 'Database Size (Est.)', value: dbSize },
  ];

  const recordCounts = [
    { label: 'Customers', value: state.customers.length },
    { label: 'Suppliers', value: state.suppliers.length },
    { label: 'Processors', value: state.processors.length },
    { label: 'Raw Materials', value: state.materials.length },
    { label: 'Finished Products', value: state.products.length },
    { label: 'Vouchers', value: state.vouchers.length },
    { label: 'Journal Entries', value: state.journalEntries.length },
    { label: 'Inventory Movements', value: state.inventoryMovements.length },
    { label: 'Purchases', value: state.purchases.length },
    { label: 'Sales', value: state.sales.length },
    { label: 'Processing Dispatches', value: state.processingSends.length },
    { label: 'Processing Receipts', value: state.processingReceipts.length },
  ];

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            System Environment
          </CardTitle>
          <CardDescription>Current execution environment details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.map((stat, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  {i === 2 ? <Cpu className="h-4 w-4" /> : i === 4 ? <HardDrive className="h-4 w-4" /> : <FileJson className="h-4 w-4" />}
                  {stat.label}
                </span>
                <span className="text-sm font-medium">{stat.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Database Statistics
          </CardTitle>
          <CardDescription>Total record counts across all primary tables</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {recordCounts.map((record, i) => (
              <div key={i} className="flex justify-between items-center p-2 bg-muted/30 rounded-md">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <ListOrdered className="h-3 w-3" />
                  {record.label}
                </span>
                <span className="text-sm font-mono font-bold">{record.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}