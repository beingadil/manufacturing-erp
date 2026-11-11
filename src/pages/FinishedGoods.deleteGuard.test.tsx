import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The guard's whole contract is the message it hands the user, and sonner
// renders through a portal plus timers — so assert the call, not the DOM.
// vi.hoisted keeps the spies available to the hoisted vi.mock factory.
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess, warning: vi.fn() },
  Toaster: () => null,
}));

import { useERPStore } from '../store/useERPStore';
import { MemoryRouter } from 'react-router-dom';
import { FinishedGoods } from './FinishedGoods';

// This vitest 4 + jsdom 29 setup does not expose window.localStorage (window
// exists, sessionStorage exists, localStorage is undefined), and DataTable
// mirrors its search/sort/page state into it on mount — same shim the
// SQLiteStorageAdapter tests use.
class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(String(key)) ? this.store.get(String(key))! : null; }
  key(index: number) { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string) { this.store.delete(String(key)); }
  setItem(key: string, value: string) { this.store.set(String(key), String(value)); }
}

(globalThis as any).localStorage = new MemoryStorage();
(window as any).localStorage = (globalThis as any).localStorage;

// jsdom does not implement scrollIntoView, which SearchableSelect calls to keep
// the highlighted option in view.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const material = {
  id: 'mat-1',
  name: 'Steel Sheet 2mm',
  code: 'S-1',
  categoryId: 'cat-1',
  usageType: 'sellable',
  status: 'Active',
  processingPath: 'ready_made',
  stockPcs: 0,
  processedStockPcs: 12,
};

const product = {
  id: 'prd-1',
  name: 'Steel Tray 12in',
  sku: 'PRD-2026-0001',
  materialId: 'mat-1',
  categoryId: 'cat-1',
  sellingPrice: 1850,
  usageType: 'simple',
};

const sale = {
  id: 'sale-1',
  invoiceNo: 'INV-2026-0001',
  customerId: 'cus-1',
  productId: 'prd-1',
  date: '2026-11-06',
  pcsSold: 2,
  pricePerPiece: 1850,
  totalAmount: 3700,
};

function seed(sales: unknown[]) {
  useERPStore.setState({
    categories: [{ id: 'cat-1', name: 'Kitchenware', status: 'Active' }],
    materials: [material],
    products: [product],
    sales,
  } as any);
}

function deleteProduct() {
  render(
    <MemoryRouter>
      <FinishedGoods />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete Steel Tray 12in' }));
  fireEvent.click(screen.getByRole('button', { name: /Permanently Delete/ }));
}

afterEach(() => {
  cleanup();
  toastError.mockReset();
  toastSuccess.mockReset();
  useERPStore.setState({ categories: [], materials: [], products: [], sales: [] } as any);
});

describe('FinishedGoods delete guard', () => {
  it('refuses the delete and names the real sale count in the message', () => {
    seed([sale, { ...sale, id: 'sale-2', invoiceNo: 'INV-2026-0002' }]);

    deleteProduct();

    // The count is interpolated, not the literal `${saleCount}`.
    expect(toastError).toHaveBeenCalledWith(
      'Cannot delete — this product is referenced by 2 sale record(s). Deactivate it instead if it is no longer sold.',
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    // The product is still there — the guard must not remove it.
    expect(useERPStore.getState().products).toHaveLength(1);
    expect(useERPStore.getState().products[0].id).toBe('prd-1');
  });

  it('deletes, and confirms, when no sale references the product', () => {
    seed([]);

    deleteProduct();

    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Product deleted successfully');
    expect(useERPStore.getState().products).toHaveLength(0);
  });
});
