import { MultiEntryVoucher } from './MultiEntryVoucher';

export function CashPaymentVoucher() {
  return (
    <MultiEntryVoucher
      config={{
        mode: 'payment',
        title: 'Payment Voucher',
        subtitle: 'Record money going out of the business',
        accent: 'rose',
      }}
    />
  );
}
