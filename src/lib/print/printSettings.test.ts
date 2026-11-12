import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatPrintDate, getPrintSettings } from './printSettings';
import { generateEnterpriseDocument } from '../pdfEngine';
import { useERPStore } from '../../store/useERPStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAccessStore } from '../../store/useAccessStore';

const DATE = new Date(2026, 10, 12); // 12 Nov 2026 (month 0-indexed)

const originalERP = useERPStore.getState();
const originalSettings = useSettingsStore.getState();
const originalAccess = useAccessStore.getState();

const setERPState = (partial: any) => useERPStore.setState(partial);
const setSettingsState = (partial: any) => useSettingsStore.setState(partial);

describe('print settings', () => {
  beforeEach(() => {
    setERPState({
      documentSettings: {
        footerText: 'disclaimer',
        showSignatureDisclaimer: true,
        defaultOrientation: 'Landscape',
      },
      companySettings: {
        name: 'Test Company',
        address: '1 Road',
        phone: '123',
        email: 't@example.com',
        website: 'www.example.com',
        taxNumber: 'TAX-1',
      },
      currentUser: { name: 'hamza@gmail.com', email: 'hamza@gmail.com', role: 'Admin' },
    });
    setSettingsState({
      primaryColor: '#ff0000',
      secondaryColor: '#00ff00',
      logo: null,
      logoPosition: 'left',
    });
  });

  afterEach(() => {
    setERPState({ documentSettings: { ...originalERP.documentSettings }, currentUser: { ...originalERP.currentUser }, companySettings: { ...originalERP.companySettings } });
    setSettingsState({ ...originalSettings });
    void originalAccess;
  });

  it('reads orientation, footer text and disclaimer from the settings stores', () => {
    const s = getPrintSettings();
    expect(s.document.orientation).toBe('Landscape');
    expect(s.document.footerText).toBe('disclaimer');
    expect(s.document.showSignatureDisclaimer).toBe(true);
    expect(s.company.name).toBe('Test Company');
    expect(s.branding.logoDataUrl).toBeNull();
    expect(s.output.currencyFractionDigits).toBe(2);
  });

  it('formats dates according to the configured dateFormat', () => {
    setERPState({ documentSettings: { ...useERPStore.getState().documentSettings } });
    // default format stays dd-MMM-yyyy
    expect(formatPrintDate(DATE)).toBe('12-Nov-2026');
  });
});

describe('generateEnterpriseDocument', () => {
  it('honours the configurable default orientation', async () => {
    setERPState({
      documentSettings: {
        ...useERPStore.getState().documentSettings,
        defaultOrientation: 'Landscape',
      },
    });
    const blob = await generateEnterpriseDocument({
      title: 'Orientation Test',
      tables: [{ columns: [{ header: 'A', dataKey: 'a' }], rows: [{ a: 'x' }] }],
      action: 'blob',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
  });

  it('renders footer, tables and info blocks', async () => {
    setERPState({ currentUser: { name: 'Hamza', email: 'hamza@gmail.com', role: 'Admin' } });
    const blob = await generateEnterpriseDocument({
      title: 'Smoke',
      documentNo: 'DOC-001',
      subtitle: 'Smoke subtitle',
      filters: [{ label: 'Period', value: 'All time' }],
      infoBlock: [[{ label: 'Account', value: '1001' }]],
      tables: [{ columns: [{ header: 'Item', dataKey: 'item' }], rows: [{ item: 'One' }] }],
      action: 'blob',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
  });
});
