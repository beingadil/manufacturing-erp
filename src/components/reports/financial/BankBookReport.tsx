import { format } from 'date-fns';
import { Landmark } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FinancialReportService } from "../../../lib/reporting/FinancialReportService";
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function BankBookReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => FinancialReportService.getBankBookReportData(dateRange, search), [dateRange, search]);

  return (
    <GenericReportTemplate
      title="Bank Book"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Transactions", value: data.length, icon: Landmark }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "voucherNo", label: "Voucher No" },
        { key: "accountName", label: "Bank Account" },
        { key: "type", label: "Type", render: (item) => <span className={item.type === 'Debit' ? "text-emerald-600" : "text-rose-600"}>{item.type === 'Debit' ? 'Receipt' : 'Payment'}</span> },
        { key: "amount", label: "Amount", align: "right", render: (item) => formatCurrency(item.amount) },
        { key: "runningBalance", label: "Balance", align: "right", render: (item) => <span className="font-medium">{formatCurrency(item.runningBalance)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        amount: formatCurrency(item.amount),
        runningBalance: formatCurrency(item.runningBalance)
      })}
    />
  );
}
