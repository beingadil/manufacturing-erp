import { VoucherListPage } from '../../components/VoucherListPage';

export function CashReceiptVoucher() {
  return (
    <VoucherListPage
      kind="Cash Receipt"
      title="Cash Receipt Voucher"
      subtitle="Record money received into the cash in hand"
      accent="emerald"
    />
  );
}
