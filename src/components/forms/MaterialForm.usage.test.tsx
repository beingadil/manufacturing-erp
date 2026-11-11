import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useERPStore } from '../../store/useERPStore';
import { MaterialForm } from './MaterialForm';

/**
 * A part ("A part of another product") is bought ready-made: it never walks a
 * processor chain, which is why the Processing Path selector is hidden for it.
 *
 * The bug this guards: the category's defaultProcessingPath is applied AFTER
 * the usage choice (pick usage → pick category), so a category defaulting to
 * `full_chain` silently overwrote `ready_made`. The part then surfaced in
 * purchase entry as "Full chain" — asking for KG and a weight per piece and
 * offering the whole processor chain for something that is never dispatched.
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

// Every category created through the Categories form is seeded with this
// default — the exact value that used to clobber a part's ready-made path.
const category = {
  id: 'cat-1',
  name: 'Kitchenware',
  description: '',
  status: 'Active',
  defaultProcessingPath: 'full_chain',
};

beforeEach(() => {
  useERPStore.setState({
    categories: [category],
    materials: [],
    products: [],
    purchases: [],
    batches: [],
    processingStages: [],
  } as any);
});

afterEach(() => {
  cleanup();
});

/** Open a SearchableSelect and click the option whose text contains `optionText`. */
function chooseFromSelect(placeholder: string, optionText: string) {
  fireEvent.click(screen.getByRole('combobox', { name: placeholder }));
  const option = Array.from(document.querySelectorAll('[role="option"]')).find(el =>
    el.textContent?.includes(optionText)
  );
  expect(option).toBeTruthy();
  fireEvent.click(option!);
}

describe('MaterialForm usage type', () => {
  it('saves a part as ready-made even when its category defaults to the full chain', () => {
    render(<MaterialForm onSaved={() => {}} onCancel={() => {}} />);

    // Usage first, then category — the order that used to lose the choice.
    // The usage cards are a radiogroup (one choice), so the options expose the
    // `radio` role rather than `button`.
    fireEvent.click(screen.getByRole('radio', { name: /a part of another product/i }));
    fireEvent.change(document.querySelector('#material-name')!, { target: { value: 'Steel Handle' } });
    chooseFromSelect('Select Category...', 'Kitchenware');

    fireEvent.click(screen.getByRole('button', { name: 'Save Material' }));

    const saved = useERPStore.getState().materials.find(m => m.name === 'Steel Handle');
    expect(saved).toBeTruthy();
    expect(saved?.usageType).toBe('component');
    expect(saved?.processingPath).toBe('ready_made');
  });

  it('keeps the hidden processing path out of a part created in the other order', () => {
    render(<MaterialForm onSaved={() => {}} onCancel={() => {}} />);

    fireEvent.change(document.querySelector('#material-name')!, { target: { value: 'Brass Rivet' } });
    chooseFromSelect('Select Category...', 'Kitchenware');
    fireEvent.click(screen.getByRole('radio', { name: /a part of another product/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Save Material' }));

    const saved = useERPStore.getState().materials.find(m => m.name === 'Brass Rivet');
    expect(saved?.usageType).toBe('component');
    expect(saved?.processingPath).toBe('ready_made');
  });

  it('still applies the category default to a sellable material', () => {
    render(<MaterialForm onSaved={() => {}} onCancel={() => {}} />);

    fireEvent.change(document.querySelector('#material-name')!, { target: { value: 'Steel Coil' } });
    chooseFromSelect('Select Category...', 'Kitchenware');

    fireEvent.click(screen.getByRole('button', { name: 'Save Material' }));

    const saved = useERPStore.getState().materials.find(m => m.name === 'Steel Coil');
    expect(saved?.usageType).toBe('sellable');
    expect(saved?.processingPath).toBe('full_chain');
  });
});
