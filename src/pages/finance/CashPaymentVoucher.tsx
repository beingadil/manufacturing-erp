import { VoucherListPage } from '../../components/VoucherListPage';

export function CashPaymentVoucher() {
  return (
    <VoucherListPage
      kind="cash-payment"
      title="Cash Payment Voucher"
      subtitle="Record money paid out of the cash in hand"
      accent="rose"
    />
  );
}
