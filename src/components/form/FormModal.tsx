import { X } from 'lucide-react';
import * as React from 'react';
import { PageModal } from '../ui/PageModal';

export interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Optional description shown under the title in the header. */
  description?: string;
  /** Icon rendered in the header's icon chip. */
  icon: React.ReactNode;
  /** Gradient classes for the header icon chip (e.g. `from-emerald-500 to-teal-600`).
   *  The header background uses a softened copy of the same stops. Defaults to `from-primary to-secondary`. */
  accent?: string;
  /** 'md' → max-w-2xl, 'lg' → max-w-3xl, 'xl' → max-w-5xl (wide master-data
   *  forms that must fit without a scrollbar). */
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  /** Footer bar rendered below the scroll area (e.g. <FormFooter />). */
  footer?: React.ReactNode;
}

/**
 * Master-data modal shell: PageModal with a generalized Categories-style
 * gradient icon-chip header (title + optional description), a sticky footer
 * bar outside the scroll area, and three widths (md = max-w-2xl,
 * lg = max-w-3xl, xl = max-w-5xl for forms that must not scroll).
 * Layout/typography/spacing only — no state or handlers.
 */
export function FormModal({ isOpen, onClose, title, description, icon, size = 'lg', accent = 'from-primary to-secondary', children, footer }: FormModalProps) {
  // Soften the accent stops for the header background tint (color-stop opacity).
  const headerGradient = accent.split(' ').map(stop =>
    (stop.startsWith('from-') || stop.startsWith('to-')) && !stop.includes('/') ? `${stop}/10` : stop
  ).join(' ');

  return (
    <PageModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth={size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-3xl' : 'max-w-2xl'}
      header={
        <div className={`px-6 py-4 border-b border-border/50 shrink-0 bg-gradient-to-r ${headerGradient}`}>
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}>
                {icon}
              </div>
              <div className="space-y-0.5">
                <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      }
      footer={footer}
    >
      {children}
    </PageModal>
  );
}
