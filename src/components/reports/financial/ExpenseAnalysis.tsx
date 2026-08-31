import { Calculator, DollarSign, } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FinancialReportService } from "../../../lib/reporting/FinancialReportService";
import { formatCurrency, formatPercent } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function ExpenseAnalysis() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => FinancialReportService.getExpenseAnalysisData(dateRange, search), [dateRange, search]);

  const grandTotal = data.reduce((sum, item) => sum + item.balance, 0);

  return (
    <GenericReportTemplate
      title="Expense Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Expense Categories", value: data.length, icon: Calculator },
        { title: "Total Expenses", value: formatCurrency(grandTotal), icon: DollarSign },
        { title: "Highest Expense", value: data.length > 0 ? data[0].accountName : 'N/A', icon: DollarSign }
      ]}
      columns={[
        { key: "code", label: "Account Code" },
        { key: "accountName", label: "Expense Account" },
        { key: "balance", label: "Amount", align: "right", render: (item) => formatCurrency(item.balance) },
        { key: "percentage", label: "% of Total", align: "right", render: (item) => formatPercent(item.percentage / 100) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        balance: formatCurrency(item.balance),
        percentage: formatPercent(item.percentage / 100)
      })}
      summaryRows={[[{ accountName: 'TOTAL EXPENSES', balance: formatCurrency(grandTotal), percentage: formatPercent(1) }]]}
    />
  );
}
