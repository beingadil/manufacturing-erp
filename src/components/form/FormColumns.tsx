import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormColumnsProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Two-pane form body.
 *
 * A wide master-data modal (max-w-5xl) has room for two columns of sections
 * side by side, so the form reads as one screen instead of a scroll: the
 * identity fields sit in the left pane, the long-form fields (address, notes,
 * classification) in the right. Collapses to a single column below `lg`.
 */
export function FormColumns({ className, children }: FormColumnsProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-x-8 lg:grid-cols-2',
        // A hairline rule separates the panes at desktop width.
        '[&>*:nth-child(2)]:lg:border-l [&>*:nth-child(2)]:lg:border-border/50 [&>*:nth-child(2)]:lg:pl-8',
        className
      )}
    >
      {children}
    </div>
  );
}
