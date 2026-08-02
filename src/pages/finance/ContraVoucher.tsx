import { MultiEntryVoucher } from './MultiEntryVoucher';

export function ContraVoucher() {
  return (
    <MultiEntryVoucher
      config={{
        mode: 'contra',
        title: 'Contra Voucher',
        subtitle: 'Transfer between cash and bank accounts',
        accent: 'amber',
      }}
    />
  );
}
