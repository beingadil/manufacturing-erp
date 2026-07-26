import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { DataTable, Column } from '../../DataTable';
import { ReportKPICard } from '../common/ReportKPICard';
import { DollarSign, Hash, Users, Package, ShoppingCart } from 'lucide-react';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { exportToExcel, exportToCSV } from '../../../lib/exportUtils';
import { format } from 'date-fns';
import { SalesReportService } from '../../../lib/reporting/SalesReportService';

export function SalesRegister() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    return SalesReportService.getSalesRegister(dateRange, search);
  }, [dateRange, search]);

  const totalSales = data.length;
  const totalPcs = data.reduce((sum, s) => sum + s.pcsSold, 0);
  const totalAmount = data.reduce((sum, s) => sum + s.totalAmount, 0);

  const columns: Column<typeof data[0]>[] = [
    { key: "date", label: "Date", sortable: true, render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
    { key: "invoiceNo", label: "Invoice No", sortable: true },
    { key: "customerName", label: "Customer", sortable: true },
    { key: "productName", label: "Product", sortable: true },
    { key: "pcsSold", label: "PCS", align: "right", render: (item) => formatNumber(item.pcsSold) },
    { key: "pricePerPiece", label: "Price", align: "right", render: (item) => formatCurrency(item.pricePerPiece) },
    { key: "totalAmount", label: "Amount", align: "right", sortable: true, render: (item) => <span className="font-medium">{formatCurrency(item.totalAmount)}</span> }
  ];

  const exportColumns = [
    { header: 'Date', dataKey: 'date' },
    { header: 'Invoice No', dataKey: 'invoiceNo' },
    { header: 'Customer', dataKey: 'customerName' },
    { header: 'Product', dataKey: 'productName' },
    { header: 'PCS', dataKey: 'pcsSold' },
    { header: 'Price', dataKey: 'pricePerPiece' },
    { header: 'Amount', dataKey: 'totalAmount' }
  ];

  const exportData = data.map(d => ({
    ...d,
    date: format(new Date(d.date), 'dd-MMM-yyyy'),
    pcsSold: formatNumber(d.pcsSold),
    pricePerPiece: formatCurrency(d.pricePerPiece),
    totalAmount: formatCurrency(d.totalAmount)
  }));

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Sales Register', filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: ['pcsSold','pricePerPiece','totalAmount'].includes(c.dataKey) ? 'right' : 'left' })),
      rows: exportData,
      summaryRows: [[{ pricePerPiece: 'TOTAL', totalAmount: formatCurrency(totalAmount) }]]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={setSearch} onDateRangeChange={setDateRange}
        onExportPDF={handleExportPDF}
        onExportExcel={() => exportToExcel({ filename: 'Sales_Register.xlsx', data: exportData, columns: exportColumns })}
        onExportCSV={() => exportToCSV({ filename: 'Sales_Register.csv', data: exportData, columns: exportColumns })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportKPICard title="Total Sales" value={totalSales.toString()} icon={ShoppingCart} />
        <ReportKPICard title="Customers" value={new Set(data.map(d => d.customerId)).size.toString()} icon={Users} />
        <ReportKPICard title="Total PCS" value={formatNumber(totalPcs)} icon={Hash} />
        <ReportKPICard title="Total Revenue" value={formatCurrency(totalAmount)} icon={DollarSign} />
      </div>
      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
