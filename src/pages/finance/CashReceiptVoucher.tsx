import { MultiEntryVoucher } from './MultiEntryVoucher';

export function CashReceiptVoucher() {
  return (
    <MultiEntryVoucher
      config={{
        mode: 'receipt',
        title: 'Receipt Voucher',
        subtitle: 'Record money coming into the business',
        accent: 'emerald',
      }}
    />
  );
}
