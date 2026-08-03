import { X } from 'lucide-react';
import { CashbookVoucherForm } from './CashbookVoucherForm';

export type VoucherPageKind = 'Cash Payment' | 'Bank Payment' | 'Cash Receipt' | 'Bank Receipt' | 'Journal Voucher';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  kind: VoucherPageKind;
  editVoucherId?: string;
  defaultAccountId?: string;
}

/** Maps the dedicated voucher page to the shared form's entry type + ledger kind. */
function kindToForm(kind: VoucherPageKind) {
  switch (kind) {
    case 'Cash Payment':
      return { defaultEntryType: 'Payment' as const, ledgerKind: 'cash' as const, sourceModule: 'Cashbook' as const };
    case 'Bank Payment':
      return { defaultEntryType: 'Payment' as const, ledgerKind: 'bank' as const, sourceModule: 'Cashbook' as const };
    case 'Cash Receipt':
      return { defaultEntryType: 'Receipt' as const, ledgerKind: 'cash' as const, sourceModule: 'Cashbook' as const };
    case 'Bank Receipt':
      return { defaultEntryType: 'Receipt' as const, ledgerKind: 'bank' as const, sourceModule: 'Cashbook' as const };
    case 'Journal Voucher':
      return { defaultEntryType: 'Journal' as const, ledgerKind: undefined, sourceModule: 'Manual' as const };
  }
}

const TITLES: Record<VoucherPageKind, string> = {
  'Cash Payment': 'Cash Payment Voucher',
  'Bank Payment': 'Bank Payment Voucher',
  'Cash Receipt': 'Cash Receipt Voucher',
  'Bank Receipt': 'Bank Receipt Voucher',
  'Journal Voucher': 'Journal Voucher',
};

export function VoucherEditorModal({ isOpen, onClose, onSaved, kind, editVoucherId, defaultAccountId }: Props) {
  if (!isOpen) return null;
  const cfg = kindToForm(kind);

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-xl border border-border flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {editVoucherId ? `Edit ${TITLES[kind]}` : `New ${TITLES[kind]}`}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {kind === 'Journal Voucher'
                ? 'Manual journal entry — the system auto-posts balanced double entries'
                : 'The system auto-posts the balanced double entry'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors" aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <CashbookVoucherForm
            key={`${kind}-${editVoucherId || 'new'}`}
            editVoucherId={editVoucherId}
            defaultAccountId={defaultAccountId}
            defaultEntryType={cfg.defaultEntryType}
            ledgerKind={cfg.ledgerKind}
            sourceModule={cfg.sourceModule}
            onSaved={onSaved}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
