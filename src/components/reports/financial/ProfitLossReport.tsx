import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { FinancialReportService } from "../../../lib/reporting/FinancialReportService";

export function ProfitLossReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Year' });

  const data = useMemo(() => FinancialReportService.getProfitLossReportData(dateRange), [dateRange]);

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Profit & Loss Statement', filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: [
        { header: 'Particulars', dataKey: 'particulars', align: 'left' },
        { header: 'Amount', dataKey: 'amount', align: 'right' }
      ],
      rows: [
        { particulars: 'Sales Revenue', amount: formatCurrency(data.totalRevenue) },
        { particulars: 'Cost of Goods Sold', amount: formatCurrency(data.totalCogs) },
        { particulars: 'Gross Profit', amount: formatCurrency(data.grossProfit) },
        { particulars: 'Operating Expenses', amount: formatCurrency(data.totalExpenses) },
        { particulars: 'Net Profit', amount: formatCurrency(data.netProfit) }
      ]
    }]
  });

  const renderSection = (title: string, rows: { name: string; balance: number }[], total: number, totalClass: string) => (
    <div>
      <h3 className="text-lg font-bold text-foreground border-b border-border/50 pb-2 mb-3">{title}</h3>
      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="text-sm text-muted-foreground py-1.5 px-2">No data for this period.</div>
        )}
        {rows.map(r => (
          <div key={r.name} className="flex justify-between text-sm py-1.5 px-2 hover:bg-muted/50 rounded-md transition-colors">
            <span>{r.name}</span>
            <span className="font-medium">{formatCurrency(r.balance)}</span>
          </div>
        ))}
      </div>
      <div className={`flex justify-between font-bold text-foreground mt-3 pt-3 border-t border-border/50 px-2 ${totalClass}`}>
        <span>Total {title}</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onDateRangeChange={setDateRange} 
        onExportPDF={handleExportPDF}
      />

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden max-w-4xl mx-auto">
        <div className="p-6 border-b border-border/50 text-center bg-muted/20">
          <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">Profit & Loss Statement</h2>
          <p className="text-sm text-muted-foreground mt-1">For {dateRange.label || 'the selected period'}</p>
        </div>
        
        <div className="p-6">
          <div className="space-y-6">
            {renderSection("Revenue", data.revenueAccounts, data.totalRevenue, "")}

            {renderSection("Cost of Goods Sold", data.cogsAccounts, data.totalCogs, "")}

            {/* Gross Profit */}
            <div className="flex justify-between font-bold text-lg text-success bg-success/10 p-3 rounded-lg">
              <span>Gross Profit</span>
              <span>{formatCurrency(data.grossProfit)}</span>
            </div>

            {renderSection("Operating Expenses", data.expenseAccounts, data.totalExpenses, "")}

            {/* Net Profit */}
            <div className="flex justify-between font-bold text-xl text-primary bg-primary/10 p-4 rounded-xl mt-6 border border-primary/20">
              <span>Net Profit</span>
              <span>{formatCurrency(data.netProfit)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
