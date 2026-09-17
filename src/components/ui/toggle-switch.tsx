import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared switch control (the app's only Toggle implementation).
 *
 * Consolidates the identical toggles that previously lived in
 * Settings.tsx and AiAssistantTab.tsx. Radix Switch was considered,
 * but the app's anatomy (11×24px track, role="switch", aria-checked)
 * matches this minimal controlled component and both call sites already
 * use this exact contract: `checked` + `onChange(boolean)`.
 */
export interface ToggleSwitchProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onChange' | 'checked'> {
  checked: boolean;
  /** Receives the next state. */
  onChange: (next: boolean) => void;
}

export function ToggleSwitch({ checked, onChange, className, ...props }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-11 h-6 rounded-full transition-colors duration-150 relative flex items-center px-1 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'w-4 h-4 rounded-full bg-background transition-transform transform shadow-sm',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
