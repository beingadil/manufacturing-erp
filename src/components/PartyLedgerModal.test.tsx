import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useERPStore } from '../store/useERPStore';
import { PartyLedgerModal } from './PartyLedgerModal';

const renderModal = (props: Parameters<typeof PartyLedgerModal>[0]) =>
  render(
    <MemoryRouter>
      <PartyLedgerModal {...props} />
    </MemoryRouter>
  );

// Minimal store fixtures mirroring the real entity shapes.
const account = {
  id: 'acc-cus-1',
  code: '1101',
  name: 'Adil Traders',
  subtypeId: 'sub-ar',
  type: 'Assets' as const,
  openingBalance: 1000,
  openingBalanceType: 'Debit' as const,
  status: 'Active' as const,
  isSystem: false,
  linkedEntityId: 'cus-1',
};

const voucher = {
  id: 'v-1',
  voucherNo: 'CR-0001',
  date: '2026-01-15',
  type: 'Cash Receipt' as const,
  referenceNo: 'INV-101',
  sourceModule: 'Cashbook' as const,
  narration: 'Payment received against invoice',
  totalDebit: 500,
  totalCredit: 500,
  createdAt: '2026-01-15T10:00:00Z',
  status: 'Posted' as const,
};

const entry = {
  id: 'je-1',
  voucherId: 'v-1',
  accountId: 'acc-cus-1',
  debit: 500,
  credit: 0,
  narration: 'Payment received against invoice',
};

const cancelledVoucher = {
  ...voucher,
  id: 'v-2',
  voucherNo: 'CR-0002',
  status: 'Cancelled' as const,
};
const cancelledEntry = { ...entry, id: 'je-2', voucherId: 'v-2' };

beforeEach(() => {
  useERPStore.setState({
    accounts: [account],
    vouchers: [voucher, cancelledVoucher],
    journalEntries: [entry, cancelledEntry],
  } as any);
});

afterEach(() => {
  cleanup();
  useERPStore.setState({ accounts: [], vouchers: [], journalEntries: [] } as any);
});

describe('PartyLedgerModal', () => {
  it('renders the party header and linked account', () => {
    renderModal({ party: { id: 'cus-1', name: 'Adil Traders', kind: 'Customer' }, onClose: () => {} });
    expect(screen.getByText('Adil Traders')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText(/1101 — Adil Traders/)).toBeTruthy();
  });

  it('shows the receivable balance card and ledger rows', () => {
    renderModal({ party: { id: 'cus-1', name: 'Adil Traders', kind: 'Customer' }, onClose: () => {} });
    // Balance Receivable card (opening 1000 + 500 debit = 1500 Dr)
    expect(screen.getByText('Balance Receivable')).toBeTruthy();
    expect(screen.getAllByText(/1,500 Dr/).length).toBeGreaterThan(0);
    // Posted voucher appears
    expect(screen.getByText('CR-0001')).toBeTruthy();
  });

  it('excludes cancelled vouchers from the ledger (spec §14)', () => {
    renderModal({ party: { id: 'cus-1', name: 'Adil Traders', kind: 'Customer' }, onClose: () => {} });
    // Cancelled CR-0002 must not appear; only CR-0001 does.
    expect(screen.queryByText('CR-0002')).toBeNull();
    expect(screen.getByText('CR-0001')).toBeTruthy();
  });

  it('shows an empty state when the party has no linked account', () => {
    renderModal({ party: { id: 'missing', name: 'Ghost', kind: 'Supplier' }, onClose: () => {} });
    expect(screen.getByText(/No linked account found/i)).toBeTruthy();
  });
});
