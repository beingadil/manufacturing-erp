import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { FinancialReportService } from '../../../lib/reporting/FinancialReportService';
import { BalanceSheetStatement } from './BalanceSheetStatement';

export function BalanceSheetReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'As of Today' });
  const asOfDate = dateRange.end || '';

  const data = useMemo(() => FinancialReportService.getBalanceSheetData(asOfDate || undefined), [asOfDate]);

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Balance Sheet', filters: [{ label: 'As Of', value: dateRange.label }],
    tables: [{
      columns: [
        { header: 'Particulars', dataKey: 'particulars', align: 'left' as const },
        { header: 'Amount', dataKey: 'amount', align: 'right' as const }
      ],
      rows: [
        ...data.assetGroups.flatMap(g => [
          { particulars: g.label, amount: formatCurrency(g.total) },
          ...g.rows.map(r => ({ particulars: `  ${r.name}`, amount: formatCurrency(r.balance) }))
        ]),
        { particulars: 'Total Assets', amount: formatCurrency(data.totalAssets) },
        ...data.liabilityGroups.flatMap(g => [
          { particulars: g.label, amount: formatCurrency(g.total) },
          ...g.rows.map(r => ({ particulars: `  ${r.name}`, amount: formatCurrency(r.balance) }))
        ]),
        { particulars: 'Total Liabilities', amount: formatCurrency(data.totalLiabilities) },
        { particulars: 'Equity (incl. current profit)', amount: formatCurrency(data.totalEquity) },
        { particulars: 'Total Liabilities & Equity', amount: formatCurrency(data.totalLiabilities + data.totalEquity) }
      ]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar
        onDateRangeChange={setDateRange}
        onExportPDF={handleExportPDF}
      />
      <BalanceSheetStatement data={data} asOfLabel={dateRange.label || new Date().toLocaleDateString()} />
    </div>
  );
}
