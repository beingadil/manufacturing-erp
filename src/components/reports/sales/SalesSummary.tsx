import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { DataTable, Column } from '../../DataTable';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { exportToExcel, exportToCSV } from '../../../lib/exportUtils';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";

export function SalesSummary() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => SalesReportService.getSalesSummaryData(dateRange, search), [dateRange, search]);

  const totalAmount = data.reduce((sum, s) => sum + s.totalAmount, 0);

  const columns: Column<typeof data[0]>[] = [
    { key: "customerName", label: "Customer", sortable: true },
    { key: "transactionCount", label: "Transactions", align: "right", sortable: true },
    { key: "totalPcs", label: "Total PCS", align: "right", render: (item) => formatNumber(item.totalPcs) },
    { key: "totalAmount", label: "Total Revenue", align: "right", sortable: true, render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.totalAmount)}</span> }
  ];

  const exportColumns = [
    { header: 'Customer', dataKey: 'customerName' },
    { header: 'Transactions', dataKey: 'transactionCount' },
    { header: 'Total PCS', dataKey: 'totalPcs' },
    { header: 'Total Revenue', dataKey: 'totalAmount' }
  ];

  const exportData = data.map(d => ({
    ...d,
    totalPcs: formatNumber(d.totalPcs),
    totalAmount: formatCurrency(d.totalAmount)
  }));

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Sales Summary', filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: c.dataKey !== 'customerName' ? 'right' : 'left' })),
      rows: exportData,
      summaryRows: [[{ totalPcs: 'TOTAL', totalAmount: formatCurrency(totalAmount) }]]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={setSearch} onDateRangeChange={setDateRange}
        onExportPDF={handleExportPDF}
        onExportExcel={() => exportToExcel({ filename: 'Sales_Summary.xlsx', data: exportData, columns: exportColumns })}
        onExportCSV={() => exportToCSV({ filename: 'Sales_Summary.csv', data: exportData, columns: exportColumns })}
      />
      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
