
import { Activity, Database, FileCode2, ShieldCheck, Terminal } from 'lucide-react';
import { BackupRestoreTab } from '@/components/maintenance/BackupRestoreTab';
import { DataIntegrityTab } from '@/components/maintenance/DataIntegrityTab';
import { LogsTab } from '@/components/maintenance/LogsTab';
import { SystemDiagnosticsTab } from '@/components/maintenance/SystemDiagnosticsTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SystemHealthDashboard } from '@/pages/SystemHealth';

// System Maintenance content — lives inside Settings → System Maintenance.
// Moved here from the standalone /maintenance page so there is one admin surface.
export function SystemMaintenancePanel() {
  return (
    <Tabs defaultValue="backup" className="space-y-4">
      <div className="overflow-x-auto pb-2 scrollbar-hide">
        <TabsList className="inline-flex min-w-full sm:min-w-0 w-auto h-12">
          <TabsTrigger value="backup" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Backup & Restore</span>
          </TabsTrigger>
          <TabsTrigger value="integrity" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Data Integrity</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Database Health</span>
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4" />
            <span className="hidden sm:inline">Diagnostics</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            <span className="hidden sm:inline">Logs</span>
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="backup" className="space-y-4">
        <BackupRestoreTab />
      </TabsContent>

      <TabsContent value="integrity" className="space-y-4">
        <DataIntegrityTab />
      </TabsContent>

      <TabsContent value="health" className="space-y-4">
        <SystemHealthDashboard />
      </TabsContent>

      <TabsContent value="diagnostics" className="space-y-4">
        <SystemDiagnosticsTab />
      </TabsContent>

      <TabsContent value="logs" className="space-y-4">
        <LogsTab />
      </TabsContent>
    </Tabs>
  );
}
