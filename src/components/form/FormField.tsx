import * as React from 'react';
import { cn } from '@/lib/utils';
import { requiredMarkClass } from '../ui/formStyles';
import { formFieldLabelClass, formHintClass } from './formStyles';

export interface FormFieldProps {
  /** Matches the `id` of the child input/select/textarea (label htmlFor). */
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + control + hint stack. Behavior-neutral: renders a `<label htmlFor>`,
 * the child input element(s) and an optional hint paragraph. No state.
 */
export function FormField({ id, label, required, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={id} className={formFieldLabelClass}>
        {label}
        {required && (
          <span className={requiredMarkClass} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && <p className={formHintClass}>{hint}</p>}
    </div>
  );
}
