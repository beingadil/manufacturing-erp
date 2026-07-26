// src/lib/desktop/types.ts
export interface IStorageService {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface IFileService {
  saveFile(content: Blob | string, filename: string, options?: SaveFileOptions): Promise<boolean>;
  readFile(options?: ReadFileOptions): Promise<string | null>;
  getAppPath(name: 'userData' | 'appData' | 'logs' | 'temp'): Promise<string>;
}

export interface SaveFileOptions {
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

export interface ReadFileOptions {
  filters?: { name: string; extensions: string[] }[];
}

export interface IPrintService {
  print(options?: PrintOptions): Promise<boolean>;
  printToPDF(options?: PrintOptions): Promise<Uint8Array | Blob>;
}

export interface PrintOptions {
  silent?: boolean;
  printBackground?: boolean;
  deviceName?: string;
}

export interface IConfigService {
  getConfig<T>(key: string, defaultValue?: T): Promise<T>;
  setConfig<T>(key: string, value: T): Promise<void>;
}

export interface IWindowService {
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  setFullscreen(flag: boolean): void;
}

export interface IDialogService {
  showMessageBox(options: MessageBoxOptions): Promise<number>;
  showErrorBox(title: string, content: string): Promise<void>;
}

export interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning';
  buttons?: string[];
  defaultId?: number;
  title?: string;
  message: string;
  detail?: string;
}

export interface INotificationService {
  show(title: string, body: string, type?: 'info' | 'warning' | 'error' | 'success'): void;
}

export interface IPlatformService {
  isDesktop(): boolean;
  getOS(): 'windows' | 'mac' | 'linux' | 'web';
  getVersion(): string;
}

export interface IDesktopInterop {
  storage: IStorageService;
  file: IFileService;
  print: IPrintService;
  config: IConfigService;
  window: IWindowService;
  dialog: IDialogService;
  notification: INotificationService;
  platform: IPlatformService;
  database?: {
    initialize: () => Promise<void>;
  };
}
