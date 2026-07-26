import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageMeta from '@/components/common/PageMeta';
import { BackupRestoreTab } from '@/components/maintenance/BackupRestoreTab';
import { DataIntegrityTab } from '@/components/maintenance/DataIntegrityTab';
import { SystemHealthDashboard } from './SystemHealth';
import { SystemDiagnosticsTab } from '@/components/maintenance/SystemDiagnosticsTab';
import { MaintenanceToolsTab } from '@/components/maintenance/MaintenanceToolsTab';
import { ArchiveManagerTab } from '@/components/maintenance/ArchiveManagerTab';
import { LogsTab } from '@/components/maintenance/LogsTab';
import { Archive, FileCode2, Database, ShieldCheck, Activity, Wrench, Terminal } from 'lucide-react';

export function SystemMaintenance() {
  return (
    <div className="space-y-6">
      <PageMeta 
        title="System Maintenance | W-RAW ERP" 
        description="Enterprise backup, restore, health, and maintenance tools"
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Maintenance</h1>
        <p className="text-muted-foreground mt-2">
          Manage backups, verify data integrity, and monitor database health.
        </p>
      </div>

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
            <TabsTrigger value="tools" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Tools</span>
            </TabsTrigger>
            <TabsTrigger value="archive" className="flex items-center gap-2">
              <Archive className="h-4 w-4" />
              <span className="hidden sm:inline">Archive</span>
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

        <TabsContent value="tools" className="space-y-4">
          <MaintenanceToolsTab />
        </TabsContent>

        <TabsContent value="archive" className="space-y-4">
          <ArchiveManagerTab />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <LogsTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}