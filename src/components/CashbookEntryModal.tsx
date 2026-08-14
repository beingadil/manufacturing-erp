import { useMemo } from 'react';
import { X } from 'lucide-react';
import { CashbookVoucherForm, VoucherFormMode } from './CashbookVoucherForm';
import { useERPStore } from '../store/useERPStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  defaultAccountId?: string;
  editVoucherId?: string;
}

/** Resolve the purpose-specific form mode from the voucher being edited. */
function resolveMode(voucherType: string | undefined): VoucherFormMode {
  switch (voucherType) {
    case 'Cash Payment': return 'cash-payment';
    case 'Bank Payment': return 'bank-payment';
    case 'Cash Receipt': return 'cash-receipt';
    case 'Bank Receipt': return 'bank-receipt';
    default: return 'journal';
  }
}

export function CashbookEntryModal({ isOpen, onClose, onSave, defaultAccountId, editVoucherId }: Props) {
  const { vouchers } = useERPStore();

  const mode = useMemo<VoucherFormMode>(() => {
    if (!editVoucherId) return 'journal';
    return resolveMode(vouchers.find(v => v.id === editVoucherId)?.type);
  }, [editVoucherId, vouchers]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-xl border border-border flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {editVoucherId ? 'Update Voucher' : 'New Cashbook Entry'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              The system auto-posts the balanced double entry for you
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <CashbookVoucherForm
            key={`${mode}-${editVoucherId || 'new'}`}
            mode={mode}
            editVoucherId={editVoucherId}
            defaultAccountId={defaultAccountId}
            onSaved={onSave}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
