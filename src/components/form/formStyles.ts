/**
 * Shared form-design primitives for the master-data forms (Categories,
 * Materials, Suppliers, Customers, Processors).
 *
 * These are pure class strings — no behavior, no state, no validation.
 * Consumers (page forms) own the inputs, handlers and submit logic.
 *
 * Input chrome is "treatment A" from the auditor spec:
 * rounded-xl border border-border bg-card px-4 py-3 text-sm with a visible
 * focus:ring (the global base sets outline-none on inputs, so the ring is
 * required for a11y). Selects additionally receive bg-card where the page
 * renders a native <select>.
 */

export const formInputClass =
  'w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors';

/** Field label (text-sm font-semibold). Required fields get a `*` asterisk. */
export const formFieldLabelClass = 'text-sm font-semibold text-foreground';

/** Helper text beneath a field (text-xs text-muted-foreground). */
export const formHintClass = 'text-xs text-muted-foreground';

/** Cancel button: ghost-style, auto width (footer sets min-w-[140px]). */
export const formCancelButtonClass =
  'rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground/80 hover:bg-muted/40 transition-colors';

/** Submit (Save) button: primary solid with shadow. */
export const formSubmitButtonClass =
  'rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md';

/** Prominent call-to-action button: primary solid without shadow. */
export const formCtaButtonClass =
  'rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors';
