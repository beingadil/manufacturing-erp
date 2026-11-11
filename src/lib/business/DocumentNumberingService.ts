import { useSettingsStore } from '../../store/useSettingsStore';

export class DocumentNumberingService {
  /**
   * Lookup prefix for a voucher type — from custom settings first, then defaults.
   */
  static getVoucherPrefix(type: string): string {
    try {
      const settings = useSettingsStore.getState();
      if (settings.voucherPrefixes?.[type]) {
        return settings.voucherPrefixes[type];
      }
    } catch {
      // Settings store not initialized yet
    }

    const defaultPrefixMap: Record<string, string> = {
      'Journal Voucher': 'JV',
      'Purchase Voucher': 'PUV',
      'Sales Voucher': 'SV',
      'Bank Payment': 'BP',
      'Bank Receipt': 'BR',
      'Cash Payment': 'CP',
      'Cash Receipt': 'CR',
      'Processor Bill': 'PB'
    };
    return defaultPrefixMap[type] || 'V';
  }

  /**
   * Lookup prefix for a document class (PO / INV / DSP / REC / BILL / PRD) —
   * custom Settings override first, then the canonical default. Falls back to
   * the default when the Settings store is not initialized yet.
   */
  static getDocumentPrefix(fallback: string): string {
    try {
      const settings = useSettingsStore.getState();
      const custom = settings.documentPrefixes?.[fallback];
      if (custom && custom.trim()) {
        return custom.trim().toUpperCase();
      }
    } catch {
      // Settings store not initialized yet
    }
    return fallback;
  }

  /**
   * Batch (purchase-batch) number.
   *  - 'supplier' (default): {SUPPLIER-FIRST-WORD}-{purchaseNo} — e.g.
   *    "AHMED-PO-2026-0003": the reader sees WHO bought it and WHICH purchase,
   *    so one material's purchases stay distinguishable by eye.
   *  - 'classic': BATCH-{purchaseNo} — the old scheme, kept as a Settings choice.
   * Both are unique because purchaseNo is unique; sanitizing keeps only
   * alphanumerics of the supplier's first word (12 chars max) so numbers stay
   * short and Ba No.-style names never inject punctuation into the code.
   */
  static buildBatchNo(supplierName: string | undefined, purchaseNo: string): string {
    try {
      const settings = useSettingsStore.getState();
      if (settings.batchNoMode === 'classic') {
        return `BATCH-${purchaseNo}`;
      }
    } catch {
      // Settings store not initialized yet — default to the supplier scheme
    }
    const firstWord = (supplierName || '').trim().split(/\s+/)[0] || '';
    const stem = firstWord.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'BATCH';
    return `${stem}-${purchaseNo}`;
  }

  /**
   * Check if yearly reset is enabled in settings (default: true).
   */
  static isYearlyResetEnabled(): boolean {
    try {
      const settings = useSettingsStore.getState();
      return settings.voucherYearlyReset !== false; // default true
    } catch {
      return true;
    }
  }

