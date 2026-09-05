import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Nested overlays (e.g. a detail modal above a party ledger) each lock body
// scroll; a simple save/restore of `overflow` breaks when they close because
// cleanup order is not guaranteed to restore the outer snapshot last. Count
// active locks instead and only clear once the last overlay unmounts.
let bodyScrollLockCount = 0;

interface ModalOverlayProps {
  children: ReactNode;
  /** Escape key closes the dialog; also enables backdrop-click close when closeOnBackdropClick is set. */
  onClose?: () => void;
  /** Stacking order — must sit above the fixed header (z-40). Default 60. */
  zIndex?: number;
  /**
   * 'dark' — black 50% dim + 8px frosted blur (module entry forms).
   * 'frost' — background-tinted dim + soft blur (voucher editors).
   */
  variant?: 'dark' | 'frost';
  closeOnBackdropClick?: boolean;
  /** Extra classes appended to the overlay (e.g. enter animations). */
  overlayClassName?: string;
}

/**
 * One shared full-screen modal backdrop so the hardened behavior is owned in a
 * single place instead of being re-implemented per dialog:
 * - Portals to document.body, so no ancestor transform/filter/containing block
 *   can clip it or break position:fixed (the "backdrop does not cover the top
 *   navigation bar" bug class).
 * - Explicit full-viewport fixed geometry + z-index above the fixed header.
 * - Dim + blur, body scroll lock while mounted, Escape to close, optional
 *   backdrop-click to close.
 */
export function ModalOverlay({
  children,
  onClose,
  zIndex = 60,
  variant = 'dark',
  closeOnBackdropClick = false,
  overlayClassName = '',
}: ModalOverlayProps) {
  // Escape to close
  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll while any modal is open
  useEffect(() => {
    bodyScrollLockCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      bodyScrollLockCount -= 1;
      if (bodyScrollLockCount <= 0) {
        bodyScrollLockCount = 0;
        document.body.style.overflow = '';
      }
    };
  }, []);

  const backdropClass =
    variant === 'frost'
      ? 'bg-background/80 backdrop-blur-sm'
      : 'bg-black/50 backdrop-blur';

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${backdropClass} ${overlayClassName}`}
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex }}
      onClick={(e) => {
        if (closeOnBackdropClick && onClose && e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    document.body
  );
}
