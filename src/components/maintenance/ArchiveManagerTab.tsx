import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Archive, Info } from 'lucide-react';

export function ArchiveManagerTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-primary" />
          Archive Manager
        </CardTitle>
        <CardDescription>Manage your historical database backups and restore points</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
          <Info className="h-10 w-10 mb-4 opacity-50 text-primary" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Local Filesystem Strategy</h3>
          <p className="max-w-md text-sm">
            In the current version, database backups are downloaded directly to your local file system. 
            Archive management and automatic backup retention policies will be enabled when the native desktop container is fully active.
          </p>
          <div className="mt-6 flex gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              Phase 10 Architecture
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}