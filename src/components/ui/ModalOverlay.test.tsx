import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModalOverlay } from './ModalOverlay';

beforeEach(() => {
  document.body.style.overflow = '';
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('ModalOverlay', () => {
  it('portals to body and locks body scroll while mounted', () => {
    const { container } = render(
      <ModalOverlay>
        <div>dialog body</div>
      </ModalOverlay>
    );
    // Portal target is document.body, not the render container
    expect(container.querySelector('.fixed')).toBeNull();
    expect(screen.getByText('dialog body')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('body > .fixed')).toBeTruthy();
  });

  it('restores body scroll after unmount', () => {
    const { unmount } = render(<ModalOverlay><div>a</div></ModalOverlay>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks body scroll only when the LAST of several nested overlays unmounts', () => {
    const first = render(
      <ModalOverlay>
        <div>outer</div>
        <ModalOverlay>
          <div>inner</div>
        </ModalOverlay>
      </ModalOverlay>
    );
    expect(document.body.style.overflow).toBe('hidden');
    // Unmount inner only — scroll must stay locked
    first.rerender(
      <ModalOverlay>
        <div>outer</div>
      </ModalOverlay>
    );
    expect(document.body.style.overflow).toBe('hidden');
    first.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape when onClose is provided', () => {
    let closed = 0;
    render(<ModalOverlay onClose={() => { closed += 1; }}><div>esc me</div></ModalOverlay>);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
  });

  it('does not close on Escape without onClose', () => {
    render(<ModalOverlay><div>stay</div></ModalOverlay>);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(screen.getByText('stay')).toBeTruthy();
  });

  it('closes on backdrop click only when closeOnBackdropClick is set', () => {
    let closed = 0;
    render(
      <ModalOverlay onClose={() => { closed += 1; }} closeOnBackdropClick>
        <div>card</div>
      </ModalOverlay>
    );
    const overlays = document.querySelectorAll('body > .fixed');
    const first = overlays[overlays.length - 1] as HTMLElement;
    first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closed).toBe(1);

    let closed2 = 0;
    render(
      <ModalOverlay onClose={() => { closed2 += 1; }}>
        <div>card2</div>
      </ModalOverlay>
    );
    const overlays2 = document.querySelectorAll('body > .fixed');
    (overlays2[overlays2.length - 1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closed2).toBe(0);
  });
});
