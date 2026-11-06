import { cn } from '@/lib/utils';
import * as React from 'react';

export interface FormSectionProps {
  /** Icon rendered inside the section's icon chip. */
  icon: React.ReactNode;
  /** Uppercase eyebrow heading above the section. */
  eyebrow: string;
  /** Optional description under the eyebrow. */
  description?: string;
  /** When true, omits the top hairline border (use on the first section). */
  first?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Form section: icon chip + uppercase eyebrow heading + optional description,
 * then children. Each section after the first is separated by a hairline
 * top border (`border-t border-border/50`); the first section uses `border-0`.
 * No behavior — presentational only.
 */
export function FormSection({ icon, eyebrow, description, first = false, className, children }: FormSectionProps) {
  return (
    <section className={cn('flex flex-col gap-3 py-4', first ? 'border-0' : 'border-t border-border/50', className)}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</h3>
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}
