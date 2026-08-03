import { VoucherListPage } from '../../components/VoucherListPage';

export function BankPaymentVoucher() {
  return (
    <VoucherListPage
      kind="Bank Payment"
      title="Bank Payment Voucher"
      subtitle="Record money paid out of a bank account"
      accent="amber"
    />
  );
}
