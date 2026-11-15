/**
 * Shared print / PDF settings for the Manufacturing ERP.
 *
 * Single source of truth for everything that lands on paper:
 *   company identity (name, address, phone, email, website, tax number),
 *   branding (logo data URL, position, primary color),
 *   document behavior (orientation, footer text, disclaimer),
 *   output formatting (currency decimals, date format).
 *
 * Reads are pure — this module never mutates any store, so it can be
 * imported by the main-process document generators, the renderer PDF engine
 * and the Settings print tab without creating write cycles or import
 * dependencies between those layers.
 */
import { useERPStore } from '../../store/useERPStore';
import { useSettingsStore } from '../../store/useSettingsStore';

export interface PrintSettings {
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    taxNumber: string;
  };
  branding: {
    logoDataUrl?: string | null;
    logoPosition: 'left' | 'center' | 'right';
    primaryColor: string;
    secondaryColor: string;
  };
  document: {
    footerText: string;
    showSignatureDisclaimer: boolean;
    orientation: 'Portrait' | 'Landscape';
    accentColor: string;
  };
  output: {
    currency: string;
    currencyFractionDigits: number;
    numberLocale: string;
    dateFormat: string;
  };
  printedBy: {
    name: string;
    email: string;
  };
}

const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  company: {
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    taxNumber: '',
  },
  branding: {
    logoDataUrl: null,
    logoPosition: 'left',
    primaryColor: '#465FFF',
    secondaryColor: '#0ea5e9',
  },
  document: {
    footerText: '',
    showSignatureDisclaimer: false,
    orientation: 'Portrait',
    accentColor: '#465FFF',
  },
  output: {
    currency: 'PKR',
    currencyFractionDigits: 2,
    numberLocale: 'en-PK',
    dateFormat: 'dd-MMM-yyyy',
  },
  printedBy: { name: 'System Admin', email: 'admin@miaoda.com' },
};

/** Merge company settings, document settings and app branding into one print object. */
export function getPrintSettings(): PrintSettings {
  const cs = useERPStore.getState().companySettings ?? {};
  const ds = useERPStore.getState().documentSettings ?? {};
  const bs = useSettingsStore.getState();
  const cu = useERPStore.getState().currentUser ?? { name: '', email: '' };

  // The company identity and the person who printed the document were read
  // from two stores that the app never keeps in step: the ERP store still
  // held the seed placeholders ("W-RAW ERP PROFESSIONAL", "System Admin")
  // while the real values — the business name and the signed-in user — live in
  // the settings store. So a PDF printed the placeholder identity.
  //
  // The rule now: a value that is still the untouched seed placeholder is
  // treated as "not set" and the live value wins. Anything the user has
  // actually edited is always respected.
  const companyName = isPlaceholder(cs.name, PLACEHOLDER_COMPANY_NAME)
    ? bs.dashboardName || PLACEHOLDER_COMPANY_NAME
    : cs.name || bs.dashboardName || PLACEHOLDER_COMPANY_NAME;

  const printedByName = isPlaceholder(cu.name, PLACEHOLDER_USER_NAME)
    ? bs.userName || PLACEHOLDER_USER_NAME
    : cu.name || bs.userName || PLACEHOLDER_USER_NAME;

  const printedByEmail = isPlaceholder(cu.email, PLACEHOLDER_USER_EMAIL)
    ? bs.userEmail || PLACEHOLDER_USER_EMAIL
    : cu.email || bs.userEmail || PLACEHOLDER_USER_EMAIL;

  return {
    company: {
      name: companyName,
      address: cs.address ?? DEFAULT_PRINT_SETTINGS.company.address,
      phone: cs.phone ?? DEFAULT_PRINT_SETTINGS.company.phone,
      email: cs.email ?? DEFAULT_PRINT_SETTINGS.company.email,
      website: cs.website ?? DEFAULT_PRINT_SETTINGS.company.website,
      taxNumber: cs.taxNumber ?? DEFAULT_PRINT_SETTINGS.company.taxNumber,
    },
    branding: {
      logoDataUrl: bs.logo ?? DEFAULT_PRINT_SETTINGS.branding.logoDataUrl,
      logoPosition: (bs.logoPosition ?? 'left') as 'left' | 'center' | 'right',
      primaryColor: bs.primaryColor ?? DEFAULT_PRINT_SETTINGS.branding.primaryColor,
      secondaryColor: bs.secondaryColor ?? DEFAULT_PRINT_SETTINGS.branding.secondaryColor,
    },
    document: {
      footerText: ds.footerText ?? DEFAULT_PRINT_SETTINGS.document.footerText,
      showSignatureDisclaimer:
        ds.showSignatureDisclaimer ?? DEFAULT_PRINT_SETTINGS.document.showSignatureDisclaimer,
      orientation: (ds.defaultOrientation as 'Portrait' | 'Landscape') ??
        DEFAULT_PRINT_SETTINGS.document.orientation,
      accentColor: bs.primaryColor ?? DEFAULT_PRINT_SETTINGS.document.accentColor,
    },
    output: {
      ...DEFAULT_PRINT_SETTINGS.output,
      currency: ds.currency ?? DEFAULT_PRINT_SETTINGS.output.currency,
      currencyFractionDigits:
        ds.currencyFractionDigits ?? DEFAULT_PRINT_SETTINGS.output.currencyFractionDigits,
      numberLocale: ds.numberLocale ?? DEFAULT_PRINT_SETTINGS.output.numberLocale,
      dateFormat: ds.dateFormat ?? DEFAULT_PRINT_SETTINGS.output.dateFormat,
    },
    printedBy: {
      name: printedByName,
      email: printedByEmail,
    },
  };
}

/** The seed values the app starts with — never a real company or user. */
const PLACEHOLDER_COMPANY_NAME = 'W-RAW ERP PROFESSIONAL';
const PLACEHOLDER_USER_NAME = 'System Admin';
const PLACEHOLDER_USER_EMAIL = 'admin@miaoda.com';

/**
 * True when a value is still the untouched seed placeholder. Used to decide
 * whether a setting has actually been set by the user — the ERP store keeps
 * its placeholders forever because nothing writes to them, so "is it the
 * placeholder" is the only honest test for "was this ever edited?".
 */
function isPlaceholder(value: string | undefined, placeholder: string): boolean {
  if (value === undefined || value === null) return true;
  const trimmed = value.trim();
  return trimmed === '' || trimmed === placeholder;
}

/** Format money for print/screen — always 2 decimal places (paisa preserved). */
export function formatPrintCurrency(amount: number): string {
  const { output } = getPrintSettings();
  return new Intl.NumberFormat(output.numberLocale, {
    style: 'currency',
    currency: output.currency,
    minimumFractionDigits: output.currencyFractionDigits,
    maximumFractionDigits: output.currencyFractionDigits,
  }).format(amount);
}

/** Format a date for documents — honours Settings → Print & PDF `dateFormat`. */
export function formatPrintDate(date: string | Date | undefined | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const { output } = getPrintSettings();
  const dd = String(d.getDate()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const MMM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const MMMM = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];
  const yyyy = String(d.getFullYear());
  const map: Record<string, string> = { dd, MM, MMM, MMMM, yyyy, yy: yyyy.slice(-2) };
  return (output.dateFormat || 'dd-MMM-yyyy').replace(/MMMM|MMM|MM|dd|yyyy|yy/g, t => map[t]);
}

/** Format a plain number for documents. */
export function formatPrintNumber(num: number | undefined | null): string {
  if (num == null) return '—';
  return num.toLocaleString(getPrintSettings().output.numberLocale);
}
