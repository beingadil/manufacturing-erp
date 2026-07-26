import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { DatabaseBackup, backupService } from '@/lib/desktop/services/BackupService';
import { Desktop } from '@/lib/desktop/DesktopInterop';
import { format } from 'date-fns';
import { DownloadCloud, UploadCloud, AlertTriangle, CheckCircle2, ShieldAlert, FileDown, FileUp, HardDrive } from 'lucide-react';
import { toast } from 'sonner';

export function BackupRestoreTab() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupDescription, setBackupDescription] = useState('');
  
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; metadata?: any; error?: string } | null>(null);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const success = await backupService.performManualBackup(backupDescription);
      if (success) {
        toast.success('Backup Successful', { description: 'The database backup has been saved.' });
        setBackupDescription('');
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleSelectRestoreFile = async () => {
    try {
      const content = await Desktop.file.readFile({
        filters: [{ name: 'Database Backup', extensions: ['db', 'json'] }]
      });
      
      if (!content) return; // User cancelled
      
      setSelectedFileName('Selected Backup File');
      setSelectedFileContent(content);
      
      // Validate immediately
      const result = await backupService.validateBackup(content);
      setValidationResult(result);
    } catch (e: any) {
      toast.error('File Read Failed', { description: e.message });
    }
  };

  const handleExportBackup = async () => {
    if (!(window as any).electronDB?.exportBackup) {
      toast.error('Not available', { description: 'Export backup is only available in the desktop app.' });
      return;
    }
    setIsExporting(true);
    try {
      const result = await (window as any).electronDB.exportBackup();
      if (result.canceled) return;
      if (result.success) {
        toast.success('Backup Exported', {
          description: `Database saved to: ${result.path}`
        });
      } else {
        toast.error('Export Failed', { description: result.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Export Failed', { description: e.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBackup = async () => {
    if (!(window as any).electronDB?.importBackup) {
      toast.error('Not available', { description: 'Import backup is only available in the desktop app.' });
      return;
    }

    const confirm = await Desktop.dialog.showMessageBox({
      type: 'warning',
      title: 'Import Database Backup',
      message: 'This will REPLACE ALL current data with the backup file.',
      detail: 'A safety backup of your current database will be created automatically before importing.\n\nThe application will reload after a successful import. Are you sure?',
      buttons: ['Yes, import backup', 'Cancel'],
      defaultId: 1
    });

    if (confirm !== 0) return;

    setIsImporting(true);
    try {
      const result = await (window as any).electronDB.importBackup();
      if (result.canceled) return;
      if (result.success) {
        await Desktop.dialog.showMessageBox({
          type: 'info',
          title: 'Import Complete',
          message: 'The database has been successfully imported.',
          detail: 'The application will now reload to apply the changes.',
          buttons: ['OK']
        });
        window.location.reload();
      } else {
        toast.error('Import Failed', { description: result.error || 'Unknown error' });
      }
    } catch (e: any) {
      toast.error('Import Failed', { description: e.message });
    } finally {
      setIsImporting(false);
    }
  };

  const handleRestore = async () => {
    if (!validationResult?.valid || !selectedFileContent) return;

    const confirm1 = await Desktop.dialog.showMessageBox({
      type: 'warning',
      title: 'Confirm Restore',
      message: 'You are about to restore the database from a backup file.',
      detail: 'This will OVERWRITE your current database. All unsaved changes will be lost.\n\nAre you absolutely sure you want to proceed?',
      buttons: ['Yes, proceed to restore', 'Cancel'],
      defaultId: 1
    });

    if (confirm1 !== 0) return;

    // Force safety backup
    const confirm2 = await Desktop.dialog.showMessageBox({
      type: 'question',
      title: 'Safety Backup',
      message: 'Would you like to create a safety backup of your CURRENT data before restoring?',
      buttons: ['Yes, create safety backup', 'No, skip safety backup'],
      defaultId: 0
    });

    if (confirm2 === 0) {
      const safetySaved = await backupService.performManualBackup('Auto-Safety Backup before Restore');
      if (!safetySaved) {
        const proceedAnyway = await Desktop.dialog.showMessageBox({
          type: 'warning',
          title: 'Safety Backup Failed',
          message: 'The safety backup was cancelled or failed.',
          detail: 'Do you still want to proceed with the restore without a safety backup?',
          buttons: ['No, abort restore', 'Yes, proceed anyway'],
          defaultId: 0
        });
        if (proceedAnyway !== 1) return;
      }
    }

    setIsRestoring(true);
    try {
      const backupObj = JSON.parse(selectedFileContent) as DatabaseBackup;
      const success = await backupService.restoreBackup(backupObj);
      if (success) {
        await Desktop.dialog.showMessageBox({
          type: 'info',
          title: 'Restore Complete',
          message: 'The database has been successfully restored.',
          detail: 'The application will now reload to apply the changes.',
          buttons: ['OK']
        });
        window.location.reload();
      } else {
        toast.error('Restore Failed', { description: 'An error occurred while writing data to storage.' });
      }
    } catch (e: any) {
      toast.error('Restore Failed', { description: e.message });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DownloadCloud className="h-5 w-5 text-primary" />
            Create Backup
          </CardTitle>
          <CardDescription>
            Download a full copy of the ERP database. This includes all accounting, inventory, and configuration data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="backupDesc">Description (Optional)</Label>
            <Input 
              id="backupDesc" 
              placeholder="e.g. Before closing financial year" 
              value={backupDescription}
              onChange={e => setBackupDescription(e.target.value)}
              disabled={isBackingUp}
            />
          </div>
          <div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground flex gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
            <p>Backups are stored locally on your device. Please ensure you keep them in a safe, secure location.</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleBackup} disabled={isBackingUp} className="w-full">
            {isBackingUp ? 'Creating Backup...' : 'Generate Backup File'}
          </Button>
        </CardFooter>
      </Card>

      <Card className="flex flex-col border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <UploadCloud className="h-5 w-5" />
            Restore Database
          </CardTitle>
          <CardDescription>
            Restore the ERP from a previously saved backup file.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-4">
          <Button 
            variant="outline" 
            onClick={handleSelectRestoreFile} 
            disabled={isRestoring}
            className="w-full"
          >
            Select Backup File
          </Button>

          {validationResult && (
            <div className={`p-4 rounded-lg text-sm border ${validationResult.valid ? 'bg-success/100/10 border-success/20 text-success ' : 'bg-destructive/100/10 border-destructive/20 text-destructive'}`}>
              {validationResult.valid ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" /> Valid Backup File Detected
                  </div>
                  <ul className="space-y-1 mt-2 list-disc list-inside pl-4 text-xs opacity-90">
                    <li>Company: {validationResult.metadata.companyName}</li>
                    <li>Timestamp: {format(new Date(validationResult.metadata.timestamp), 'PPpp')}</li>
                    <li>Version: {validationResult.metadata.version}</li>
                    <li>ERP Records: {validationResult.metadata.recordCounts.erp}</li>
                    <li>Access Records: {validationResult.metadata.recordCounts.access}</li>
                  </ul>
                  {validationResult.metadata.description && (
                    <p className="mt-2 text-xs italic">"{validationResult.metadata.description}"</p>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold block mb-1">Validation Failed</span>
                    {validationResult.error}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button 
            variant="destructive" 
            onClick={handleRestore} 
            disabled={!validationResult?.valid || isRestoring} 
            className="w-full"
          >
            {isRestoring ? 'Restoring Database...' : 'Restore from Backup'}
          </Button>
        </CardFooter>
      </Card>

      {/* ─── External File Export/Import (Full SQLite) ──────────────────── */}
      <div className="md:col-span-2">
        <div className="relative">
          <Separator className="my-4" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-4 text-xs text-muted-foreground font-medium">
            PORTABLE FILE TRANSFER
          </span>
        </div>
        <p className="text-xs text-muted-foreground text-center mb-6 mt-2">
          Export the full database as a SQLite file to copy to another computer. Import a backup from another installation.
        </p>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <FileDown className="h-5 w-5" />
            Export Backup to File
          </CardTitle>
          <CardDescription>
            Save a full SQLite database backup to any location on your computer. Copy this file to another computer to migrate or restore your data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium text-primary">
              <HardDrive className="h-4 w-4" />
              Portable SQLite Backup
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside pl-2">
              <li>Full database with all tables and records</li>
              <li>Native SQLite format — open with any SQLite tool</li>
              <li>Compatible across different computers</li>
              <li>File is saved to a location you choose</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            id="export-backup-btn"
            onClick={handleExportBackup}
            disabled={isExporting}
            variant="default"
            className="w-full gap-2"
          >
            <FileDown className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export Database Backup'}
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-amber-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <FileUp className="h-5 w-5" />
            Import Backup from File
          </CardTitle>
          <CardDescription>
            Restore your entire database from a SQLite backup file. This will replace ALL current data with the backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">This will replace all current data</p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
                  A safety backup of your current database is automatically created before importing. The app will reload after a successful import.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            id="import-backup-btn"
            onClick={handleImportBackup}
            disabled={isImporting}
            variant="outline"
            className="w-full gap-2 border-amber-400/50 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
          >
            <FileUp className="h-4 w-4" />
            {isImporting ? 'Importing...' : 'Import Database Backup'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}