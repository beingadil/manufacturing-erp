import { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { AppError } from '../lib/errorHandler';

type DatabaseMiddleware = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>,
  name?: string
) => StateCreator<T, Mps, Mcs>;

type DatabaseMiddlewareImpl = <T>(
  f: StateCreator<T, [], []>,
  name?: string
) => StateCreator<T, [], []>;

export const databaseMiddlewareImpl: DatabaseMiddlewareImpl = (f, name) => (set, get, api) => {
  const loggedSet: typeof set = (...a) => {
    const nextStateRaw = typeof a[0] === 'function' ? (a[0] as Function)(get()) : a[0];
    const prevState = get() as any;
    const nextState = { ...prevState, ...nextStateRaw };

    try {
      validateBusinessRules(prevState, nextState);
    } catch (e: any) {
      console.error('Business Rule Violation:', e.message);
      throw e;
    }

    (set as any)(...a);
  };

  return f(loggedSet, get, api);
};

export const databaseMiddleware = databaseMiddlewareImpl as unknown as DatabaseMiddleware;

function validateBusinessRules(prevState: any, nextState: any) {
  // Only check critical business invariants.
  // FK / unique constraints are enforced by SQLite directly.

  const nextMaterials: any[] = nextState.materials || [];
  const prevMaterials: any[] = prevState.materials || [];
  if (prevMaterials !== nextMaterials) {
    for (const row of nextMaterials) {
      if ((row.stockPcs || 0) < 0) throw new AppError(`Negative stock for material ${row.name}`, 'DATABASE_ERROR');
      if ((row.processedStockPcs || 0) < 0) throw new AppError(`Negative processed stock for material ${row.name}`, 'DATABASE_ERROR');
    }
  }

  const nextProducts: any[] = nextState.products || [];
  const prevProducts: any[] = prevState.products || [];
  if (prevProducts !== nextProducts) {
    for (const row of nextProducts) {
      if ((row.stockPcs || 0) < 0) throw new AppError(`Negative stock for product ${row.name}`, 'DATABASE_ERROR');
    }
  }

  const nextVouchers: any[] = nextState.vouchers || [];
  const prevVouchers: any[] = prevState.vouchers || [];
  const nextEntries: any[] = nextState.journalEntries || [];
  const prevEntries: any[] = prevState.journalEntries || [];
  if (prevVouchers !== nextVouchers || prevEntries !== nextEntries) {
    const addedVouchers = nextVouchers.filter((row: any) => !new Set(prevVouchers).has(row));
    for (const voucher of addedVouchers) {
      const entries = nextEntries.filter((e: any) => e.voucherId === voucher.id);
      const totalDebit = entries.reduce((sum: number, e: any) => sum + (e.debit || 0), 0);
      const totalCredit = entries.reduce((sum: number, e: any) => sum + (e.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new AppError(`Voucher ${voucher.voucherNo} does not balance (Debit: ${totalDebit}, Credit: ${totalCredit})`, 'DATABASE_ERROR');
      }
    }
  }
}
