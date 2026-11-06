import { cn } from '@/lib/utils';
import { formCancelButtonClass, formSubmitButtonClass } from './formStyles';

export interface FormFooterProps {
  cancelLabel?: string;
  submitLabel?: string;
  onCancel: () => void;
  cancelClassName?: string;
  submitClassName?: string;
}

/**
 * Sticky footer bar: Cancel on the left, Save on the right.
 * Buttons are auto-width with min-w-[140px]; on mobile they expand full-width
 * and stack (flex-col-reverse sm:flex-row sm:justify-end).
 * The submit button is type="submit" so it bubbles to the owning `<form>`
 * — this primitive owns no state or submission logic.
 */
export function FormFooter({ cancelLabel = 'Cancel', submitLabel = 'Save', onCancel, cancelClassName, submitClassName }: FormFooterProps) {
  return (
    <div className="p-4 pt-6 border-t border-border/50 bg-card/50 backdrop-blur-sm flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className={cn(formCancelButtonClass, cancelClassName, 'w-full sm:w-auto min-w-[140px]')}
      >
        {cancelLabel}
      </button>
      <button type="submit" className={cn(formSubmitButtonClass, submitClassName, 'w-full sm:w-auto min-w-[140px]')}>
        {submitLabel}
      </button>
    </div>
  );
}
