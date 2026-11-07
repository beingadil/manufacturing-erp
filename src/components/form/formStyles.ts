/**
 * Shared form-design primitives for the master-data forms (Categories,
 * Materials, Suppliers, Customers, Processors).
 *
 * Input chrome unified with ui/formStyles: soft background, hairline border,
 * and a wide low-opacity focus halo (ring-4 ring-primary/10) instead of a hard
 * 1px focus ring — reads as a pressed-in surface. Native <select> instances
 * rendered by consumers should additionally use the chevron treatment from
 * ui/formStyles (selectClass / toolbarSelectClass).
 */

export const formInputClass =
  'w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 transition-[border-color,background-color,box-shadow] ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-border focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10';

/** Field label (text-sm font-medium). Required fields get a `*` asterisk. */
export const formFieldLabelClass = 'text-sm font-medium text-foreground';

/** Helper text beneath a field (text-xs text-muted-foreground). */
export const formHintClass = 'text-xs text-muted-foreground';

/** Cancel button: ghost-style, auto width (footer sets min-w-[140px]). */
export const formCancelButtonClass =
  'rounded-xl border border-border bg-background/60 px-4 py-3 text-sm font-medium text-foreground/80 transition-[background-color,border-color,box-shadow] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10';

/** Submit (Save) button: primary solid. */
export const formSubmitButtonClass =
  'rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.99]';

/** Prominent call-to-action button: primary solid without shadow. */
export const formCtaButtonClass =
  'rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.99]';