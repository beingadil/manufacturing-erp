import React, { useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { DataTable, Column } from '../../DataTable';
import { ReportKPICard } from '../common/ReportKPICard';
import { Package, Hash, AlertTriangle, Layers } from 'lucide-react';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { exportToExcel, exportToCSV } from '../../../lib/exportUtils';
import { format } from 'date-fns';
import { InventoryReportService } from '../../../lib/reporting/InventoryReportService';

export function CurrentStock() {
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    return InventoryReportService.getCurrentStock(search);
  }, [search]);

  const totalRawMaterials = data.filter(d => d.type === 'Raw Material').reduce((sum, item) => sum + item.stockPcs || 0, 0);
  const totalFinishedGoods = data.filter(d => d.type === 'Finished Good').reduce((sum, item) => sum + item.stockPcs || 0, 0);
  const lowStockCount = data.filter(d => d.status === 'Low Stock' || d.status === 'Out of Stock').length;

  const columns: Column<typeof data[0]>[] = [
    { key: "name", label: "Item Name", sortable: true },
    { key: "type", label: "Type", sortable: true },
    { key: "categoryName", label: "Category", sortable: true },
    { key: "stockPcs", label: "Current Stock (PCS)", align: "right", render: (item) => formatNumber(item.stockPcs || 0) },
    { key: "status", label: "Status", render: (item) => (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
        item.status === 'In Stock' ? 'bg-success/20 text-success' :
        item.status === 'Low Stock' ? 'bg-warning/20 text-warning' :
        'bg-destructive/20 text-red-700'
      }`}>
        {item.status}
      </span>
    )}
  ];

  const exportColumns = [
    { header: 'Item Name', dataKey: 'name' },
    { header: 'Type', dataKey: 'type' },
    { header: 'Category', dataKey: 'categoryName' },
    { header: 'Current Stock (PCS)', dataKey: 'stockPcs' },
    { header: 'Status', dataKey: 'status' }
  ];

  const exportData = data.map(d => ({
    ...d,
    stockPcs: formatNumber(d.stockPcs)
  }));

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Current Stock Report', filters: [{ label: 'As of', value: format(new Date(), 'dd-MMM-yyyy') }],
    tables: [{
      columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: c.dataKey === 'stockPcs' ? 'right' : 'left' })),
      rows: exportData
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={setSearch} showDateRange={false}
        onExportPDF={handleExportPDF}
        onExportExcel={() => exportToExcel({ filename: 'Current_Stock.xlsx', data: exportData, columns: exportColumns })}
        onExportCSV={() => exportToCSV({ filename: 'Current_Stock.csv', data: exportData, columns: exportColumns })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportKPICard title="Total Items" value={data.length.toString()} icon={Package} />
        <ReportKPICard title="Raw Material Stock" value={formatNumber(totalRawMaterials)} icon={Layers} />
        <ReportKPICard title="Finished Goods Stock" value={formatNumber(totalFinishedGoods)} icon={Hash} />
        <ReportKPICard title="Low/Out of Stock" value={lowStockCount.toString()} icon={AlertTriangle} valueClassName="text-warning" />
      </div>
      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
