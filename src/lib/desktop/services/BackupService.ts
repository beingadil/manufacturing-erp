import { Desktop } from '../DesktopInterop';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { format } from 'date-fns';
import { Logger } from '../../../store/useLogStore';

export interface BackupMetadata {
  version: string;
  timestamp: string;
  companyName: string;
  description?: string;
  recordCounts: {
    erp: number;
    access: number;
  };
}

export interface DatabaseBackup {
  metadata: BackupMetadata;
  data: {
    'erp-storage': string | null;
    'erp-access-storage': string | null;
  };
}

export class BackupService {
  async createBackup(description?: string): Promise<Blob> {
    Logger.info('Backup', 'Backup creation started', description);
    try {
      const erpData = await Desktop.storage.getItem('erp-storage');
      const accessData = await Desktop.storage.getItem('erp-access-storage');

    let erpRecordCount = 0;
    let accessRecordCount = 0;

    if (erpData) {
      try {
        const parsed = JSON.parse(erpData);
        if (parsed.state) {
          erpRecordCount += Object.keys(parsed.state).reduce((acc, key) => {
            return acc + (Array.isArray(parsed.state[key]) ? parsed.state[key].length : 0);
          }, 0);
        }
      } catch (e) {}
    }

    if (accessData) {
      try {
        const parsed = JSON.parse(accessData);
        if (parsed.state) {
          accessRecordCount += Object.keys(parsed.state).reduce((acc, key) => {
            return acc + (Array.isArray(parsed.state[key]) ? parsed.state[key].length : 0);
          }, 0);
        }
      } catch (e) {}
    }

    const companyName = useSettingsStore.getState().dashboardName || 'Company';

    const backup: DatabaseBackup = {
      metadata: {
        version: Desktop.platform.getVersion(),
        timestamp: new Date().toISOString(),
        companyName,
        description,
        recordCounts: {
          erp: erpRecordCount,
          access: accessRecordCount
        }
      },
      data: {
        'erp-storage': erpData,
        'erp-access-storage': accessData
      }
    };

    const jsonString = JSON.stringify(backup, null, 2);
    Logger.info('Backup', 'Backup created successfully', `Size: ${(jsonString.length / 1024).toFixed(2)} KB`);
    return new Blob([jsonString], { type: 'application/json' });
  } catch (e: any) {
    Logger.error('Backup', 'Backup creation failed', e.message);
    throw e;
  }
  }

  async validateBackup(fileContent: string): Promise<{ valid: boolean; metadata?: BackupMetadata; error?: string }> {
    try {
      const backup = JSON.parse(fileContent) as DatabaseBackup;
      
      if (!backup.metadata || !backup.data) {
        return { valid: false, error: 'Invalid backup format. Missing metadata or data payload.' };
      }

      if (!backup.metadata.version || !backup.metadata.timestamp) {
        return { valid: false, error: 'Backup metadata is incomplete or corrupted.' };
      }

      if (backup.data['erp-storage'] === undefined || backup.data['erp-access-storage'] === undefined) {
        return { valid: false, error: 'Backup is missing core database containers.' };
      }

      // Basic sanity check: can the internal JSON be parsed?
      if (backup.data['erp-storage']) JSON.parse(backup.data['erp-storage']);
      if (backup.data['erp-access-storage']) JSON.parse(backup.data['erp-access-storage']);

      return { valid: true, metadata: backup.metadata };
    } catch (e: any) {
      return { valid: false, error: `Failed to parse backup file: ${e.message}` };
    }
  }

  async restoreBackup(backup: DatabaseBackup): Promise<boolean> {
    try {
      // Restore the exact strings into storage
      if (backup.data['erp-storage']) {
        await Desktop.storage.setItem('erp-storage', backup.data['erp-storage']);
      } else {
        await Desktop.storage.removeItem('erp-storage');
      }

      if (backup.data['erp-access-storage']) {
        await Desktop.storage.setItem('erp-access-storage', backup.data['erp-access-storage']);
      } else {
        await Desktop.storage.removeItem('erp-access-storage');
      }

      return true;
    } catch (e) {
      console.error('Failed to write backup data to storage', e);
      return false;
    }
  }

  async performManualBackup(description?: string): Promise<boolean> {
    try {
      const blob = await this.createBackup(description);
      const companyName = useSettingsStore.getState().dashboardName || 'ERP';
      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const filename = `${companyName.replace(/[^a-z0-9]/gi, '_')}_Backup_${timestamp}.db`;

      return await Desktop.file.saveFile(blob, filename, {
        filters: [{ name: 'Database Backup', extensions: ['db', 'json'] }]
      });
    } catch (e: any) {
      Desktop.notification.show('Backup Failed', e.message || 'An error occurred during backup', 'error');
      return false;
    }
  }
}

export const backupService = new BackupService();