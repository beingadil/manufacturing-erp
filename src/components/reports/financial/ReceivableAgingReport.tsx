import { Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FinancialReportService } from "../../../lib/reporting/FinancialReportService";
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function ReceivableAgingReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => FinancialReportService.getReceivableAgingReportData(dateRange, search), [dateRange, search]);

  const totalReceivable = data.reduce((sum, item) => sum + item.balance, 0);

  return (
    <GenericReportTemplate
      title="Accounts Receivable Aging"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Customers with Balance", value: data.length, icon: Clock },
        { title: "Total Receivable", value: formatCurrency(totalReceivable), icon: Clock }
      ]}
      columns={[
        { key: "customerName", label: "Customer Name" },
        { key: "age30", label: "0-30 Days", align: "right", render: (item) => formatCurrency(item.age30 as number) },
        { key: "age60", label: "31-60 Days", align: "right", render: (item) => formatCurrency(item.age60 as number) },
        { key: "age90", label: "61-90 Days", align: "right", render: (item) => formatCurrency(item.age90 as number) },
        { key: "ageOlder", label: "> 90 Days", align: "right", render: (item) => formatCurrency(item.ageOlder as number) },
        { key: "balance", label: "Total Outstanding", align: "right", render: (item) => <span className="font-medium text-emerald-600">{formatCurrency(item.balance)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        age30: formatCurrency(item.age30 as number),
        age60: formatCurrency(item.age60 as number),
        age90: formatCurrency(item.age90 as number),
        ageOlder: formatCurrency(item.ageOlder as number),
        balance: formatCurrency(item.balance)
      })}
    />
  );
}
