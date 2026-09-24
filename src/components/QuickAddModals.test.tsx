import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ProcessingPath } from '../types/erp';
import { useERPStore } from '../store/useERPStore';
import { QuickAddMaterial } from './QuickAddModals';

/**
 * Quick-add creates a material from a name + category only, so the category's
 * default processing path pre-seeds it. That default is only applied when it is
 * safe: a `single_stage` material needs a fixed stage, and quick-add has no
 * picker for it — a single_stage material without one can never be dispatched
 * (the send guard compares against `undefined` for every stage), so it would be
 * permanent dead stock.
 */

// jsdom does not implement scrollIntoView, which SearchableSelect calls to keep
// the highlighted option in view.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  useERPStore.setState({ categories: [], materials: [] } as any);
});

function seedCategory(defaultProcessingPath?: ProcessingPath) {
  useERPStore.setState({
    categories: [{ id: 'cat-1', name: 'Lids', ...(defaultProcessingPath ? { defaultProcessingPath } : {}) }],
    materials: [],
  } as any);
}

function quickAdd(name: string) {
  render(<QuickAddMaterial isOpen onClose={() => {}} onSuccess={() => {}} />);
  // Anchored to the label: SearchableSelect also renders a hidden text input.
  const nameInput = screen.getByText('Material Name *').parentElement!.querySelector('input')!;
  fireEvent.change(nameInput, { target: { value: name } });
  fireEvent.click(screen.getByRole('combobox', { name: 'Select Category...' }));
  // The option list is portal'd and positioned by measurement, so it has no
  // place in jsdom's (layout-free) accessibility tree — pick it out by role.
  const option = Array.from(document.querySelectorAll('[role="option"]'))
    .find(el => el.textContent?.includes('Lids'));
  expect(option).toBeTruthy();
  fireEvent.click(option!);
  fireEvent.click(screen.getByText('Save Material'));
}

describe('QuickAddMaterial processing path', () => {
  it('skips a single_stage category default so the material stays dispatchable', () => {
    seedCategory('single_stage');
    quickAdd('Lid 6in');

    const material = useERPStore.getState().materials[0];
    expect(material.name).toBe('Lid 6in');
    expect(material.processingPath ?? 'full_chain').toBe('full_chain');
    expect(material.fixedStageId).toBeUndefined();
  });

  it('applies ready_made and full_chain category defaults as-is', () => {
    seedCategory('ready_made');
    quickAdd('Handle 6in');
    expect(useERPStore.getState().materials[0].processingPath).toBe('ready_made');

    cleanup();
    seedCategory('full_chain');
    quickAdd('Coil');
    expect(useERPStore.getState().materials[0].processingPath).toBe('full_chain');
  });
});
