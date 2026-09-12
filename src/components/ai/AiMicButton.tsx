// src/components/ai/AiMicButton.tsx
// Header mic button — visible only when the AI assistant and voice input are
// enabled. Opens the VoiceAssistant panel.

import { Mic } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { VoiceAssistant } from './VoiceAssistant';

export function AiMicButton() {
  const aiAssistantEnabled = useSettingsStore(s => s.aiAssistantEnabled);
  const aiVoiceEnabled = useSettingsStore(s => s.aiVoiceEnabled);
  const [open, setOpen] = useState(false);

  // Keep the gateway flags in sync with the settings mirror (belt & braces —
  // the settings tab already does this; this covers direct-store toggles).
  useEffect(() => {
    // Intentionally fire-and-forget; the gateway treats disabled as no-op.
    void import('../../lib/ai/aiClient').then(({ aiClient }) => {
      void aiClient.setConfig({ enabled: aiAssistantEnabled, voiceEnabled: aiVoiceEnabled });
    });
  }, [aiAssistantEnabled, aiVoiceEnabled]);

  if (!aiAssistantEnabled || !aiVoiceEnabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI voice assistant"
        title="AI Voice Assistant"
        className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
      >
        <Mic className="h-5 w-5" />
      </button>
      <VoiceAssistant open={open} onClose={() => setOpen(false)} />
    </>
  );
}
