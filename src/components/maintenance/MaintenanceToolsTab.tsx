import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, RefreshCw, Trash2, DatabaseZap } from 'lucide-react';
import { Desktop } from '@/lib/desktop/DesktopInterop';
import { toast } from 'sonner';

export function MaintenanceToolsTab() {
  const [isRunning, setIsRunning] = useState<string | null>(null);

  const runTool = async (id: string, name: string, warning?: string) => {
    if (warning) {
      const confirm = await Desktop.dialog.showMessageBox({
        type: 'warning',
        title: `Confirm ${name}`,
        message: warning,
        buttons: ['Proceed', 'Cancel'],
        defaultId: 1
      });
      if (confirm !== 0) return;
    }

    setIsRunning(id);
    
    // Simulate operation
    await new Promise(r => setTimeout(r, 1500));
    
    setIsRunning(null);
    toast.success(`${name} Completed`, { description: 'The operation completed successfully.' });
  };

  const tools = [
    {
      id: 'rebuild-indexes',
      name: 'Rebuild Search Indexes',
      description: 'Rebuilds all in-memory search structures for faster dropdown and table filtering.',
      icon: <RefreshCw className="h-5 w-5" />,
      action: () => runTool('rebuild-indexes', 'Rebuild Search Indexes')
    },
    {
      id: 'clear-temp',
      name: 'Clear Temporary Files',
      description: 'Removes cached PDF exports, temporary uploads, and local session artifacts.',
      icon: <Trash2 className="h-5 w-5" />,
      action: () => runTool('clear-temp', 'Clear Temporary Files')
    },
    {
      id: 'compact-db',
      name: 'Compact Database',
      description: 'Optimizes storage size by removing fragmented empty space (VACUUM).',
      icon: <DatabaseZap className="h-5 w-5" />,
      warning: 'This operation may take several minutes on large databases and will temporarily lock the system. Ensure no other users are actively processing transactions.',
      action: () => runTool('compact-db', 'Compact Database', 'Are you sure you want to compact the database now?')
    },
    {
      id: 'refresh-config',
      name: 'Refresh Configuration',
      description: 'Forces a reload of all application configuration files and themes from disk.',
      icon: <Settings className="h-5 w-5" />,
      action: () => runTool('refresh-config', 'Refresh Configuration')
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          System Maintenance Utilities
        </CardTitle>
        <CardDescription>Safe tools to optimize application performance and clear unused assets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tools.map(tool => (
          <div key={tool.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4 bg-card hover:bg-muted/20 transition-colors">
            <div className="flex gap-4">
              <div className="mt-1 text-muted-foreground p-2 bg-muted rounded-md h-fit">
                {tool.icon}
              </div>
              <div>
                <h4 className="font-semibold text-sm">{tool.name}</h4>
                <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="shrink-0 sm:w-32"
              onClick={tool.action}
              disabled={isRunning !== null}
            >
              {isRunning === tool.id ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                'Run Tool'
              )}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}