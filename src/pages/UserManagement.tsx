import React from 'react';
import { Users, Shield, FileText, History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsersTab } from '@/components/access/UsersTab';
import { RolesTab } from '@/components/access/RolesTab';
import { DataPoliciesTab } from '@/components/access/DataPoliciesTab';
import { AuditLogsTab } from '@/components/access/AuditLogsTab';
import { LoginHistoryTab } from '@/components/access/LoginHistoryTab';

export function UserManagement() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Access Management</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage users, roles, permissions, audit logs, and login history.</p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-xl w-fit h-auto flex-wrap">
          <TabsTrigger value="users" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Shield className="h-4 w-4" />
            Roles & Permissions
          </TabsTrigger>
          <TabsTrigger value="policies" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Shield className="h-4 w-4" />
            Data Policies
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FileText className="h-4 w-4" />
            Audit Logs
          </TabsTrigger>
          <TabsTrigger value="login" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <History className="h-4 w-4" />
            Login History
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <TabsContent value="users" className="m-0 outline-none">
            <UsersTab />
          </TabsContent>
          <TabsContent value="roles" className="m-0 outline-none">
            <RolesTab />
          </TabsContent>
          <TabsContent value="policies" className="m-0 outline-none">
            <DataPoliciesTab />
          </TabsContent>
          <TabsContent value="audit" className="m-0 outline-none">
            <AuditLogsTab />
          </TabsContent>
          <TabsContent value="login" className="m-0 outline-none">
            <LoginHistoryTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
