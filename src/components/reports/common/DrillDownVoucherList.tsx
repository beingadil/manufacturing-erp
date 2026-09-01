import { format } from 'date-fns';
import { FileText, Link as LinkIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { useERPStore } from '../../../store/useERPStore';
import { VoucherDetailModal } from '../../VoucherDetailModal';
import { GenericReportTemplate } from './GenericReportTemplate';

interface DrillDownVoucherListProps {
  accountId?: string;
  startDate?: string;
  endDate?: string;
}

export function DrillDownVoucherList({ accountId, startDate, endDate }: DrillDownVoucherListProps) {
  const vouchers = useERPStore(s => s.vouchers);
  const journalEntries = useERPStore(s => s.journalEntries);
  const [search, setSearch] = useState('');
  const [localDateRange, setLocalDateRange] = useState({ start: startDate || '', end: endDate || '' });

  const data = useMemo(() => {
    let filteredVouchers = vouchers;

    const effStart = localDateRange.start || startDate;
    const effEnd = localDateRange.end || endDate;

    if (effStart && effEnd) {
      const start = new Date(effStart);
      const end = new Date(effEnd);
      start.setHours(0,0,0,0); end.setHours(23,59,59,999);
      filteredVouchers = filteredVouchers.filter(v => {
        const d = new Date(v.date);
        return d >= start && d <= end;
      });
    }

    if (accountId) {
      const voucherIdsWithAccount = new Set(journalEntries.filter(je => je.accountId === accountId).map(je => je.voucherId));
      filteredVouchers = filteredVouchers.filter(v => voucherIdsWithAccount.has(v.id));
    }

    if (search) {
      const lower = search.toLowerCase();
      filteredVouchers = filteredVouchers.filter(v => 
        v.voucherNo.toLowerCase().includes(lower) || 
        v.narration.toLowerCase().includes(lower)
      );
    }

    return filteredVouchers.map(v => ({
      id: v.id,
      date: format(new Date(v.date), 'yyyy-MM-dd'),
      voucherNo: v.voucherNo,
      type: v.type,
      narration: v.narration,
      totalDebit: v.totalDebit,
      totalCredit: v.totalCredit,
      rawVoucher: v // store raw voucher
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [vouchers, journalEntries, accountId, startDate, endDate, search, localDateRange]);

  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);

  const kpis = [
    { title: 'Total Vouchers', value: data.length.toString(), icon: FileText },
    { title: 'Total Amount (Dr)', value: formatCurrency(data.reduce((sum, item) => sum + item.totalDebit, 0)), icon: FileText }
  ];

  const columns = [
    { key: 'date', label: 'Date', sortable: true },
    { key: 'voucherNo', label: 'Voucher No', sortable: true, render: (item: any) => (
      <button 
        onClick={() => setSelectedVoucherId(item.id)}
        className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium hover:underline transition-colors"
      >
        <LinkIcon className="h-3 w-3" />
        {item.voucherNo}
      </button>
    )},
    { key: 'type', label: 'Type', sortable: true },
    { key: 'narration', label: 'Narration' },
    { key: 'totalDebit', label: 'Total Debit', sortable: true, render: (item: any) => formatCurrency(item.totalDebit) },
    { key: 'totalCredit', label: 'Total Credit', sortable: true, render: (item: any) => formatCurrency(item.totalCredit) }
  ];

  return (
    <>
      <GenericReportTemplate
        title="Drill-Down Vouchers"
        data={data}
        columns={columns}
        kpis={kpis}
        onDateRangeChange={(range) => setLocalDateRange(range)}
        onSearch={setSearch}
      />

      {selectedVoucherId && (
        <VoucherDetailModal
          voucherId={selectedVoucherId}
          onClose={() => setSelectedVoucherId(null)}
        />
      )}
    </>
  );
}