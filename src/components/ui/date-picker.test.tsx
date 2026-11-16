import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { AnchoredOverlay } from './AnchoredOverlay';
import { DatePicker } from './date-picker';

// floating-ui (under Radix Popover) may touch ResizeObserver; jsdom has none.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ResizeObserverStub;

// jsdom reports zero-size rects, which leaves AnchoredOverlay in its hidden
// "pre-measure" state forever — give every element a real box instead.
HTMLElement.prototype.getBoundingClientRect = function () {
  return {
    width: 160, height: 40, top: 100, left: 24, right: 184, bottom: 140, x: 24, y: 100,
    toJSON() { return {}; },
  } as DOMRect;
};

beforeEach(() => cleanup());
afterEach(() => cleanup());

const dayCellButton = () =>
  document.querySelector<HTMLButtonElement>('[data-radix-popper-content-wrapper] [data-day] button');
const popperWrapper = () =>
  document.querySelector('[data-radix-popper-content-wrapper]');

describe('DatePicker', () => {
  it('closes the popover after a day is selected', () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} placeholder="Select a date" />);

    fireEvent.click(screen.getByRole('button', { name: /select a date/i }));
    expect(popperWrapper()).toBeTruthy();

    fireEvent.click(dayCellButton()!);
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(popperWrapper()).toBeNull();
  });
});

describe('DatePicker inside AnchoredOverlay (ledger period picker scenario)', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
    return (
      <>
        <button ref={setAnchorEl}>Period</button>
        <AnchoredOverlay open anchorEl={anchorEl} onClose={onClose}>
          <div>anchor-panel</div>
          <DatePicker value="" onChange={() => {}} placeholder="Select a date" />
        </AnchoredOverlay>
      </>
    );
  }

  it('keeps the panel open when the portaled calendar is clicked', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    // Open the nested date picker (its calendar portals to document.body).
    fireEvent.click(screen.getByRole('button', { name: /select a date/i }));
    expect(popperWrapper()).toBeTruthy();

    // mousedown on a calendar day button must NOT destroy the overlay panel.
    fireEvent.mouseDown(dayCellButton()!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('anchor-panel')).toBeTruthy();

    // mousedown genuinely outside closes it, as before.
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
