import { VoucherListPage } from '../../components/VoucherListPage';

export function JournalVoucher() {
  return (
    <VoucherListPage
      kind="journal"
      title="Journal Voucher"
      subtitle="Manual adjusting entries — the system auto-posts balanced double entries"
      accent="amber"
    />
  );
}
