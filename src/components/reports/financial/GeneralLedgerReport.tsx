import { format } from 'date-fns';
import { FileText, Link as LinkIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FinancialReportService } from '../../../lib/reporting/FinancialReportService';
import { formatCurrency } from '../../../lib/utils';
import { VoucherDetailModal } from '../../VoucherDetailModal';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function GeneralLedgerReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);

  const data = useMemo(() => {
    return FinancialReportService.getGeneralLedger(dateRange, search);
  }, [dateRange, search]);

  const totalDebit = data.filter(d => d.type === 'Debit').reduce((sum, item) => sum + item.amount, 0);
  const totalCredit = data.filter(d => d.type === 'Credit').reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <GenericReportTemplate
        title="General Ledger"
        data={data}
        onDateRangeChange={setDateRange}
        onSearch={setSearch}
        kpis={[
          { title: "Total Entries", value: data.length, icon: FileText },
          { title: "Total Debit", value: formatCurrency(totalDebit), icon: FileText },
          { title: "Total Credit", value: formatCurrency(totalCredit), icon: FileText }
        ]}
        columns={[
          { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
          { key: "voucherNo", label: "Voucher No", render: (item) => (
            <button 
              onClick={() => setSelectedVoucherId((item as any).voucherId)}
              className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium hover:underline transition-colors"
            >
              <LinkIcon className="h-3 w-3" />
              {item.voucherNo}
            </button>
          )},
          { key: "accountCode", label: "Code" },
          { key: "accountName", label: "Account" },
          { key: "partyName", label: "Party" },
          { key: "description", label: "Description", render: (item) => <span className="truncate max-w-[200px] block" title={item.description}>{item.description}</span> },
          { key: "type", label: "Type", render: (item) => <span className={item.type === 'Debit' ? "text-success" : "text-destructive"}>{item.type}</span> },
          { key: "amount", label: "Amount", align: "right", render: (item) => formatCurrency(item.amount) }
        ]}
        exportDataMapping={(item) => ({
          ...item,
          date: format(new Date(item.date), 'dd-MMM-yyyy'),
          amount: formatCurrency(item.amount)
        })}
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
