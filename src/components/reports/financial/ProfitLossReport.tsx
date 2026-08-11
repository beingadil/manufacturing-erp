import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { FinancialReportService } from "../../../lib/reporting/FinancialReportService";
import { ProfitLossStatement } from './ProfitLossStatement';

export function ProfitLossReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Year' });

  const data = useMemo(() => FinancialReportService.getProfitLossReportData(dateRange), [dateRange]);

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Profit & Loss Statement', filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: [
        { header: 'Particulars', dataKey: 'particulars', align: 'left' as const },
        { header: 'Amount', dataKey: 'amount', align: 'right' as const }
      ],
      rows: [
        ...data.revenueAccounts.map(r => ({ particulars: `  ${r.name}`, amount: formatCurrency(r.balance) })),
        { particulars: 'Total Revenue', amount: formatCurrency(data.totalRevenue) },
        ...data.cogsAccounts.map(r => ({ particulars: `  ${r.name}`, amount: formatCurrency(r.balance) })),
        { particulars: 'Cost of Goods Sold', amount: formatCurrency(data.totalCogs) },
        { particulars: 'Gross Profit', amount: formatCurrency(data.grossProfit) },
        ...data.expenseAccounts.map(r => ({ particulars: `  ${r.name}`, amount: formatCurrency(r.balance) })),
        { particulars: 'Operating Expenses', amount: formatCurrency(data.totalExpenses) },
        { particulars: 'Net Profit', amount: formatCurrency(data.netProfit) }
      ]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar
        onDateRangeChange={setDateRange}
        onExportPDF={handleExportPDF}
      />
      <ProfitLossStatement data={data} periodLabel={dateRange.label || 'the selected period'} />
    </div>
  );
}
