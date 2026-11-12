import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useERPStore } from '../store/useERPStore';
import Categories from './Categories';
import { Customers } from './Customers';
import { FinishedGoods } from './FinishedGoods';
import { Processors } from './Processors';
import { RawMaterials } from './RawMaterials';
import { Suppliers } from './Suppliers';

/**
 * Regression suite for the bug class where a master-data modal's Save button
 * lived OUTSIDE its <form>: FormModal renders `footer` as a sibling of the
 * scroll area, so `type="submit"` had no form owner and clicking Save did
 * nothing at all — no toast, no record, no error.
 *
 * Each case drives the real page, presses the real Save button, and asserts the
 * record reached the store. If a future refactor re-severs a button from its
 * form (or moves a footer back out of one), the matching case fails.
 */

// jsdom does not implement scrollIntoView, which SearchableSelect calls to keep
// the highlighted option in view.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const category = {
  id: 'cat-1',
  name: 'Kitchenware',
  description: '',
  status: 'Active',
  defaultProcessingPath: 'full_chain',
};

const material = {
  id: 'mat-1',
  name: 'Steel Sheet 2mm',
  code: 'S-1',
  categoryId: 'cat-1',
  usageType: 'sellable',
  status: 'Active',
  processingPath: 'ready_made',
  stockPcs: 0,
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
    accounts: [],
    accountSubtypes: [],
  } as any);
});

afterEach(() => {
  cleanup();
});

const renderPage = (page: ReactElement) => render(<MemoryRouter>{page}</MemoryRouter>);

/** Open a SearchableSelect and click the option whose text contains `optionText`. */
function chooseFromSelect(placeholder: string, optionText: string) {
  fireEvent.click(screen.getByRole('combobox', { name: placeholder }));
  // The option list is portal'd and positioned by measurement, so it has no
  // place in jsdom's layout-free accessibility tree — pick it out by role.
  const option = Array.from(document.querySelectorAll('[role="option"]'))
    .find(el => el.textContent?.includes(optionText));
  expect(option).toBeTruthy();
  fireEvent.click(option!);
}

describe('master-data modal Save buttons submit their form', () => {
  it('Categories: Save Category creates the category', () => {
    renderPage(<Categories />);
    fireEvent.click(screen.getByRole('button', { name: 'New Category' }));
    fireEvent.change(document.querySelector('#category-name')!, { target: { value: 'Packaging' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Category' }));

    expect(useERPStore.getState().categories.map(c => c.name)).toContain('Packaging');
  });

  it('Raw Materials: Save Material creates the material with its category', () => {
    renderPage(<RawMaterials />);
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(document.querySelector('#material-name')!, { target: { value: 'Brass Wire 1.2mm' } });
    chooseFromSelect('Select Category...', 'Kitchenware');
    fireEvent.click(screen.getByRole('button', { name: 'Save Material' }));

    const saved = useERPStore.getState().materials.find(m => m.name === 'Brass Wire 1.2mm');
    expect(saved).toBeTruthy();
    expect(saved?.categoryId).toBe('cat-1');
  });

  it('Products: Save Product creates the product linked to its material', () => {
    renderPage(<FinishedGoods />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Product' }));
    fireEvent.change(document.querySelector('#product-name')!, { target: { value: 'Steel Tray 12in' } });
    fireEvent.change(document.querySelector('#product-price')!, { target: { value: '1850' } });
    chooseFromSelect('Add a material...', 'Steel Sheet 2mm');
    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }));

    const saved = useERPStore.getState().products.find(p => p.name === 'Steel Tray 12in');
    expect(saved).toBeTruthy();
    expect(saved?.materialId).toBe('mat-1');
    expect(saved?.sellingPrice).toBe(1850);
  });

  it('Customers: Add Customer creates the customer', () => {
    renderPage(<Customers />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New' }));
    fireEvent.change(document.querySelector('#customer-name')!, { target: { value: 'Preview Customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Customer' }));

    expect(useERPStore.getState().customers.map(c => c.name)).toContain('Preview Customer');
  });

  it('Suppliers: Add Supplier creates the supplier', () => {
    renderPage(<Suppliers />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New' }));
    fireEvent.change(document.querySelector('#supplier-name')!, { target: { value: 'Al-Rehman Steel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Supplier' }));

    expect(useERPStore.getState().suppliers.map(s => s.name)).toContain('Al-Rehman Steel');
  });

  it('Processors: Add Processor creates the processor', () => {
    renderPage(<Processors />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New' }));
    fireEvent.change(document.querySelector('#processor-name')!, { target: { value: 'Preview Processor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Processor' }));

    expect(useERPStore.getState().processors.map(p => p.name)).toContain('Preview Processor');
  });
});
