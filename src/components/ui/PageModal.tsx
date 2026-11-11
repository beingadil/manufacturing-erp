import { X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Max width class, defaults to max-w-lg */
  maxWidth?: string;
  /** Custom header content rendered above the scroll area (replaces the default title bar). */
  header?: ReactNode;
  /** Footer bar rendered below the scroll area (sticks to the bottom). */
  footer?: ReactNode;
}

/**
 * Accessible page modal with:
 * - role="dialog" + aria-modal="true"
 * - Focus trap (Tab / Shift+Tab cycle within modal)
 * - Escape key to close
 * - overscroll-behavior: contain on the content area
 * - Click outside to close
 */
export function PageModal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg', header, footer }: PageModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Remember which element had focus before opening
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus the content container after mount
      requestAnimationFrame(() => {
        contentRef.current?.focus();
      });
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen]);

  // Escape key handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }

    // Focus trap: Tab / Shift+Tab
    if (e.key === 'Tab' && contentRef.current) {
      const focusable = contentRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const isInside = active !== null && contentRef.current.contains(active);

      // Redirect Tab whenever focus is outside the modal OR at the boundary —
      // a robust trap cannot be escaped by Tab.
      if (!isInside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll while modal is open
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Portaled to document.body so no ancestor (transform/filter/containing block)
  // can clip the overlay or break `position: fixed` — it always covers the full
  // viewport, above the fixed header (z-40).
  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className={`bg-card rounded-2xl shadow-xl w-full ${maxWidth} flex flex-col overflow-hidden outline-none max-h-[calc(100vh-2rem)]`}
        style={{ overscrollBehavior: 'contain' }}
      >
        {header ?? (
          <div className="px-6 py-4 border-b border-border flex justify-between items-center shrink-0">
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground/80" />
            </button>
          </div>
        )}
        {/* The modal itself is capped to the viewport (the overlay's p-4 is the
            2rem gutter), so the body flexes inside it and scrolls — capping the
            BODY at 80vh instead let header + body + footer overflow a short
            laptop screen. */}
        <div className="p-5 space-y-3 flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {children}
        </div>
        {footer}
      </div>
    </div>,
    document.body
  );
}
