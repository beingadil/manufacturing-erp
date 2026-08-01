import React, { useState, useRef } from "react";
import { 
  User, Image as ImageIcon, Palette, Bell, Shield, Download, Upload,
  Save, CheckCircle2, Lock, Smartphone, Key, Globe, Clock, Monitor, Trash2,
  Database, Activity, Hash, Info, ExternalLink, RotateCw, DownloadCloud,
  AlertCircle, FileDown, FileUp, HardDrive, AlertTriangle
} from "lucide-react";
import { SeedChartOfAccountsButton } from "@/components/settings/SeedChartOfAccountsButton";
import { cn } from "../lib/utils";
import { useSettingsStore } from "../store/useSettingsStore";
import { useERPStore } from "../store/useERPStore";
import { useNavigate } from "react-router-dom";

import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION, BUILD_NUMBER, RELEASE_DATE, DATABASE_SCHEMA_VERSION } from '../config/version';
import { Loader2 } from 'lucide-react';

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
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'backup', label: 'Backup & Restore', icon: Database },
    { id: 'advanced', label: 'Advanced Features', icon: Monitor },
    { id: 'voucher', label: 'Voucher Numbering', icon: Hash },
    { id: 'health', label: 'System Health', icon: Activity },
    { id: 'about', label: 'About & Updates', icon: Info },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-500 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage your account, branding, security, and application preferences.</p>
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
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all whitespace-nowrap md:whitespace-normal",
                  activeTab === tab.id 
                    ? "bg-primary text-primary-foreground shadow-md" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-primary-foreground/80" : "text-muted-foreground/80")} />
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
          {activeTab === 'security' && <SecurityTab onSave={handleSave} showSavedToast={showSavedToast} />}
          {activeTab === 'backup' && <BackupTab />}
          {activeTab === 'advanced' && <AdvancedTab onSave={handleSave} showSavedToast={showSavedToast} />}
          {activeTab === 'voucher' && <VoucherNumberingTab onSave={handleSave} showSavedToast={showSavedToast} />}
          {activeTab === 'health' && <HealthTab />}
          {activeTab === 'about' && <AboutUpdatesTab />}
        </div>
      </div>
    </div>
  );
}

function HealthTab() {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">System Health Check</h3>
        <p className="text-sm text-muted-foreground mt-1">Run diagnostics and verify database integrity.</p>
      </div>
      <div className="p-6 sm:p-8">
        <div className="p-6 bg-muted/30 rounded-xl border border-border flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-foreground">Full Diagnostics</h4>
            <p className="text-sm text-muted-foreground mt-1">Verify database integrity, orphan records, and voucher balances.</p>
          </div>
          <button 
            onClick={() => navigate('/settings/health')}
            className="px-6 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <Activity className="h-4 w-4" /> Run System Check
          </button>
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
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">User Profile</h3>
        <p className="text-sm text-muted-foreground mt-1">Update your personal information and profile photo.</p>
      </div>
      <div className="p-6 sm:p-8 space-y-6">
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
    </div>
  );
}

function BrandingTab({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  const branding = useSettingsStore(state => ({
    dashboardName: state.dashboardName,
    tagline: state.tagline,
    logo: state.logo,
    logoPosition: state.logoPosition,
    favicon: state.favicon,
    primaryColor: state.primaryColor,
    secondaryColor: state.secondaryColor
  }));
  const setBranding = useSettingsStore(state => state.setBranding);
  const resetLogo = useSettingsStore(state => state.resetLogo);
  
  const [local, setLocal] = useState(branding);
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
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">Dashboard Branding & Logo</h3>
        <p className="text-sm text-muted-foreground mt-1">Customize the application name, tagline, logo, and colors.</p>
      </div>
      <div className="p-6 sm:p-8 space-y-8">
        
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
    </div>
  );
}

