import { useERPStore } from '../../store/useERPStore';
import { useSettingsStore } from '../../store/useSettingsStore';

export class DocumentNumberingService {
  /**
   * Generates a standardized document number across the ERP.
   * e.g. PO-2026-0001, DSP-2026-0001
   */
  static generateDocumentNumber(prefix: string, currentIndex: number): string {
    const year = new Date().getFullYear();
    const sequence = String(currentIndex + 1).padStart(4, '0');
    return `${prefix}-${year}-${sequence}`;
  }

  /**
   * Generates a voucher number based on the voucher type.
   * Format: {PREFIX}-{0001}
   */
  static generateVoucherNumber(prefix: string, count: number): string {
    const sequence = String(count + 1).padStart(4, '0');
    return `${prefix}-${sequence}`;
  }

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
      'Receipt Voucher': 'RV',
      'Payment Voucher': 'PV',
      'Purchase Voucher': 'PUV',
      'Sales Voucher': 'SV',
      'Contra Voucher': 'CV',
      'Opening Balance': 'OB',
      'Bank Payment': 'BP',
      'Bank Receipt': 'BR',
      'Cash Payment': 'CP',
      'Cash Receipt': 'CR',
      'Processor Bill': 'PB'
    };
    return defaultPrefixMap[type] || 'V';
  }

  /**
   * Count vouchers of a type — filtered by current year if yearly reset is enabled.
   */
  static countByType(vouchers: { type: string; date: string }[], type: string): number {
    const yearlyReset = DocumentNumberingService.isYearlyResetEnabled();
    if (yearlyReset) {
      const year = new Date().getFullYear().toString();
      return vouchers.filter(v => v.type === type && v.date.startsWith(year)).length;
    }
    return vouchers.filter(v => v.type === type).length;
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
   * Generates a Chart of Accounts code based on type and count
   */
  static generateAccountCode(type: string, sameTypeCount: number): string {
    const typePrefixMap: Record<string, string> = {
      'Assets': '1', 'Liabilities': '2', 'Equity': '3', 
      'Revenue': '4', 'Cost of Goods Sold': '5', 'Expenses': '6', 
      'Other Income': '7', 'Other Expenses': '8'
    };
    const prefix = typePrefixMap[type] || '9';
    return `${prefix}${(sameTypeCount + 1).toString().padStart(3, '0')}`;
  }
}
