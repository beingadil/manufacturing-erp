import { Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FinancialReportService } from "../../../lib/reporting/FinancialReportService";
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function PayableAgingReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => FinancialReportService.getPayableAgingReportData(dateRange, search), [dateRange, search]);

  const totalPayable = data.reduce((sum, item) => sum + item.balance, 0);

  return (
    <GenericReportTemplate
      title="Accounts Payable Aging"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Suppliers with Balance", value: data.length, icon: Clock },
        { title: "Total Payable", value: formatCurrency(totalPayable), icon: Clock }
      ]}
      columns={[
        { key: "supplierName", label: "Supplier Name" },
        { key: "age30", label: "0-30 Days", align: "right", render: (item) => formatCurrency(item.age30 as number) },
        { key: "age60", label: "31-60 Days", align: "right", render: (item) => formatCurrency(item.age60 as number) },
        { key: "age90", label: "61-90 Days", align: "right", render: (item) => formatCurrency(item.age90 as number) },
        { key: "ageOlder", label: "> 90 Days", align: "right", render: (item) => formatCurrency(item.ageOlder as number) },
        { key: "balance", label: "Total Outstanding", align: "right", render: (item) => <span className="font-medium text-destructive">{formatCurrency(item.balance)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        age30: formatCurrency(item.age30 as number),
        age60: formatCurrency(item.age60 as number),
        age90: formatCurrency(item.age90 as number),
        ageOlder: formatCurrency(item.ageOlder as number),
        balance: formatCurrency(item.balance)
      })}
      tableSummaryRow={[
        'TOTAL', '',
        formatCurrency(data.reduce((s, i) => s + (i.age30 as number), 0)),
        formatCurrency(data.reduce((s, i) => s + (i.age60 as number), 0)),
        formatCurrency(data.reduce((s, i) => s + (i.age90 as number), 0)),
        formatCurrency(data.reduce((s, i) => s + (i.ageOlder as number), 0)),
        <span className="font-medium text-destructive">{formatCurrency(totalPayable)}</span>
      ]}
    />
  );
}
