import { format } from 'date-fns';
import { DollarSign, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { exportToCSV, exportToExcel } from '../../../lib/exportUtils';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";
import { formatCurrency } from '../../../lib/utils';
import { Column, DataTable } from '../../DataTable';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { ReportKPICard } from '../common/ReportKPICard';

export function CustomerOutstandingReport() {
  const [_dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => SalesReportService.getCustomerOutstandingReportData(search), [search]);

  const totalOutstanding = data.reduce((sum, c) => sum + c.balance, 0);

  const columns: Column<typeof data[0]>[] = [
    { key: "name", label: "Customer", sortable: true },
    { key: "contactPerson", label: "Contact Person" },
    { key: "phone", label: "Phone" },
    { key: "balance", label: "Outstanding Balance", align: "right", sortable: true, render: (item) => <span className="font-medium text-destructive">{formatCurrency(item.balance)}</span> }
  ];

  const exportColumns = [
    { header: 'Customer', dataKey: 'name' },
    { header: 'Contact Person', dataKey: 'contactPerson' },
    { header: 'Phone', dataKey: 'phone' },
    { header: 'Outstanding Balance', dataKey: 'balance' }
  ];

  const exportData = data.map(d => ({
    ...d,
    balance: formatCurrency(d.balance)
  }));

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Customer Outstanding Report', filters: [{ label: 'As of', value: format(new Date(), 'dd-MMM-yyyy') }],
    tables: [{
      columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: c.dataKey === 'balance' ? 'right' : 'left' })),
      rows: exportData,
      summaryRows: [[{ phone: 'TOTAL OUTSTANDING', balance: formatCurrency(totalOutstanding) }]]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={setSearch} onDateRangeChange={setDateRange} showDateRange={false}
        onExportPDF={handleExportPDF}
        onExportExcel={() => exportToExcel({ filename: 'Customer_Outstanding.xlsx', data: exportData, columns: exportColumns })}
        onExportCSV={() => exportToCSV({ filename: 'Customer_Outstanding.csv', data: exportData, columns: exportColumns })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReportKPICard title="Customers with Balance" value={data.length.toString()} icon={Users} />
        <ReportKPICard title="Total Outstanding" value={formatCurrency(totalOutstanding)} icon={DollarSign} valueClassName="text-destructive" />
      </div>
      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