function PreferencesTab({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  const { theme, setTheme } = useSettingsStore();
  const { language, timezone, notificationsEnabled, privacyMode, setPreferences } = useSettingsStore();
  
  const [local, setLocal] = useState({ language, timezone, notificationsEnabled, privacyMode });

  const handleSave = () => {
    setPreferences(local);
    onSave();
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">User Preferences</h3>
        <p className="text-sm text-muted-foreground mt-1">Customize your experience, notifications, and language settings.</p>
      </div>
      <div className="p-6 sm:p-8 space-y-8">
        
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

        {/* Region & Language */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Region & Language</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" /> Language
              </label>
              <select 
                value={local.language}
                onChange={e => setLocal(p => ({ ...p, language: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="ur-PK">Urdu (Pakistan)</option>
                <option value="zh-CN">Chinese (Simplified)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Timezone
              </label>
              <select 
                value={local.timezone}
                onChange={e => setLocal(p => ({ ...p, timezone: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              >
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="Asia/Karachi">Asia/Karachi (PKT)</option>
                <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Notifications & Privacy</h4>
          
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20">
            <div>
              <p className="font-semibold text-sm text-foreground">Email & In-App Notifications</p>
              <p className="text-xs text-muted-foreground mt-1">Receive alerts for low stock and system updates.</p>
            </div>
            <Toggle 
              checked={local.notificationsEnabled} 
              onChange={(c) => setLocal(p => ({ ...p, notificationsEnabled: c }))} 
            />
          </div>
          
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20">
            <div>
              <p className="font-semibold text-sm text-foreground">Enhanced Privacy Mode</p>
              <p className="text-xs text-muted-foreground mt-1">Hide sensitive financial figures by default.</p>
            </div>
            <Toggle 
              checked={local.privacyMode} 
              onChange={(c) => setLocal(p => ({ ...p, privacyMode: c }))} 
            />
          </div>
        </div>

        <SaveFooter onSave={handleSave} showSavedToast={showSavedToast} />
      </div>
    </div>
  );
}

function SecurityTab({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  const { twoFactorEnabled, setTwoFactor } = useSettingsStore();
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handlePasswordChange = () => {
    if (!password || !newPassword) return alert('Please enter both passwords');
    alert('Password changed successfully (Mocked)');
    setPassword('');
    setNewPassword('');
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">Security Settings</h3>
        <p className="text-sm text-muted-foreground mt-1">Manage your password, 2FA, devices, and API keys.</p>
      </div>
      <div className="p-6 sm:p-8 space-y-8">
        
        {/* Change Password */}
        <div>
          <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
            <Lock className="h-4 w-4" /> Password
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input 
              type="password" 
              placeholder="Current Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" 
            />
            <input 
              type="password" 
              placeholder="New Password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" 
            />
          </div>
          <button 
            onClick={handlePasswordChange}
            className="mt-4 px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Update Password
          </button>
        </div>

        {/* 2FA */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> Two-Factor Authentication
          </h4>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20">
            <div>
              <p className="font-semibold text-sm text-foreground">Authenticator App</p>
              <p className="text-xs text-muted-foreground mt-1">Use an app like Google Authenticator or Authy.</p>
            </div>
            <Toggle 
              checked={twoFactorEnabled} 
              onChange={setTwoFactor} 
            />
          </div>
        </div>

        {/* Mocked Sections */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Key className="h-4 w-4" /> API Keys & Devices
          </h4>
          <div className="p-4 rounded-xl border border-border bg-card text-center py-8">
            <p className="text-sm text-muted-foreground">Active Devices: 1 (MacBook Pro)</p>
            <button className="mt-4 px-4 py-2 text-sm font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors">
              Manage Devices
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function BackupTab() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadBackups = async () => {
    setLoading(true);
    try {
      if ((window as any).electronDB?.listBackups) {
        const res = await (window as any).electronDB.listBackups();
        if (res.success) setBackups(res.data || []);
      }
    } catch { /* not in electron */ }
    setLoading(false);
  };

  const handleCreateBackup = async () => {
    setBackingUp(true);
    try {
      if ((window as any).electronDB?.backup) {
        await (window as any).electronDB.backup();
        await loadBackups();
      }
    } catch {}
    setBackingUp(false);
  };

  const handleRestore = async (backupPath: string) => {
    if (!confirm('WARNING: Restoring will replace ALL current data with the backup. Cannot be undone.\n\nA safety backup will be created first.')) return;
    setRestoring(true);
    try {
      const db = (window as any).electronDB;
      if (db?.backup) await db.backup();
      if (db?.restore) {
        const res = await db.restore(backupPath);
        if (res.success) {
          alert('Database restored successfully. The application will now reload.');
          window.location.reload();
        } else {
          alert(`Restore failed: ${res.error}`);
        }
      }
    } catch (e: any) {
      alert(`Restore failed: ${e.message}`);
    }
    setRestoring(false);
  };

  const handleExportBackup = async () => {
    const db = (window as any).electronDB;
    if (!db?.exportBackup) {
      alert('Export backup is only available in the desktop app.');
      return;
    }
    setExporting(true);
    try {
      const result = await db.exportBackup();
      if (result.canceled) return;
      if (result.success) {
        const m = result.manifest;
        alert(
          `Unified backup exported successfully!\n\n` +
          `File: ${result.path}\n` +
          (m ? `App v${m.appVersion} · ${m.stores?.length ?? 0} store(s) · ${new Date(m.createdAt).toLocaleString()}` : '')
        );
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
    setExporting(false);
  };

  const handleImportBackup = async () => {
    const db = (window as any).electronDB;
    if (!db?.importBackup) {
      alert('Import backup is only available in the desktop app.');
      return;
    }
    if (!confirm('WARNING: Importing will REPLACE ALL current data.\n\nA safety backup will be created first.\n\nAre you sure?')) return;
    setImporting(true);
    try {
      const result = await db.importBackup();
      if (result.canceled) return;
      if (result.success) {
        const m = result.manifest;
        alert(
          `Database imported successfully. The application will now reload.\n\n` +
          (m ? `Manifest: v${m.appVersion} · ${m.stores?.length ?? 0} store(s) · ${new Date(m.createdAt).toLocaleString()}` : '')
        );
        window.location.reload();
      } else {
        alert(`Import failed: ${result.error}`);
      }
    } catch (e: any) {
      alert(`Import failed: ${e.message}`);
    }
    setImporting(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch { return iso; }
  };

  React.useEffect(() => { loadBackups(); }, []);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">Backup & Restore</h3>
        <p className="text-sm text-muted-foreground mt-1">Create on-demand SQLite snapshots, or export/import a unified .merpbak bundle with a version manifest.</p>
      </div>
      <div className="p-6 sm:p-8 space-y-8">
        {/* ── Action Buttons ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={handleCreateBackup}
            disabled={backingUp}
            className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Database className="h-4 w-4" />
            {backingUp ? 'Backing up...' : 'Create Backup'}
          </button>
          <button
            onClick={handleExportBackup}
            disabled={exporting}
            className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium bg-secondary text-secondary-foreground rounded-xl hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export Unified Backup'}
          </button>
          <button
            onClick={handleImportBackup}
            disabled={importing}
            className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-2 border-amber-400/50 text-amber-700 dark:text-amber-300 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            {importing ? 'Importing...' : 'Import Unified Backup'}
          </button>
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/50">
            <HardDrive className="h-4 w-4 shrink-0" />
            <span>Daily auto-backup</span>
          </div>
        </div>

        {/* ── Warning Info ── */}
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-amber-800 dark:text-amber-300">Unified Backup Format (.merpbak)</p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
                Exports bundle the full SQLite database with a version manifest (app version, stores, timestamps, row counts, SHA-256).
                Import validates integrity and schema compatibility, so restoring on another computer is fully deterministic.
                A safety backup of the current database is always created automatically before restoring or importing.
              </p>
            </div>
          </div>
        </div>

        {/* ── Backup List ── */}
        <div>
          <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
            <Database className="h-4 w-4" /> Saved Snapshots
          </h4>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading backups...</div>
          ) : backups.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border/50 rounded-xl">
              No backups found. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {backups.map((b, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/20 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{b.filename}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(b.modifiedAt)} &middot; {formatSize(b.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(b.path)}
                    disabled={restoring}
                    className="shrink-0 ml-4 px-3 py-1.5 text-xs font-medium border border-border text-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {restoring ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdvancedTab({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  const { isAdmin } = useAuth();
  const wipeAllData = useERPStore(state => state.wipeAllData);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">Advanced Features</h3>
        <p className="text-sm text-muted-foreground mt-1">Backup data, manage integrations, and advanced system configuration.</p>
      </div>
      <div className="p-6 sm:p-8 space-y-8">
        
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

        {/* Integrations (Mocked) */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Globe className="h-4 w-4" /> Integrations & Domains
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border/50 flex justify-between items-center opacity-70">
              <div>
                <p className="font-semibold text-sm">Third-party Integrations</p>
                <p className="text-xs text-muted-foreground">Connect with external APIs</p>
              </div>
              <span className="text-xs bg-muted px-2 py-1 rounded">Coming Soon</span>
            </div>
            <div className="p-4 rounded-xl border border-border/50 flex justify-between items-center opacity-70">
              <div>
                <p className="font-semibold text-sm">Custom Domain</p>
                <p className="text-xs text-muted-foreground">app.yourcompany.com</p>
              </div>
              <span className="text-xs bg-muted px-2 py-1 rounded">Coming Soon</span>
            </div>
          </div>
        </div>

      </div>
    </div>
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
    { type: 'Contra Voucher', default: 'CV', example: 'CV-0001' },
    { type: 'Payment Voucher', default: 'PV', example: 'PV-0001' },
    { type: 'Receipt Voucher', default: 'RV', example: 'RV-0001' },
    { type: 'Purchase Voucher', default: 'PUV', example: 'PUV-0001' },
    { type: 'Sales Voucher', default: 'SV', example: 'SV-0001' },
    { type: 'Opening Balance', default: 'OB', example: 'OB-0001' },
    { type: 'Processor Bill', default: 'PB', example: 'PB-0001' },
  ];

  const handleSave = () => {
    setVoucherPrefixes(localPrefixes);
    setVoucherYearlyReset(localYearlyReset);
    onSave();
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">Voucher Numbering</h3>
        <p className="text-sm text-muted-foreground mt-1">Configure custom prefixes per voucher type and toggle yearly sequence reset.</p>
      </div>
      <div className="p-6 sm:p-8 space-y-8">
        
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
    </div>
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
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 sm:p-8 border-b border-border/50 bg-muted/40/50">
        <h3 className="text-lg font-bold text-foreground">About & Updates</h3>
        <p className="text-sm text-muted-foreground mt-1">Version information and automatic update management.</p>
      </div>
      <div className="p-6 sm:p-8 space-y-8">
        
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

        {/* Electron Detection */}
        {!isElectron && (
          <div className="p-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Desktop App Required</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
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
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30'
                  : updateStatus.status === 'available' || updateStatus.status === 'downloaded'
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30'
                  : updateStatus.status === 'downloading'
                  ? 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30'
                  : updateStatus.status === 'error'
                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
                  : 'border-border/50 bg-muted/20'
              }`}>
                <div className="flex items-center gap-3">
                  {updateStatus.status === 'checking' && <RotateCw className="h-5 w-5 text-blue-500 animate-spin shrink-0" />}
                  {updateStatus.status === 'up-to-date' && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
                  {updateStatus.status === 'available' && <DownloadCloud className="h-5 w-5 text-blue-500 shrink-0" />}
                  {updateStatus.status === 'downloaded' && <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />}
                  {updateStatus.status === 'downloading' && <RotateCw className="h-5 w-5 text-violet-500 animate-spin shrink-0" />}
                  {updateStatus.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${
                      updateStatus.status === 'up-to-date' ? 'text-emerald-800 dark:text-emerald-200' :
                      updateStatus.status === 'error' ? 'text-red-800 dark:text-red-200' :
                      'text-foreground'
                    }`}>
                      {updateStatus.message}
                    </p>
                    {updateStatus.status === 'downloading' && typeof updateStatus.percent === 'number' && (
                      <div className="mt-2 w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-300"
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
            <div className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-muted/10 opacity-70">
              <ExternalLink className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Documentation</p>
                <p className="text-xs text-muted-foreground">User guide & API reference</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Shared UI Components
// ----------------------------------------------------------------------

function SaveFooter({ onSave, showSavedToast }: { onSave: () => void, showSavedToast: boolean }) {
  return (
    <div className="pt-6 mt-8 flex items-center justify-end gap-4 border-t border-border/50">
      {showSavedToast && (
        <span className="flex items-center gap-2 text-sm font-medium text-emerald-600 animate-in fade-in slide-in-from-right-4">
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
      onClick={() => onChange(!checked)}
      className={cn(
        "w-11 h-6 rounded-full transition-colors relative flex items-center px-1 shrink-0",
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
