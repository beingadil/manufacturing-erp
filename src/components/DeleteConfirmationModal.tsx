import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  recordNo?: string;
  description?: string;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete Record",
  recordNo,
  description = "Are you sure you want to permanently delete this record?"
}: DeleteConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md border border-destructive/20 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 bg-destructive/100/10 flex flex-col items-center text-center">
          <div className="h-16 w-16 bg-destructive/20 dark:bg-destructive/30 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive " />
          </div>
          <h2 className="text-xl font-bold text-destructive">{title}</h2>
          {recordNo && <p className="font-mono mt-2 text-foreground/80 bg-background/50 px-3 py-1 rounded-md">{recordNo}</p>}
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {description}
            <br/><br/>
            <span className="font-semibold text-foreground">This action cannot be undone.</span> All linked accounting entries, vouchers, and stock movements will be reversed automatically.
          </p>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 rounded-xl bg-destructive px-4 py-3 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Permanently Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
