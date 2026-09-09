import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export interface AnchoredOverlayProps {
  /** Element the overlay anchors to. */
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Classes for the panel surface (border, bg, radius, shadow...). Sizing is managed here. */
  className?: string;
  /** Match the panel's width to the anchor's border-box width (default true). */
  matchAnchorWidth?: boolean;
  /** Floor for the panel width (px) when matchAnchorWidth is true — narrow
   *  anchors get a wider, readable panel instead of a clipped one. */
  minWidth?: number;
  /** Close when clicking anywhere outside both anchor and panel. */
  closeOnOutsideClick?: boolean;
  /** Close on any Escape keypress. */
  closeOnEscape?: boolean;
  zIndex?: number;
}

const GAP = 4; // px between anchor and panel
const MIN_PANEL_HEIGHT = 96; // keep search bar + a result visible when clamped
const VIEWPORT_MARGIN = 8;

interface PanelPosition {
  top: number;
  left: number;
  width?: number;
  height?: number;
  flipped: boolean;
}

/**
 * Computes a fixed position for a panel anchored to `anchorRect`, preferring
 * below, flipping above when there is more room, and clamping to the viewport.
 */
function computePanelPosition(
  anchorRect: DOMRect,
  panelEl: HTMLElement | null,
  matchAnchorWidth: boolean,
  minWidth = 0
): PanelPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const naturalHeight = panelEl ? panelEl.scrollHeight : 0;
  const spaceBelow = vh - anchorRect.bottom - GAP - VIEWPORT_MARGIN;
  const spaceAbove = anchorRect.top - GAP - VIEWPORT_MARGIN;

  let height: number | undefined;
  let flipped = false;
  if (panelEl && naturalHeight > 0 && naturalHeight > spaceBelow) {
    if (spaceAbove > spaceBelow && spaceAbove >= MIN_PANEL_HEIGHT) {
      flipped = true;
      height = Math.min(naturalHeight, spaceAbove);
    } else {
      height = Math.max(MIN_PANEL_HEIGHT, Math.min(naturalHeight, Math.max(spaceBelow, MIN_PANEL_HEIGHT)));
    }
  }

  // The panel may render WIDER than the anchor (min-width floor), so clamp
  // using the panel's real box, not the anchor's — otherwise a wide panel on a
  // narrow trigger near the right viewport edge overflows the screen.
  const panelWidth = panelEl ? panelEl.offsetWidth : anchorRect.width;
  const effectiveWidth = Math.max(
    matchAnchorWidth ? Math.max(anchorRect.width, minWidth) : 0,
    panelWidth
  );
  const width = matchAnchorWidth ? effectiveWidth : undefined;
  const maxLeft = vw - VIEWPORT_MARGIN - effectiveWidth;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchorRect.left, maxLeft));

  const top = flipped
    ? Math.max(VIEWPORT_MARGIN, anchorRect.top - GAP - (height ?? naturalHeight))
    : anchorRect.bottom + GAP;

  return { top, left, width, height, flipped };
}

/**
 * Renders `children` as a portal'd `position: fixed` panel anchored to `anchorEl`.
 * Architecture-level fix for searchable dropdowns: never clipped by modal or
 * scroll containers, never pushes surrounding content, immune to stacking
 * contexts, flips above the anchor near the viewport bottom.
 */
export function AnchoredOverlay({
  anchorEl,
  open,
  onClose,
  children,
  className,
  matchAnchorWidth = true,
  minWidth,
  closeOnOutsideClick = true,
  closeOnEscape = true,
  zIndex = 80,
}: AnchoredOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const recompute = useCallback(() => {
    if (!open || !anchorEl) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    // Anchor detached from layout (unmounted mid-close) — just hide.
    if (anchorRect.width === 0 && anchorRect.height === 0) return;
    setPosition(computePanelPosition(anchorRect, panelRef.current, matchAnchorWidth, minWidth));
  }, [open, anchorEl, matchAnchorWidth, minWidth]);

  // First pass: measure the panel's natural height before first paint so there
  // is no flicker; a second rAF pass catches fonts/images settling.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    recompute();
    const raf = requestAnimationFrame(recompute);
    return () => cancelAnimationFrame(raf);
  }, [open, recompute]);

  // Keep anchored during scroll (any container) and resize while open.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const onReflow = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, recompute]);

  // Outside click (mousedown so the opening click cannot immediately close it).
  useEffect(() => {
    if (!open || !closeOnOutsideClick) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        panelRef.current?.contains(t) ||
        (anchorEl && (anchorEl === t || anchorEl.contains(t)))
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, closeOnOutsideClick, anchorEl, onClose]);

  // Escape (capture phase: wins over modal close handlers, matches combobox UX).
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, closeOnEscape, onClose]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="presentation"
      data-flipped={position?.flipped || undefined}
      style={
        position
          ? {
              position: "fixed",
              top: position.top,
              left: position.left,
              width: position.width,
              height: position.height,
              zIndex,
            }
          : { position: "fixed", top: -9999, left: -9999, visibility: "hidden", zIndex } // pre-measure pass
      }
      className={cn("flex flex-col", className)}
    >
      {children}
    </div>,
    document.body
  );
}
