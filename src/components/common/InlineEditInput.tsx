import { useEffect, useRef, useState } from "react";

interface InlineEditInputProps {
  /** The persisted value from the store (source of truth). */
  value: string;
  /** Called with the new value only when it actually changed (blur or Enter). */
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Controlled inline-edit input for DataTable cells.
 *
 * Unlike an uncontrolled `<input defaultValue={...} onBlur={...}>`, this keeps
 * a local draft while the user types and re-syncs it whenever the persisted
 * `value` changes — so the cell always reflects the committed store value
 * (no stale DOM, no key-hack remounts). Commit happens on blur or Enter, and
 * only when the draft differs from the persisted value. Escape reverts.
 *
 * A ref mirrors the draft so that the synchronous `blur()` inside the Escape
 * handler never commits the reverted value (setState alone would be async and
 * the blur commit would read a stale draft).
 */
export function InlineEditInput({
  value,
  onCommit,
  className,
  placeholder,
  ariaLabel,
}: InlineEditInputProps) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);

  // Re-sync the draft when the persisted value changes (external update,
  // rehydration, or after our own commit). The store value always wins.
  useEffect(() => {
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draftRef.current !== value) {
      onCommit(draftRef.current);
      // Reset the baseline to the persisted value so a following blur()
      // (e.g. after Enter) cannot double-commit with a stale closure.
      draftRef.current = value;
    }
  };

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        draftRef.current = e.target.value;
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          // Commit directly — `input.blur()` alone is unreliable in some
          // environments (jsdom no-ops when the element isn't focused).
          commit();
          // Release focus so the cell behaves like the original inline edit
          // (confirm + move on). Safe: commit() reset the baseline, so the
          // resulting blur cannot double-commit.
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          // Revert synchronously through the ref so the blur commit below
          // sees the original value and does NOT call onCommit.
          draftRef.current = value;
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
