import { VoucherListPage } from '../../components/VoucherListPage';

export function CashReceiptVoucher() {
  return (
    <VoucherListPage
      kind="cash-receipt"
      title="Cash Receipt Voucher"
      subtitle="Record money received into the cash in hand"
      accent="emerald"
    />
  );
}
