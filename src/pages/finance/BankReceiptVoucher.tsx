import { VoucherListPage } from '../../components/VoucherListPage';

export function BankReceiptVoucher() {
  return (
    <VoucherListPage
      kind="Bank Receipt"
      title="Bank Receipt Voucher"
      subtitle="Record money received into a bank account"
      accent="sky"
    />
  );
}
