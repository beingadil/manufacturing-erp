import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The shared PDF engine — the one that applies the Print & PDF settings.
const generateEnterpriseDocument = vi.fn();
vi.mock('../lib/pdfEngine', () => ({
  generateEnterpriseDocument: (...args: unknown[]) => generateEnterpriseDocument(...args),
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

const filterFinancialData = vi.fn((rows: unknown[]) => rows);
vi.mock('../lib/abac', () => ({
  filterFinancialData: (...args: unknown[]) => filterFinancialData(...(args as [])),
}));

// The tab reads the signed-in profile for row-level access control.
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u-1' }, isAdmin: true, dataPolicies: [] }),
}));

import { useERPStore } from '../store/useERPStore';
import { VoucherHistoryTab } from './VoucherHistoryTab';

const voucher = {
  id: 'v-1',
  voucherNo: 'PUV-0007',
  type: 'Purchase Voucher',
  date: '2026-11-12',
  referenceNo: 'PO-2026-0009',
  narration: 'Steel sheets',
  status: 'Posted',
  totalDebit: 120000,
  totalCredit: 120000,
  sourceModule: 'Purchase',
};

beforeEach(() => {
  generateEnterpriseDocument.mockClear();
  filterFinancialData.mockClear();
  useERPStore.setState({ vouchers: [voucher] } as any);
});

afterEach(() => {
  cleanup();
});

describe('VoucherHistoryTab print', () => {
  it('prints through the shared PDF engine, not a hand-written HTML window', async () => {
    render(<VoucherHistoryTab sourceModule="Purchase" />);

    // The old path opened a blank window and wrote raw HTML into it.
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const writeSpy = vi.spyOn(window.document, 'write').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));

    await waitFor(() => expect(generateEnterpriseDocument).toHaveBeenCalledTimes(1));

    const config = generateEnterpriseDocument.mock.calls[0][0] as any;
    expect(config.action).toBe('print');
    expect(config.title).toContain('Voucher History');
    // The rows the engine renders must carry the voucher data.
    expect(config.tables[0].rows).toEqual([
      expect.objectContaining({ voucherNo: 'PUV-0007', reference: 'PO-2026-0009', status: 'Posted' }),
    ]);
    expect(config.tables[0].columns.map((c: any) => c.header)).toEqual([
      'Date',
      'Voucher No',
      'Type',
      'Reference',
      'Debit',
      'Credit',
      'Status',
    ]);

    // Nothing may write raw HTML into a popup window any more.
    expect(openSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();

    openSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('does not print when no vouchers match the filters', () => {
    useERPStore.setState({ vouchers: [] } as any);
    render(<VoucherHistoryTab sourceModule="Purchase" />);

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(generateEnterpriseDocument).not.toHaveBeenCalled();
  });
});
