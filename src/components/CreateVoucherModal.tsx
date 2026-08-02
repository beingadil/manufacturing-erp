import { X } from 'lucide-react';
import { CashbookVoucherForm } from './CashbookVoucherForm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function CreateVoucherModal({ isOpen, onClose, onSave }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-xl border border-border flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Create Voucher</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manual journal entry — the system auto-posts balanced double entries
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors" aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <CashbookVoucherForm
            defaultEntryType="Journal"
            sourceModule="Manual"
            onSaved={onSave}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
