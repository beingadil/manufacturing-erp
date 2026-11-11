/**
 * Shared form-design primitives for the master-data forms (Categories,
 * Materials, Suppliers, Customers, Processors).
 *
 * The shells themselves live in `ui/formStyles` — one source of truth, so a
 * text input, a textarea, a dropdown and a searchable select are the SAME
 * object on screen: soft background, hairline border, 12px radius, 46px
 * height, and a wide low-opacity focus halo (ring-4 ring-primary/10) instead
 * of a hard 1px focus ring. This file re-exports those shells under the
 * names the form components use, and owns the button chrome.
 */

import { hintClass, inputClass, labelClass } from '../ui/formStyles';

/** The text input / textarea shell every master-data field uses. */
export const formInputClass = inputClass;

/** Field label (text-sm font-medium). Required fields get a `*` asterisk. */
export const formFieldLabelClass = labelClass;

/** Helper text beneath a field (text-xs text-muted-foreground). */
export const formHintClass = hintClass;

/** Cancel button: ghost-style, auto width (footer sets min-w-[140px]). */
export const formCancelButtonClass =
  'rounded-xl border border-border bg-background/60 px-4 py-3 text-sm font-medium text-foreground/80 transition-[background-color,border-color,box-shadow] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10';

/** Submit (Save) button: primary solid. */
export const formSubmitButtonClass =
  'rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20';

/** Prominent call-to-action button: primary solid without shadow. */
export const formCtaButtonClass =
  'rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20';
