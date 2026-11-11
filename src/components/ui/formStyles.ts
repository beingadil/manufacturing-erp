import { cn } from '../../lib/utils';

/**
 * Shared form field styling for master-data forms — one source of truth so
 * every form (materials, products, suppliers, customers, processors,
 * categories) renders identical field shells.
 *
 * Field treatment: soft background, hairline border, and a wide low-opacity
 * focus halo (`ring-4 ring-primary/10`) instead of a hard 1px focus ring —
 * reads as a pressed-in surface rather than an outlined box. Transitions run
 * on color/box-shadow only (GPU-safe) with a fast, physical ease.
 */
export const labelClass = 'text-sm font-medium text-foreground';

export const hintClass = 'text-xs text-muted-foreground';

/**
 * Focus treatment shared by EVERY control — text input, textarea, dropdown,
 * searchable select. A wide low-opacity halo rather than a hard 1px focus
 * ring: it reads as a pressed-in surface instead of an outlined box.
 *
 * This is the single place that decides what "focused" looks like. A second
 * treatment anywhere is how a row ends up with a 1px ring next to a soft halo.
 */
export const controlFocusClass = 'focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10';

/**
 * The one required-field mark. Every label — form field, dropdown, searchable
 * select — renders its asterisk exactly like this.
 */
export const requiredMarkClass = 'ml-1 text-destructive';

export const inputClass = cn(
  'w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground',
  'placeholder:text-muted-foreground/60',
  'transition-[border-color,background-color,box-shadow] ease-[cubic-bezier(0.32,0.72,0,1)]',
  'hover:border-border',
  controlFocusClass,
);

export const textareaClass = cn(
  inputClass,
  'min-h-[88px] resize-y leading-relaxed',
);

export const selectClass = cn(
  inputClass,
  'bg-card pr-10 appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2716%27%20height=%2716%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%23999%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat',
);

/**
 * Compact select for toolbars & table filters — same shell language as
 * selectClass (hairline border, soft focus halo, custom chevron) at a smaller
 * scale so inline filters don't bloat rows.
 */
export const toolbarSelectClass = cn(
  'rounded-xl border border-border bg-background/60 pr-9 pl-3 py-2 text-sm text-foreground',
  'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2714%27%20height=%2714%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%23999%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[length:14px] bg-[right_0.65rem_center] bg-no-repeat',
  'transition-[border-color,background-color,box-shadow] ease-[cubic-bezier(0.32,0.72,0,1)]',
  'hover:border-border focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10',
);

export const fieldGroupClass = 'grid gap-4 sm:grid-cols-2';
