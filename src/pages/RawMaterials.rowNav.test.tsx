import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useERPStore } from '../store/useERPStore';
import { RawMaterials } from './RawMaterials';

/**
 * Clicking anywhere on a material row must open that material's detail page
 * (the batch trail). Before this, only the category name was a link, so the row
 * itself felt dead — the numbers, the stage bar, the blank space did nothing.
 *
 * The row's own controls must keep their own behaviour: the inline rename
 * field, the category link, and the edit/delete buttons must never navigate.
 */

// This vitest 4 + jsdom 29 setup does not expose localStorage, and the persist
// middleware writes to it — same shim as the SQLiteStorageAdapter tests.
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

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const category = { id: 'cat-1', name: 'metal', description: '', status: 'Active' };

const material = {
  id: 'mat-1',
  name: 'Steel Sheet 2mm',
  code: 'S-1',
  categoryId: 'cat-1',
  usageType: 'sellable',
  status: 'Active',
  processingPath: 'full_chain',
  stockPcs: 10,
  processedStockPcs: 0,
};

beforeEach(() => {
  useERPStore.setState({
    categories: [category],
    materials: [material],
    products: [],
    customers: [],
    suppliers: [],
    processors: [],
    purchases: [],
    sales: [],
    batches: [],
    processingSends: [],
    processingReceipts: [],
    accounts: [],
    accountSubtypes: [],
    processingStages: [],
  } as any);
});

afterEach(() => {
  cleanup();
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/materials']}>
      <Routes>
        <Route path="/materials" element={<RawMaterials />} />
        <Route path="/materials/:id" element={<div>DETAIL PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('Raw Materials row navigation', () => {
  it('opens the material detail when the row is clicked anywhere', () => {
    renderPage();

    // The usage line is plain text inside the row, not a control.
    fireEvent.click(screen.getByText('sold on its own'));

    expect(screen.getByText('DETAIL PAGE')).toBeTruthy();
  });

  it('keeps the inline rename field from navigating', () => {
    renderPage();

    fireEvent.click(screen.getByRole('textbox', { name: 'Rename material Steel Sheet 2mm' }));

    expect(screen.queryByText('DETAIL PAGE')).toBeNull();
    expect(screen.getByText('Material register')).toBeTruthy();
  });

  it('keeps the delete control opening its own dialog instead of navigating', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Steel Sheet 2mm' }));

    expect(screen.queryByText('DETAIL PAGE')).toBeNull();
    expect(screen.getByRole('alertdialog', { name: 'Delete Material?' })).toBeTruthy();
  });

  it('keeps the category link opening the material detail', () => {
    renderPage();

    fireEvent.click(screen.getByRole('link', { name: 'metal' }));

    expect(screen.getByText('DETAIL PAGE')).toBeTruthy();
  });
});
