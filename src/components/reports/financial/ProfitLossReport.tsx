import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { exportToExcel, exportToCSV } from '../../../lib/exportUtils';
import { format } from 'date-fns';
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
        { particulars: 'Sales Revenue', amount: formatCurrency(data.totalSalesAmount) },
        { particulars: 'Raw Material Purchases', amount: formatCurrency(data.totalPurchasesAmount) },
        { particulars: 'Gross Profit', amount: formatCurrency(data.grossProfit) },
        { particulars: 'Processing Charges', amount: formatCurrency(data.totalProcessingBills) },
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

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden max-w-4xl mx-auto">
        <div className="p-6 border-b border-border/50 text-center bg-muted/20">
          <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">Profit & Loss Statement</h2>
          <p className="text-sm text-muted-foreground mt-1">For {dateRange.label || 'the selected period'}</p>
        </div>
        
        <div className="p-6">
          <div className="space-y-6">
            {/* Revenue */}
            <div>
              <h3 className="text-lg font-bold text-foreground border-b border-border/50 pb-2 mb-3">Revenue</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm py-1.5 px-2 hover:bg-muted/50 rounded-md transition-colors">
                  <span>Sales Revenue</span>
                  <span className="font-medium">{formatCurrency(data.totalSalesAmount)}</span>
                </div>
              </div>
              <div className="flex justify-between font-bold text-foreground mt-3 pt-3 border-t border-border/50 px-2">
                <span>Total Revenue</span>
                <span>{formatCurrency(data.totalSalesAmount)}</span>
              </div>
            </div>

            {/* Cost of Sales */}
            <div>
              <h3 className="text-lg font-bold text-foreground border-b border-border/50 pb-2 mb-3">Cost of Sales</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm py-1.5 px-2 hover:bg-muted/50 rounded-md transition-colors">
                  <span>Raw Material Purchases</span>
                  <span className="font-medium">{formatCurrency(data.totalPurchasesAmount)}</span>
                </div>
              </div>
              <div className="flex justify-between font-bold text-foreground mt-3 pt-3 border-t border-border/50 px-2">
                <span>Total Cost of Sales</span>
                <span>{formatCurrency(data.totalPurchasesAmount)}</span>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="flex justify-between font-bold text-lg text-success bg-success/10 p-3 rounded-lg">
              <span>Gross Profit</span>
              <span>{formatCurrency(data.grossProfit)}</span>
            </div>

            {/* Operating Expenses */}
            <div>
              <h3 className="text-lg font-bold text-foreground border-b border-border/50 pb-2 mb-3">Operating Expenses</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm py-1.5 px-2 hover:bg-muted/50 rounded-md transition-colors">
                  <span>Processing Charges</span>
                  <span className="font-medium">{formatCurrency(data.totalProcessingBills)}</span>
                </div>
              </div>
              <div className="flex justify-between font-bold text-foreground mt-3 pt-3 border-t border-border/50 px-2">
                <span>Total Operating Expenses</span>
                <span>{formatCurrency(data.totalProcessingBills)}</span>
              </div>
            </div>

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
