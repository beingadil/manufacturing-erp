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

  return {
    company: {
      name: cs.name ?? DEFAULT_PRINT_SETTINGS.company.name,
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
    },
    printedBy: {
      name: cu.name ?? DEFAULT_PRINT_SETTINGS.printedBy.name,
      email: cu.email ?? DEFAULT_PRINT_SETTINGS.printedBy.email,
    },
  };
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

/** Format a date for documents (default dd-MMM-yyyy). */
export function formatPrintDate(date: string | Date | undefined | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const { output } = getPrintSettings();
  const parts = new Intl.DateTimeFormat(output.numberLocale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.day}-${map.month}-${map.year}`;
}

/** Format a plain number for documents. */
export function formatPrintNumber(num: number | undefined | null): string {
  if (num == null) return '—';
  return num.toLocaleString(getPrintSettings().output.numberLocale);
}
