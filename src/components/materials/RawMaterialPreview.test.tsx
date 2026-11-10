import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useERPStore } from '../../store/useERPStore';
import { RawMaterialPreview } from './RawMaterialPreview';

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
    inventoryMovements: [],
  } as any);
});

afterEach(() => {
  cleanup();
});

const renderPreview = (props?: Partial<React.ComponentProps<typeof RawMaterialPreview>>) =>
  render(
    <MemoryRouter>
      <RawMaterialPreview
        open
        onOpenChange={() => {}}
        materialId="mat-1"
        onEdit={() => {}}
        {...props}
      />
    </MemoryRouter>
  );

describe('RawMaterialPreview', () => {
  it('shows the material identity and stock split', () => {
    renderPreview();
    expect(screen.getByText('Steel Sheet 2mm')).toBeTruthy();
    expect(screen.getByText(/No\. S-1/)).toBeTruthy();
    expect(screen.getByText('Raw')).toBeTruthy();
    expect(screen.getByText('At processor')).toBeTruthy();
    expect(screen.getByText('Finished')).toBeTruthy();
  });

  it('renders a not-found state for missing materials', () => {
    renderPreview({ materialId: 'missing' });
    expect(screen.getByText('Material not found.')).toBeTruthy();
  });

  it('fires onEdit with the material when Edit is clicked', () => {
    const onEdit = vi.fn();
    renderPreview({ onEdit });
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'mat-1' }));
  });
});
