import { cn } from '../../lib/utils';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  error?: string | null;
  hint?: string;
}

/**
 * Consistent labelled form field with optional inline error/hint — the base
 * for the processing module's forms (and any future form built the same way).
 */
export function FormField({ label, htmlFor, children, error, hint }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground/80 mb-1">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** The module's standard input style. */
export function TextInput({ className, invalid, ...props }: TextInputProps) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-xl border p-3 text-sm bg-background',
        invalid ? 'border-destructive' : 'border-border',
        className
      )}
    />
  );
}
