import React, { useState, useRef } from "react";
import {
  User, Image as ImageIcon, Palette, Bell,
  Save, CheckCircle2, Monitor, Trash2,
  Database, Hash, Info, ExternalLink, RotateCw, DownloadCloud,
  AlertCircle,
  Sparkles, ChevronDown, ChevronRight, Settings as SettingsIcon,
  Users, Wrench
} from "lucide-react";
import { SeedChartOfAccountsButton } from "@/components/settings/SeedChartOfAccountsButton";
import { AccessManagementPanel } from "@/components/access/AccessManagementPanel";
import { SystemMaintenancePanel } from "@/components/maintenance/SystemMaintenancePanel";
import { cn } from "../lib/utils";
import { useSettingsStore } from "../store/useSettingsStore";
import { useERPStore, MODULE_WIPE_KEYS, WIPE_MODULE_LABELS } from "../store/useERPStore";

import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION, BUILD_NUMBER, RELEASE_DATE, DATABASE_SCHEMA_VERSION } from '../config/version';
import { CHANGELOG, type ChangelogEntry } from '../config/changelog';

export function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const [showSavedToast, setShowSavedToast] = useState(false);

  const handleSave = () => {
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const tabs = [
    { id: 'profile', label: 'User Profile', icon: User },
    { id: 'branding', label: 'Dashboard Branding', icon: Palette },
    { id: 'preferences', label: 'Preferences', icon: Bell },
    { id: 'access', label: 'Access Management', icon: Users },
    { id: 'maintenance', label: 'System Maintenance', icon: Wrench },
    { id: 'advanced', label: 'Advanced Features', icon: Monitor },
    { id: 'voucher', label: 'Voucher Numbering', icon: Hash },
    { id: 'about', label: 'About & Updates', icon: Info },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-300 pb-20">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground leading-tight">Settings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your account, branding, security, and application preferences.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-row md:flex-col space-x-2 md:space-x-0 md:space-y-1 overflow-x-auto pb-2 md:pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap md:whitespace-normal",
                  activeTab === tab.id 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {activeTab === tab.id && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
                )}
                <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-primary" : "text-muted-foreground/80")} />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && <ProfileTab onSave={handleSave} showSavedToast={showSavedToast} />}
          {activeTab === 'branding' && <BrandingTab onSave={handleSave} showSavedToast={showSavedToast} />}
          {activeTab === 'preferences' && <PreferencesTab onSave={handleSave} showSavedToast={showSavedToast} />}
          {activeTab === 'access' && <AccessManagementPanel />}
          {activeTab === 'maintenance' && <SystemMaintenancePanel />}
          {activeTab === 'advanced' && <AdvancedTab />}
          {activeTab === 'voucher' && <VoucherNumberingTab onSave={handleSave} showSavedToast={showSavedToast} />}
          {activeTab === 'about' && <AboutUpdatesTab />}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Sub-components for Tabs
// ----------------------------------------------------------------------

function ProfileTab({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  const { userName, userEmail, profilePhoto, setProfile } = useSettingsStore();
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [photo, setPhoto] = useState(profilePhoto);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        alert('File size must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    setProfile(name, email, photo);
    onSave();
  };

  return (
    <SettingsCard title="User Profile" subtitle="Update your personal information and profile photo." icon={User}>
      <div className="space-y-6">
        {/* Photo Upload */}
        <div className="flex items-center gap-6">
          <div className="h-24 w-24 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
            {photo ? (
              <img src={photo} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <User className="h-10 w-10 text-muted-foreground/50" />
            )}
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Profile Photo</h4>
            <p className="text-xs text-muted-foreground">Recommended size: 256x256px. Max size: 2MB.</p>
            <div className="flex items-center gap-3 mt-2">
              <input type="file" accept="image/png, image/jpeg" className="hidden" ref={fileInputRef} onChange={handlePhotoUpload} />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Upload Photo
              </button>
              {photo && (
                <button 
                  onClick={() => setPhoto(null)}
                  className="px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-border/50">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" 
            />
          </div>
        </div>
        
        <SaveFooter onSave={handleSave} showSavedToast={showSavedToast} />
      </div>
    </SettingsCard>
  );
}

function BrandingTab({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  // Subscribe to the WHOLE store (stable object reference), never an inline
  // object-returning selector: `useSettingsStore(state => ({ ... }))` creates a
  // fresh object on every render, which useSyncExternalStore treats as a state
  // change -> infinite re-render -> "Maximum update depth exceeded" crash on
  // this tab. Destructuring the full store is the same stable pattern the other
  // settings tabs use.
  const { dashboardName, tagline, logo, logoPosition, favicon, primaryColor, secondaryColor, setBranding, resetLogo } = useSettingsStore();

  const [local, setLocal] = useState({ dashboardName, tagline, logo, logoPosition, favicon, primaryColor, secondaryColor });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) return alert('Please upload a valid image file');
      if (file.size > 2 * 1024 * 1024) return alert('File size must be less than 2MB');
      
      const reader = new FileReader();
      reader.onloadend = () => setLocal(prev => ({ ...prev, logo: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    setBranding(local);
    onSave();
  };

  return (
    <SettingsCard title="Dashboard Branding & Logo" subtitle="Customize the application name, tagline, logo, and colors." icon={Palette}>
      <div className="space-y-8">
        
        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Dashboard Name</label>
            <input 
              type="text" 
              value={local.dashboardName}
              onChange={e => setLocal(p => ({ ...p, dashboardName: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Tagline / Description</label>
            <input 
              type="text" 
              value={local.tagline}
              onChange={e => setLocal(p => ({ ...p, tagline: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" 
            />
          </div>
        </div>

        {/* Logo Management */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Logo Management</h4>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className={cn(
              "h-32 w-64 rounded-xl border-2 border-dashed border-border flex items-center bg-muted/30 overflow-hidden relative",
              local.logoPosition === 'left' ? 'justify-start px-4' : local.logoPosition === 'right' ? 'justify-end px-4' : 'justify-center'
            )}>
              {local.logo ? (
                <img src={local.logo} alt="Logo" className="max-h-24 max-w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center w-full text-muted-foreground">
                  <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-xs font-medium">No Logo Uploaded</span>
                </div>
              )}
            </div>
            
            <div className="space-y-4 flex-1">
              <div className="flex flex-wrap gap-3">
                <input type="file" accept="image/png, image/jpeg, image/svg+xml" className="hidden" ref={fileInputRef} onChange={handleLogoUpload} />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  Upload Logo
                </button>
                {local.logo && (
                  <button 
                    onClick={() => { setLocal(p => ({ ...p, logo: null })); resetLogo(); }}
                    className="px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Logo Positioning</label>
                <div className="flex gap-2">
                  {['left', 'center', 'right'].map(pos => (
                    <button
                      key={pos}
                      onClick={() => setLocal(p => ({ ...p, logoPosition: pos as any }))}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                        local.logoPosition === pos 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        
        {/* Favicon Management */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Favicon</h4>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="h-16 w-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden relative shrink-0">
              {local.favicon ? (
                <img src={local.favicon} alt="Favicon" className="h-8 w-8 object-contain" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground opacity-50" />
              )}
            </div>
            
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap gap-3">
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/x-icon, image/svg+xml" 
                  className="hidden" 
                  id="favicon-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 500 * 1024) return alert('File size must be less than 500KB');
                      const reader = new FileReader();
                      reader.onloadend = () => setLocal(p => ({ ...p, favicon: reader.result as string }));
                      reader.readAsDataURL(file);
                    }
                  }} 
                />
                <button 
                  onClick={() => document.getElementById('favicon-upload')?.click()}
                  className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  Upload Favicon
                </button>
                {local.favicon && (
                  <button 
                    onClick={() => setLocal(p => ({ ...p, favicon: null }))}
                    className="px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Recommended: 32x32px or 64x64px. Max size: 500KB.</p>
            </div>
          </div>
        </div>

        {/* Colors */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Brand Colors</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Primary Color</label>
              <div className="flex gap-3 items-center">
                <input 
                  type="color" 
                  value={local.primaryColor}
                  onChange={e => setLocal(p => ({ ...p, primaryColor: e.target.value }))}
                  className="h-10 w-20 rounded cursor-pointer border-0 p-0" 
                />
                <code className="text-xs bg-muted px-2 py-1 rounded">{local.primaryColor}</code>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">Secondary Color</label>
              <div className="flex gap-3 items-center">
                <input 
                  type="color" 
                  value={local.secondaryColor}
                  onChange={e => setLocal(p => ({ ...p, secondaryColor: e.target.value }))}
                  className="h-10 w-20 rounded cursor-pointer border-0 p-0" 
                />
                <code className="text-xs bg-muted px-2 py-1 rounded">{local.secondaryColor}</code>
              </div>
            </div>
          </div>
        </div>

        <SaveFooter onSave={handleSave} showSavedToast={showSavedToast} />
      </div>
    </SettingsCard>
  );
}

function PreferencesTab({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  const { theme, setTheme } = useSettingsStore();

  const handleSave = () => {
    onSave();
  };

  return (
    <SettingsCard title="User Preferences" subtitle="Customize your appearance and theme." icon={Bell}>
      <div className="space-y-8">
        
        {/* Appearance */}
        <div>
          <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Appearance</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
              { id: 'system', label: 'System' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as 'light' | 'dark' | 'system')}
                className={cn(
                  "flex items-center justify-center py-3 px-4 rounded-xl border-2 transition-all font-semibold text-sm",
                  theme === t.id 
                    ? "border-primary bg-primary text-primary-foreground" 
                    : "border-border/50 bg-card text-foreground hover:border-primary/50"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <SaveFooter onSave={handleSave} showSavedToast={showSavedToast} />
      </div>
    </SettingsCard>
  );
}

function AdvancedTab() {
  const { isAdmin } = useAuth();
  const wipeAllData = useERPStore(state => state.wipeAllData);
  const wipeModules = useERPStore(state => state.wipeModules);
  const [selectedWipe, setSelectedWipe] = useState<Record<string, boolean>>({});

  const wipeCounts: Record<string, number> = {
    categories: useERPStore(s => s.categories.length),
    materials: useERPStore(s => s.materials.length),
    products: useERPStore(s => s.products.length),
    suppliers: useERPStore(s => s.suppliers.length),
    customers: useERPStore(s => s.customers.length),
    processors: useERPStore(s => s.processors.length),
    purchases: useERPStore(s => s.purchases.length),
    sales: useERPStore(s => s.sales.length),
    processing: useERPStore(s => s.processingSends.length + s.processingReceipts.length + s.processorBills.length),
    inventory: useERPStore(s => s.batches.length + s.inventoryMovements.length),
    accounting: useERPStore(s => s.vouchers.length + s.journalEntries.length + s.accounts.length + s.accountSubtypes.length),
  };

  const selectedIds = Object.entries(selectedWipe)
    .filter(([id, on]) => on && MODULE_WIPE_KEYS[id])
    .map(([id]) => id);

  const handleWipeSelected = () => {
    if (!isAdmin) return alert('Only admins can wipe data');
    if (selectedIds.length === 0) return alert('Select at least one module to wipe.');
    const labels = selectedIds.map(id => WIPE_MODULE_LABELS[id]).join('\n• ');
    if (confirm(`WARNING: This will permanently erase the following module data. Cannot be undone.\n\n• ${labels}\n\nAre you absolutely sure?`)) {
      wipeModules(selectedIds);
      setSelectedWipe({});
      alert('Selected module data has been wiped. The application will now reload.');
      window.location.reload();
    }
  };

  return (
    <SettingsCard title="Advanced Features" subtitle="Backup data, manage integrations, and advanced system configuration." icon={Monitor}>
      <div className="space-y-8">
        
        {/* Demo Data */}
        <div>
          <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
            <Database className="h-4 w-4" /> Demo Data
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-border/50 bg-muted/20 flex flex-col items-start gap-3">
              <div>
                <p className="font-semibold text-sm text-foreground flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Seed ERP Demo Data</p>
                <p className="text-xs text-muted-foreground mt-1">Populate the database with sample categories, materials, products, partners, purchases, sales, and processing data for testing.</p>
              </div>
              <button
                onClick={async () => {
                  const { SeedDataService } = await import('../lib/seed/SeedDataService');
                  await SeedDataService.seedAll();
                  alert('Demo data seeded successfully!');
                }}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Seed Demo Data
              </button>
            </div>
            <div className="p-5 rounded-xl border border-border/50 bg-muted/20 flex flex-col items-start gap-3">
              <div>
                <p className="font-semibold text-sm text-foreground flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Chart of Accounts</p>
                <p className="text-xs text-muted-foreground mt-1">Create a default manufacturing ERP chart of accounts in one click.</p>
              </div>
              <div className="mt-auto w-full">
                <SeedChartOfAccountsButton />
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="space-y-4 pt-6 border-t border-destructive/30">
          <h4 className="text-sm font-bold text-destructive uppercase tracking-wider flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Danger Zone
          </h4>

          {/* Wipe Selected Modules */}
          <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <p className="font-semibold text-sm text-foreground">Wipe Module Data</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Select one or more modules to wipe simultaneously — or one module on its own. Records are permanently deleted. This cannot be undone.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const all: Record<string, boolean> = {};
                    Object.keys(MODULE_WIPE_KEYS).forEach(id => { all[id] = true; });
                    setSelectedWipe(all);
                  }}
                  className="px-3 py-1.5 text-xs font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedWipe({})}
                  className="px-3 py-1.5 text-xs font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(WIPE_MODULE_LABELS).map(([id, label]) => {
                const count = wipeCounts[id] ?? 0;
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedWipe[id] ? 'border-destructive/50 bg-destructive/10' : 'border-border/50 bg-card hover:bg-muted/20'}`}
                  >
                    <input
                      type="checkbox"
                      checked={!!selectedWipe[id]}
                      onChange={e => setSelectedWipe(prev => ({ ...prev, [id]: e.target.checked }))}
                      className="h-4 w-4 rounded border-border accent-destructive"
                    />
                    <span className="text-sm font-medium text-foreground flex-1">{label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{count} records</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {selectedIds.length === 0
                  ? 'No modules selected.'
                  : `${selectedIds.length} module${selectedIds.length > 1 ? 's' : ''} selected — wipe ${selectedIds.map(id => WIPE_MODULE_LABELS[id]).join(', ')}.`}
              </p>
              <button
                onClick={handleWipeSelected}
                disabled={selectedIds.length === 0}
                className="shrink-0 px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" /> Wipe Selected ({selectedIds.length})
              </button>
            </div>
          </div>

          {/* Wipe Everything */}
          <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-semibold text-sm text-foreground">Wipe All ERP Data</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Permanently delete all ERP records (inventory, sales, purchases, accounting, vouchers, etc.) from local storage. This action cannot be undone.
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isAdmin) return alert('Only admins can wipe all data');
                  if (confirm('WARNING: This will permanently erase ALL ERP data stored locally. Are you absolutely sure?')) {
                    wipeAllData();
                    alert('All ERP data has been wiped. The application will now reload.');
                    window.location.reload();
                  }
                }}
                className="shrink-0 px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" /> Wipe All Data
              </button>
            </div>
          </div>
        </div>

      </div>
    </SettingsCard>
  );
}


function VoucherNumberingTab({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  const { voucherYearlyReset, voucherPrefixes, setVoucherPrefixes, setVoucherYearlyReset } = useSettingsStore();
  
  const [localPrefixes, setLocalPrefixes] = useState<Record<string, string>>({ ...voucherPrefixes });
  const [localYearlyReset, setLocalYearlyReset] = useState(voucherYearlyReset);

  const voucherTypes = [
    { type: 'Cash Payment', default: 'CP', example: 'CP-0001' },
    { type: 'Bank Payment', default: 'BP', example: 'BP-0001' },
    { type: 'Cash Receipt', default: 'CR', example: 'CR-0001' },
    { type: 'Bank Receipt', default: 'BR', example: 'BR-0001' },
    { type: 'Journal Voucher', default: 'JV', example: 'JV-0001' },
    { type: 'Purchase Voucher', default: 'PUV', example: 'PUV-0001' },
    { type: 'Sales Voucher', default: 'SV', example: 'SV-0001' },
    { type: 'Processor Bill', default: 'PB', example: 'PB-0001' },
  ];

  const handleSave = () => {
    setVoucherPrefixes(localPrefixes);
    setVoucherYearlyReset(localYearlyReset);
    onSave();
  };

  return (
    <SettingsCard title="Voucher Numbering" subtitle="Configure custom prefixes per voucher type and toggle yearly sequence reset." icon={Hash}>
      <div className="space-y-8">
        
        {/* Yearly Reset Toggle */}
        <div className="flex items-center justify-between p-5 rounded-xl border border-border/50 bg-muted/20">
          <div>
            <p className="font-semibold text-sm text-foreground">Yearly Sequence Reset</p>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, voucher numbers reset to 0001 at the start of each year 
              (e.g. CP-0001 in 2027 despite 500 CPs in 2026).
            </p>
          </div>
          <Toggle checked={localYearlyReset} onChange={setLocalYearlyReset} />
        </div>

        {/* Prefix Editor */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Custom Prefixes</h4>
            <button
              onClick={() => {
                const defaults: Record<string, string> = {};
                voucherTypes.forEach(v => { defaults[v.type] = v.default; });
                setLocalPrefixes(defaults);
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Reset to Defaults
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {voucherTypes.map(vt => (
              <div key={vt.type} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{vt.type}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={localPrefixes[vt.type] ?? vt.default}
                      onChange={e => setLocalPrefixes(prev => ({ ...prev, [vt.type]: e.target.value.toUpperCase() }))}
                      className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-mono font-bold text-foreground text-center focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors uppercase"
                      maxLength={5}
                    />
                    <span className="text-sm font-mono text-muted-foreground">-0001</span>
                    <span className="text-xs text-muted-foreground/60 ml-auto">e.g. {vt.example}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview Example */}
        <div className="p-5 rounded-xl bg-primary/5 border border-primary/20">
          <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Hash className="h-4 w-4 text-primary" /> Live Preview
          </h4>
          <div className="flex flex-wrap gap-4">
            {voucherTypes.slice(0, 6).map(vt => (
              <div key={vt.type} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">{vt.type}:</span>
                <code className="px-2 py-0.5 bg-background rounded border border-border text-xs font-mono font-bold text-primary">
                  {(localPrefixes[vt.type] || vt.default).toUpperCase()}-0001
                </code>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {localYearlyReset 
              ? 'Sequence resets to 0001 each year. Next voucher gets the next number in sequence.'
              : 'Sequence continues across all years. No yearly reset.'}
          </p>
        </div>

        <SaveFooter onSave={handleSave} showSavedToast={showSavedToast} />
      </div>
    </SettingsCard>
  );
}

function AboutUpdatesTab() {
  const [updateStatus, setUpdateStatus] = useState<{
    status: string;
    message: string;
    version?: string;
    percent?: number;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronDB;

  const handleCheckForUpdates = async () => {
    setChecking(true);
    setUpdateStatus({ status: 'checking', message: 'Checking for updates...' });

    try {
      if ((window as any).electronDB?.checkForUpdates) {
        await (window as any).electronDB.checkForUpdates();
        // The update status will arrive via onUpdateStatus callback
        // Show a pending state for now
        setTimeout(() => {
          setChecking(false);
        }, 3000);
      } else {
        setUpdateStatus({ status: 'error', message: 'Update checker not available outside desktop app.' });
        setChecking(false);
      }
    } catch (e: any) {
      setUpdateStatus({ status: 'error', message: e.message || 'Update check failed' });
      setChecking(false);
    }
  };

  // Listen for update status from main process
  React.useEffect(() => {
    if (isElectron && (window as any).electronDB?.onUpdateStatus) {
      const unsubscribe = (window as any).electronDB.onUpdateStatus((status: any) => {
        setUpdateStatus({
          status: status.status,
          message: status.message,
          version: status.info?.version,
          percent: status.percent,
        });
        if (status.status !== 'checking' && status.status !== 'downloading') {
          setChecking(false);
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [isElectron]);

  return (
    <SettingsCard title="About & Updates" subtitle="Version information and automatic update management." icon={Info}>
      <div className="space-y-8">
        
        {/* Version Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl border border-border/50 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">App Version</p>
            <p className="text-2xl font-bold text-foreground">
              v{APP_VERSION}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (Build {BUILD_NUMBER})
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">Released {RELEASE_DATE}</p>
          </div>
          <div className="p-5 rounded-xl border border-border/50 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Schema Version</p>
            <p className="text-2xl font-bold text-foreground">{DATABASE_SCHEMA_VERSION}</p>
            <p className="text-xs text-muted-foreground mt-2">Database schema version</p>
          </div>
        </div>

        {/* What's New — Changelog */}
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> What's New
          </h4>
          <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
            {CHANGELOG.map((entry, idx) => (
              <ChangelogAccordionItem
                key={entry.version}
                entry={entry}
                isCurrent={entry.version === APP_VERSION}
                showTopBorder={idx > 0}
              />
            ))}
          </div>
        </div>

        {/* Electron Detection */}
        {!isElectron && (
          <div className="p-5 rounded-xl border border-warning/30 bg-warning/10">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-warning shrink-0" />
              <div>
                <p className="text-sm font-semibold text-warning">Desktop App Required</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-updates are only available in the desktop version. 
                  You are viewing this in a browser — download the app to receive automatic updates.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Update Check Section */}
        {isElectron && (
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <DownloadCloud className="h-4 w-4" /> Automatic Updates
            </h4>

            {/* Check for Updates Button */}
            <div className="p-5 rounded-xl border border-border/50 bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground">Check for Updates</p>
                <p className="text-xs text-muted-foreground mt-1">
                  The app automatically checks for updates on startup. Use this button to check manually.
                </p>
              </div>
              <button
                onClick={handleCheckForUpdates}
                disabled={checking}
                className="px-5 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
              >
                {checking ? (
                  <>
                    <RotateCw className="h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <DownloadCloud className="h-4 w-4" />
                    Check for Updates
                  </>
                )}
              </button>
            </div>

            {/* Update Status */}
            {updateStatus && (
              <div className={`p-4 rounded-xl border ${
                updateStatus.status === 'up-to-date' 
                  ? 'border-success/30 bg-success/10'
                  : updateStatus.status === 'available' || updateStatus.status === 'downloaded'
                  ? 'border-info/30 bg-info/10'
                  : updateStatus.status === 'downloading'
                  ? 'border-info/30 bg-info/10'
                  : updateStatus.status === 'error'
                  ? 'border-destructive/30 bg-destructive/10'
                  : 'border-border/50 bg-muted/20'
              }`}>
                <div className="flex items-center gap-3">
                  {updateStatus.status === 'checking' && <RotateCw className="h-5 w-5 text-info animate-spin shrink-0" />}
                  {updateStatus.status === 'up-to-date' && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
                  {updateStatus.status === 'available' && <DownloadCloud className="h-5 w-5 text-info shrink-0" />}
                  {updateStatus.status === 'downloaded' && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
                  {updateStatus.status === 'downloading' && <RotateCw className="h-5 w-5 text-info animate-spin shrink-0" />}
                  {updateStatus.status === 'error' && <AlertCircle className="h-5 w-5 text-destructive shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${
                      updateStatus.status === 'up-to-date' ? 'text-success' :
                      updateStatus.status === 'error' ? 'text-destructive' :
                      'text-foreground'
                    }`}>
                      {updateStatus.message}
                    </p>
                    {updateStatus.status === 'downloading' && typeof updateStatus.percent === 'number' && (
                      <div className="mt-2 w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${updateStatus.percent}%` }}
                        />
                      </div>
                    )}
                    {updateStatus.status === 'available' && updateStatus.version && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Version {updateStatus.version} is downloading in the background.
                        You'll be notified when it's ready to install.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Documentation Links */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <ExternalLink className="h-4 w-4" /> Resources
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                // Open the GitHub repo for releases
                handleCheckForUpdates();
              }}
              className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors"
            >
              <DownloadCloud className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Check for Updates</p>
                <p className="text-xs text-muted-foreground">Download the latest version</p>
              </div>
            </a>

          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

// ----------------------------------------------------------------------
// Shared UI Components
// ----------------------------------------------------------------------

// Accordion row for the in-app changelog. Lives in its own component so each
// entry owns its useState (hooks must not be called inside .map callbacks).
function ChangelogAccordionItem({
  entry,
  isCurrent,
  showTopBorder,
}: {
  entry: ChangelogEntry;
  isCurrent: boolean;
  showTopBorder: boolean;
}) {
  const [open, setOpen] = useState(isCurrent);

  return (
    <div className={showTopBorder ? 'border-t border-border/50' : ''}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold",
            isCurrent
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground border border-border"
          )}>
            v{entry.version}
          </div>
          <div className="min-w-0">
            <p className={cn("text-sm font-semibold truncate", isCurrent ? "text-foreground" : "text-foreground/80")}>
              {entry.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {entry.date}
              {isCurrent && <span className="ml-2 text-xs font-medium text-primary">Current version</span>}
            </p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {entry.sections.map((section) => (
            <div key={section.title}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {section.title}
              </p>
              <ul className="space-y-1.5">
                {section.items.map((item, i) => (
                  <li key={i} className="text-sm text-foreground/80 flex gap-2">
                    <span className="text-primary mt-0.5 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SaveFooter({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  return (
    <div className="pt-6 mt-8 flex items-center justify-end gap-4 border-t border-border/50">
      {showSavedToast && (
        <span className="flex items-center gap-2 text-sm font-medium text-success animate-in fade-in slide-in-from-right-4">
          <CheckCircle2 className="h-4 w-4" />
          Changes saved successfully
        </span>
      )}
      <button 
        onClick={onSave}
        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-primary-foreground bg-primary rounded-xl shadow-md hover:bg-primary/90 transition-all active:scale-[0.98]"
      >
        <Save className="h-4 w-4" />
        Save Changes
      </button>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean, onChange: (c: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-11 h-6 rounded-full transition-colors duration-150 relative flex items-center px-1 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <div 
        className={cn(
          "w-4 h-4 rounded-full bg-background transition-transform transform shadow-sm",
          checked ? "translate-x-5" : "translate-x-0"
        )} 
      />
    </button>
  );
}

// Shared settings card — single chrome definition so every tab in Settings
// renders the same card anatomy (per the component-system minimal pattern:
// token palette, radius hierarchy, no decorative gradient).
function SettingsCard({
  title,
  subtitle,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="p-6 border-b border-border/50 bg-muted/40 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-foreground leading-tight">{title}</h3>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