  /**
   * Parse the trailing numeric sequence out of a stored voucher number.
   * Handles both canonical ({PREFIX}-0001) and any legacy year-suffixed
   * formats ({PREFIX}-2026-0001) so migrated data still counts correctly.
   * Uses (\d+) so sequences beyond 9999 in a year never wrap or mis-parse.
   */
  static extractVoucherSequence(voucherNo: string | undefined): number {
    if (!voucherNo) return 0;
    const match = voucherNo.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Compute the NEXT voucher number for a type — strictly year-scoped and
   * gap-free (never reuses a number, even after vouchers are deleted).
   *
   * Allocation is MAX-based rather than COUNT-based:
   *   next = max(existing sequence in scope) + 1
   * so deleting voucher #3 of 5 makes the next number 6, not 3 again.
   *
   * Year scoping uses the *voucher's own date* (not the current clock year):
   * - yearly reset ON  → scope to the year of `date` (vouchers in other years ignored)
   * - yearly reset OFF → scope to ALL vouchers of the type, all years combined
   */
  static nextVoucherNumber(
    vouchers: { type: string; date: string; voucherNo?: string }[],
    type: string,
    date: string
  ): string {
    const prefix = DocumentNumberingService.getVoucherPrefix(type);
    const yearlyReset = DocumentNumberingService.isYearlyResetEnabled();
    // Guard: an empty/malformed date would make startsWith('') true for every
    // voucher and silently count ALL years — never let that happen.
    const year = date && date.length >= 4 ? date.slice(0, 4) : new Date().getFullYear().toString();

    let maxSeq = 0;
    for (const v of vouchers) {
      if (v.type !== type) continue;
      if (yearlyReset && !v.date.startsWith(year)) continue;
      const seq = DocumentNumberingService.extractVoucherSequence(v.voucherNo);
      if (seq > maxSeq) maxSeq = seq;
    }

    return `${prefix}-${String(maxSeq + 1).padStart(4, '0')}`;
  }

  /**
   * Compute the NEXT document number (PO/INV/DSP/REC/BILL) — same max-based,
   * gap-free discipline as voucher numbers. Scoped to the document's own year
   * (the year is embedded in the number as {PREFIX}-{YEAR}-{SEQ}), so deleting
   * a document never causes its number to be reused.
   */
  static nextDocumentNumber<T extends Record<string, any>>(
    documents: T[],
    noField: string,
    prefix: string,
    date: string
  ): string {
    // Custom Settings prefix wins; `prefix` doubles as its Settings key.
    const resolvedPrefix = DocumentNumberingService.getDocumentPrefix(prefix);
    const year = date && date.length >= 4 ? date.slice(0, 4) : new Date().getFullYear().toString();
    let maxSeq = 0;
    for (const doc of documents) {
      const no = doc[noField] as string | undefined;
      // Sequence across EVERY document of this field in the year, regardless
      // of its prefix: renaming a prefix mid-year (PO → BUY) must never
      // rewind the counter to 0001, and numbers stay unique per module-year.
      if (!no || !no.includes(`-${year}-`)) continue;
      const seq = DocumentNumberingService.extractVoucherSequence(no);
      if (seq > maxSeq) maxSeq = seq;
    }
    return `${resolvedPrefix}-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
  }

  /**
   * Generates a Chart of Accounts code based on type and count
   */
  static generateAccountCode(type: string, sameTypeCount: number): string {
    const prefix = DocumentNumberingService.accountTypePrefix(type);
    return `${prefix}${(sameTypeCount + 1).toString().padStart(3, '0')}`;
  }

  /** The numeric prefix a type's codes start with (Assets 1, Liabilities 2, …). */
  static accountTypePrefix(type: string): string {
    const typePrefixMap: Record<string, string> = {
      'Assets': '1', 'Liabilities': '2', 'Equity': '3', 
      'Revenue': '4', 'Cost of Goods Sold': '5', 'Expenses': '6', 
      'Other Income': '7', 'Other Expenses': '8'
    };
    return typePrefixMap[type] || '9';
  }

  /**
   * The next free Chart of Accounts code for a type.
   *
   * Max-based, never count-based: counting only the accounts of a type hands
   * out the code of a DELETED account (delete one, add one, and the new account
   * lands on the freed code) — which is how two accounts ended up sharing 1015.
   * Taking the highest code in the type's range and stepping past it can never
   * collide, however the chart is edited.
   */
  static nextAccountCode(type: string, existingCodes: string[]): string {
    const prefix = DocumentNumberingService.accountTypePrefix(type);
    const pattern = new RegExp(`^${prefix}(\\d{3})$`);
    const highest = existingCodes.reduce((max, code) => {
      const match = (code || '').trim().match(pattern);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}${String(highest + 1).padStart(3, '0')}`;
  }
}
