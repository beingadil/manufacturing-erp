// src/components/ai/VoiceAssistant.tsx
// The assistant panel — drives all three UX phases:
//   Phase 1: push-to-talk capture -> Whisper transcript (shown verbatim)
//   Phase 2: tool-calling parse -> confirmation panel for write commands
//   Phase 3: multi-step plan checklist -> sequential execution -> readback
//
// Writes NEVER execute without the explicit Confirm button; read-only
// commands auto-run immediately after parsing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, X, Check, AlertTriangle, Loader2, Keyboard, CornerDownLeft } from 'lucide-react';
import { toast } from 'sonner';
import { aiClient } from '../../lib/ai/aiClient';
import {
  type AssistantPlan,
  type PlanStep,
  type StepOutcome,
  executePlan,
  parseTranscript,
  summarizeOutcomes,
} from '../../lib/ai/assistantService';

type Phase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'confirming'
  | 'executing'
  | 'done';

interface VoiceAssistantProps {
  open: boolean;
  onClose: () => void;
}

export function VoiceAssistant({ open, onClose }: VoiceAssistantProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [readback, setReadback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [micAvailable, setMicAvailable] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setTranscript(null);
    setPlan(null);
    setOutcomes([]);
    setReadback(null);
    setError(null);
    setTyped('');
  }, []);

  const stopRecorder = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  // ── Phase 1: capture + transcribe ──────────────────────────────────────

  const startRecording = useCallback(async () => {
    setMicError(null);
    setError(null);
    setTranscript(null);
    setPlan(null);
    setOutcomes([]);
    setReadback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setPhase('transcribing');
        const buf = await blob.arrayBuffer();
        const res = await aiClient.transcribe(buf, 'audio/webm');
        if (!res.success || !res.data) {
          setPhase('idle');
          setError(res.error || 'Transcription failed.');
          return;
        }
        const text = res.data.text.trim();
        setTranscript(text);
        if (!text) {
          setPhase('idle');
          setError('Nothing audible was captured. Try again a little closer to the mic.');
          return;
        }
        // Continue into Phase 2 automatically.
        void parse(text);
      };
      recorder.start();
      recorderRef.current = recorder;
      setPhase('recording');
    } catch (e) {
      setPhase('idle');
      setMicAvailable(false); // mic unusable — surface the typed fallback
      setMicError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Microphone access was denied. Type your command below instead.'
          : 'Could not start the microphone. Type your command below instead.'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase 2: parse into a plan ─────────────────────────────────────────

  const parse = useCallback(async (text: string) => {
    setPhase('thinking');
    try {
      const p = await parseTranscript(text);
      setPlan(p);
      if (p.steps.length === 0) {
        setReadback(p.plainReply || 'I could not turn that into a command.');
        setPhase('done');
        return;
      }
      const writeSteps = p.steps.filter(s => !s.readOnly);
      if (writeSteps.length === 0) {
        // Read-only plan: execute immediately (Phase 3 path with no confirm).
        const outs = executePlan(p.steps);
        setOutcomes(outs);
        setReadback(summarizeOutcomes(outs));
        setPhase('done');
        return;
      }
      setPhase('confirming'); // user must approve the writes
    } catch (e) {
      setPhase('idle');
      setError(e instanceof Error ? e.message : 'AI request failed.');
    }
  }, []);

  // ── Phase 3: execute confirmed plan ────────────────────────────────────

  const confirmAndExecute = useCallback(() => {
    if (!plan) return;
    setPhase('executing');
    // Small delay so the executing state paints before synchronous store work.
    setTimeout(() => {
      const outs = executePlan(plan.steps);
      setOutcomes(outs);
      setReadback(summarizeOutcomes(outs));
      setPhase('done');
      const allOk = outs.every(o => o.ok);
      if (allOk) toast.success('Command executed');
      else toast.error('Some steps failed — see the panel');
    }, 50);
  }, [plan]);

  const cancelPlan = useCallback(() => {
    reset();
  }, [reset]);

  // ── Typed fallback (same pipeline as voice: parse → confirm → execute) ──

  const submitTyped = useCallback(() => {
    const text = typed.trim();
    if (!text || phase === 'thinking' || phase === 'executing' || phase === 'transcribing') return;
    setMicError(null);
    setError(null);
    setPlan(null);
    setOutcomes([]);
    setReadback(null);
    setTranscript(text);
    setTyped('');
    void parse(text);
  }, [typed, phase, parse]);

  // Escape closes (when not mid-recording); clicking backdrop closes when idle/done.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'recording') {
        stopRecorder();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, phase, onClose, stopRecorder]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && (phase === 'idle' || phase === 'done')) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="AI Voice Assistant"
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">AI Voice Assistant</span>
          </div>
          <button
            onClick={() => { stopRecorder(); onClose(); }}
            aria-label="Close assistant"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mic / status area */}
          {(phase === 'idle' || phase === 'recording') && (
            <div className="flex flex-col items-center gap-3 py-2">
              {phase === 'idle' && (
                <button
                  onClick={startRecording}
                  aria-label="Start recording"
                  className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg"
                >
                  <Mic className="h-7 w-7" />
                </button>
              )}
              {phase === 'recording' && (
                <button
                  onClick={stopRecorder}
                  aria-label="Stop recording"
                  className="h-16 w-16 rounded-full bg-destructive text-white flex items-center justify-center animate-pulse shadow-lg"
                >
                  <Square className="h-6 w-6" />
                </button>
              )}
              <p className="text-sm text-muted-foreground">
                {phase === 'idle'
                  ? (micAvailable ? 'Tap the mic and speak your command' : 'Type your command below')
                  : 'Listening… tap to stop'}
              </p>
              {micError && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{micError}</p>
              )}
            </div>
          )}

          {(phase === 'transcribing' || phase === 'thinking' || phase === 'executing') && (
            <div className="flex items-center gap-3 py-4 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === 'transcribing' ? 'Transcribing audio…' : phase === 'thinking' ? 'Understanding the command…' : 'Executing through the engine…'}
            </div>
          )}

          {/* Transcript */}
          {transcript && (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">You said</p>
              <p className="text-sm text-foreground italic">&ldquo;{transcript}&rdquo;</p>
            </div>
          )}

          {/* Confirmation / checklist (Phases 2+3) */}
          {plan && plan.steps.length > 0 && (phase === 'confirming' || phase === 'executing' || phase === 'done') && (
            <div className="rounded-xl border border-border overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 pt-3 pb-1">
                {plan.steps.length > 1 ? 'Plan (' + plan.steps.length + ' steps)' : 'Command'}
              </p>
              <ul className="divide-y divide-border/60">
                {plan.steps.map((step: PlanStep) => {
                  const outcome = outcomes.find(o => o.index === step.index);
                  return (
                    <li key={step.index} className="flex items-start gap-2.5 px-4 py-2.5">
                      <span className="mt-0.5">
                        {outcome ? (
                          outcome.ok ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : step.readOnly ? (
                          <Check className="h-4 w-4 text-muted-foreground/50" />
                        ) : (
                          <span className="block h-4 w-4 rounded-full border-2 border-muted-foreground/40" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{step.summary}</p>
                        {outcome && !outcome.ok && (
                          <p className="text-xs text-destructive mt-0.5">{outcome.message}</p>
                        )}
                        {outcome && outcome.ok && outcome.message !== step.summary && (
                          <p className="text-xs text-muted-foreground mt-0.5">{outcome.message}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Readback */}
          {readback && phase === 'done' && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
              <p className="text-sm text-foreground">{readback}</p>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Typed fallback — same pipeline as voice; auto-focuses when the mic is unusable */}
          {(phase === 'idle' || phase === 'done') && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); submitTyped(); }}
            >
              <div className="relative flex-1">
                <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  ref={textInputRef}
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={micAvailable ? '…or type a command, e.g. "how many pcs of brass?"' : 'Type a command, e.g. "send 400 pcs of brass to Ali"'}
                  aria-label="Type a command"
                  autoComplete="off"
                  autoFocus={!micAvailable}
                  className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={!typed.trim()}
                aria-label="Run typed command"
                className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CornerDownLeft className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            {phase === 'confirming' && (
              <>
                <button
                  onClick={cancelPlan}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAndExecute}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Confirm &amp; run
                </button>
              </>
            )}
            {phase === 'done' && (
              <>
                <button
                  onClick={reset}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  New command
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
