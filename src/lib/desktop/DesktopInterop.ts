// src/lib/desktop/DesktopInterop.ts
import { 
  IDesktopInterop, 
  IStorageService, 
  IFileService, 
  IPrintService, 
  IConfigService, 
  IWindowService, 
  IDialogService, 
  INotificationService, 
  IPlatformService,
  SaveFileOptions,
  ReadFileOptions,
  PrintOptions,
  MessageBoxOptions
} from './types';
import { toast } from 'sonner';

// Browser-based fallback implementations (pre-Electron)

class BrowserStorageService implements IStorageService {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }
  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
  async clear(): Promise<void> {
    localStorage.clear();
  }
}

class BrowserFileService implements IFileService {
  async saveFile(content: Blob | string, filename: string, options?: SaveFileOptions): Promise<boolean> {
    try {
      const blob = typeof content === 'string' ? new Blob([content], { type: 'text/plain' }) : content;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      return true;
    } catch (e) {
      console.error('File save failed', e);
      return false;
    }
  }

  async readFile(options?: ReadFileOptions): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (options?.filters && options.filters.length > 0) {
        input.accept = options.filters.map(f => f.extensions.map(ext => '.' + ext).join(',')).join(',');
      }
      
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      
      input.click();
    });
  }

  async getAppPath(name: 'userData' | 'appData' | 'logs' | 'temp'): Promise<string> {
    return `/browser/mock/${name}`;
  }
}

class BrowserPrintService implements IPrintService {
  async print(options?: PrintOptions): Promise<boolean> {
    window.print();
    return true;
  }
  
  async printToPDF(options?: PrintOptions): Promise<Uint8Array | Blob> {
    throw new Error('Not implemented in browser. Use PDF engine directly.');
  }
}

class BrowserConfigService implements IConfigService {
  async getConfig<T>(key: string, defaultValue?: T): Promise<T> {
    const val = localStorage.getItem(`config_${key}`);
    if (val) return JSON.parse(val) as T;
    return defaultValue as T;
  }
  async setConfig<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(`config_${key}`, JSON.stringify(value));
  }
}

class BrowserWindowService implements IWindowService {
  minimize(): void { /* Mock: Window Minimize */ }
  maximize(): void { /* Mock: Window Maximize */ }
  close(): void { /* Mock: Window Close */ }
  async isMaximized(): Promise<boolean> { return window.innerWidth === screen.width; }
  setFullscreen(flag: boolean): void {
    if (flag && !document.fullscreenElement) document.documentElement.requestFullscreen().catch();
    else if (!flag && document.fullscreenElement) document.exitFullscreen().catch();
  }
}

class BrowserDialogService implements IDialogService {
  async showMessageBox(options: MessageBoxOptions): Promise<number> {
    const confirmed = window.confirm(`${options.title || ''}\n\n${options.message}\n${options.detail || ''}`);
    return confirmed ? 0 : 1; // Assuming 0 is the primary "OK/Yes" button
  }
  async showErrorBox(title: string, content: string): Promise<void> {
    window.alert(`${title}\n\n${content}`);
  }
}

class BrowserNotificationService implements INotificationService {
  show(title: string, body: string, type: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    switch (type) {
      case 'error': toast.error(title, { description: body }); break;
      case 'success': toast.success(title, { description: body }); break;
      case 'warning': toast.warning(title, { description: body }); break;
      default: toast.info(title, { description: body }); break;
    }
  }
}

class BrowserPlatformService implements IPlatformService {
  isDesktop(): boolean {
    return false; // Will return true when in Electron
  }
  getOS(): 'windows' | 'mac' | 'linux' | 'web' {
    return 'web';
  }
  getVersion(): string {
    return '4.0.0-web';
  }
}

// Global accessor
import { dbService } from '../../database/DatabaseService';

export const Desktop: IDesktopInterop = {
  storage: new BrowserStorageService(),
  file: new BrowserFileService(),
  print: new BrowserPrintService(),
  config: new BrowserConfigService(),
  window: new BrowserWindowService(),
  dialog: new BrowserDialogService(),
  notification: new BrowserNotificationService(),
  platform: new BrowserPlatformService(),
  database: {
    initialize: async (): Promise<void> => {
      await dbService.initialize();
    }
  }
};

// Check if running in Electron (stub for future integration)
export const isElectron = () => {
  return typeof window !== 'undefined' && (window as any).process && ((window as any).process as any).type;
};
