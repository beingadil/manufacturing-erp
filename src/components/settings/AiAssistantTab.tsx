// src/components/settings/AiAssistantTab.tsx
// Settings tab for the Groq-powered AI assistant. The API key is sent once to
// the main process and stored in userData/ai-config.json (mode 0600) — it is
// never persisted in the renderer, the store, or the SQLite blob. This tab
// only mirrors the enabled/voice flags for UI reactivity.

import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Eye, EyeOff, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { aiClient } from '../../lib/ai/aiClient';
import { cn } from '../../lib/utils';
import { useSettingsStore } from '../../store/useSettingsStore';

function SettingsCard({ title, subtitle, icon: Icon, children }: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', disabled && 'opacity-50')}>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}

export function AiAssistantTab({ showSavedToast }: { showSavedToast: boolean }) {
  const {
    aiAssistantEnabled,
    aiVoiceEnabled,
    setAiAssistantEnabled,
    setAiVoiceEnabled,
  } = useSettingsStore();

  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [model, setModel] = useState<string>('');

  // Load the gateway config on mount (key presence only — the key itself
  // never crosses the IPC boundary back to the renderer).
  useEffect(() => {
    let cancelled = false;
    aiClient.getConfig().then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setHasKey(res.data.hasKey);
        if (res.data.model) setModel(res.data.model);
      } else if (res.error) toast.error(res.error);
    });
    return () => { cancelled = true; };
  }, []);

  const saveKey = async () => {
    if (!keyDraft.trim()) {
      toast.error('Paste your Groq API key first (console.groq.com/keys).');
      return;
    }
    setSaving(true);
    const res = await aiClient.setConfig({ apiKey: keyDraft.trim() });
    setSaving(false);
    if (res.success) {
      setHasKey(true);
      setKeyDraft('');
      toast.success('API key saved securely on this device.');
    } else {
      toast.error(res.error || 'Could not save the key.');
    }
  };

  const clearKey = async () => {
    const res = await aiClient.setConfig({ apiKey: '' });
    if (res.success) {
      setHasKey(false);
      toast.success('API key removed.');
    } else {
      toast.error(res.error || 'Could not remove the key.');
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);      const res = await aiClient.chat(
        [{ role: 'user', content: 'Reply with exactly: OK' }],
        undefined
      );
      setTesting(false);
      if (res.success) {
        setTestResult('ok');
        if (res.data?.model && res.data.model !== model) setModel(res.data.model);
        toast.success('Groq connection working.');
      } else {
        setTestResult('fail');
        toast.error(res.error || 'Connection test failed.');
      }
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        title="AI Assistant"
        subtitle="Voice commands and AI features powered by Groq. Works only when enabled; the app stays fully functional offline."
        icon={Bot}
      >
        <div className="space-y-1 divide-y divide-border/50">
          <Toggle
            checked={aiAssistantEnabled}
            onChange={(v) => {
              setAiAssistantEnabled(v);
              // Mirror into the gateway so ai:chat/transcribe honor it too.
              void aiClient.setConfig({ enabled: v });
              if (v && !hasKey) {
                toast.info('Enabled — now add your Groq API key below.');
              }
            }}
            label="Enable AI Assistant"
            description="Master switch for all AI features."
          />
          <Toggle
            checked={aiVoiceEnabled}
            onChange={(v) => {
              setAiVoiceEnabled(v);
              void aiClient.setConfig({ voiceEnabled: v });
            }}
            label="Voice input"
            description="Push-to-talk microphone button in the header."
            disabled={!aiAssistantEnabled}
          />
        </div>

        {/* API key */}
        <div className="mt-6 pt-5 border-t border-border/50 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Groq API Key</p>
              <p className="text-xs text-muted-foreground">
                {hasKey
                  ? 'A key is saved on this device (stored by the desktop app, never in your data).'
                  : 'Get a free key at console.groq.com/keys'}
              {hasKey && model && (
                <span className="ml-2 text-[10px] font-mono text-muted-foreground">model: {model}</span>
              )}
              </p>
            </div>
            {hasKey && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          </div>

          {!hasKey && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="gsk_..."
                  autoComplete="off"
                  aria-label="Groq API key"
                  className="w-full rounded-xl border border-border bg-card px-4 py-2.5 pr-10 text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                onClick={saveKey}
                disabled={saving}
                className="px-4 py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save key'}
              </button>
            </div>
          )}

          {hasKey && (
            <button
              onClick={clearKey}
              className="text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg px-3 py-1.5 transition-colors"
            >
              Remove saved key
            </button>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={testConnection}
              disabled={!aiAssistantEnabled || !hasKey || testing}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {testResult === 'ok' && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected
              </span>
            )}
            {testResult === 'fail' && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <XCircle className="h-3.5 w-3.5" /> Failed — check key/internet
              </span>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="mt-6 pt-5 border-t border-border/50">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">How commands work:</span> speak or type a
            command like &ldquo;how many pcs of brass are in stock&rdquo; or &ldquo;sell 300 pcs of plate to
            Ahmed at 60&rdquo;. The AI proposes the action; every change to your data always shows a
            confirmation first, and runs through the same validated engine as the buttons — stock
            checks, stage rules and accounting stay enforced.
          </p>
        </div>
      </SettingsCard>

      {showSavedToast && (
        <div className="fixed bottom-6 right-6 z-[80] rounded-xl border border-border bg-card px-4 py-3 shadow-lg text-sm">
          Settings saved
        </div>
      )}
    </div>
  );
}
