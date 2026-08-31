import { X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

interface PageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Max width class, defaults to max-w-lg */
  maxWidth?: string;
}

/**
 * Accessible page modal with:
 * - role="dialog" + aria-modal="true"
 * - Focus trap (Tab / Shift+Tab cycle within modal)
 * - Escape key to close
 * - overscroll-behavior: contain on the content area
 * - Click outside to close
 */
export function PageModal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }: PageModalProps) {
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

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className={`bg-card rounded-2xl shadow-xl w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden outline-none`}
        style={{ overscrollBehavior: 'contain' }}
      >
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
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
