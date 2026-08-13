import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { CashbookVoucherForm, VoucherFormMode } from './CashbookVoucherForm';
import { ACCENT_BAR, ACCENT_SOFT, KIND_ACCENT, KIND_ICON } from './voucherAccents';

export type VoucherPageKind = VoucherFormMode;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  kind: VoucherPageKind;
  editVoucherId?: string;
  defaultAccountId?: string;
}

const TITLES: Record<VoucherPageKind, string> = {
  'cash-payment': 'Cash Payment Voucher',
  'bank-payment': 'Bank Payment Voucher',
  'cash-receipt': 'Cash Receipt Voucher',
  'bank-receipt': 'Bank Receipt Voucher',
  journal: 'Journal Voucher',
};

const SOURCE_MODULE: Record<VoucherPageKind, string> = {
  'cash-payment': 'Cashbook',
  'bank-payment': 'Cashbook',
  'cash-receipt': 'Cashbook',
  'bank-receipt': 'Cashbook',
  journal: 'Manual',
};

export function VoucherEditorModal({ isOpen, onClose, onSaved, kind, editVoucherId, defaultAccountId }: Props) {
  if (!isOpen) return null;

  const accent = KIND_ACCENT[kind];
  const KindIcon = KIND_ICON[kind];

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-xl border border-border flex flex-col max-h-[92vh] overflow-hidden">
        {/* Accent bar */}
        <div className={cn('shrink-0 h-1 bg-gradient-to-r', ACCENT_BAR[accent])} />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm shrink-0', ACCENT_SOFT[accent])}>
              <KindIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {editVoucherId ? `Edit ${TITLES[kind]}` : `New ${TITLES[kind]}`}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {kind === 'journal'
                  ? 'Manual journal entry — the system auto-posts balanced double entries'
                  : 'The system auto-posts the balanced double entry — you only pick the other side'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors" aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <CashbookVoucherForm
            key={`${kind}-${editVoucherId || 'new'}`}
            mode={kind}
            editVoucherId={editVoucherId}
            defaultAccountId={defaultAccountId}
            sourceModule={SOURCE_MODULE[kind]}
            onSaved={onSaved}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
