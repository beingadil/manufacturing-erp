import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useERPStore } from '../../store/useERPStore';
import { RawMaterialPreview } from './RawMaterialPreview';

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
  it('shows the material identity and the all-batches totals', () => {
    renderPreview();
    expect(screen.getByText('Steel Sheet 2mm')).toBeTruthy();
    expect(screen.getByText(/No\. S-1/)).toBeTruthy();
    expect(screen.getByText('All batches — totals')).toBeTruthy();
    expect(screen.getByText('Raw')).toBeTruthy();
    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(screen.getByText('WIP')).toBeTruthy();
    expect(screen.getByText('Finished')).toBeTruthy();
    expect(screen.getByText('Every batch — newest first')).toBeTruthy();
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
