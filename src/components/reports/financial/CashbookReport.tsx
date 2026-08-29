import { format } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { exportToCSV, exportToExcel } from '../../../lib/exportUtils';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { FinancialReportService } from "../../../lib/reporting/FinancialReportService";
import { formatCurrency } from '../../../lib/utils';
import { useERPStore } from "../../../store/useERPStore";
import { Column, DataTable } from '../../DataTable';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { ReportKPICard } from '../common/ReportKPICard';

export function CashbookReport() {
  const { accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const cashBankAccounts = useMemo(() => {
    return accounts.filter(a => a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('bank'));
  }, [accounts]);

  const data = useMemo(() => FinancialReportService.getCashbookReportData(cashBankAccounts, dateRange, search), [cashBankAccounts, dateRange, search]);

  const totalIn = data.filter(e => e.type === 'Debit').reduce((sum, e) => sum + e.amount, 0);
  const totalOut = data.filter(e => e.type === 'Credit').reduce((sum, e) => sum + e.amount, 0);
  const balance = data.length > 0 ? data[0].currentBal : 0;

  const columns: Column<typeof data[0]>[] = [
    { key: "date", label: "Date", sortable: true, render: (item) => format(new Date(item.date), 'MMM d, yyyy') },
    { key: "accountName", label: "Account", sortable: true },
    { key: "referenceNo", label: "Ref #", sortable: true },
    { key: "description", label: "Description", sortable: true },
    { key: "amount", label: "Inflow (Dr)", align: "right", render: (item) => item.type === 'Debit' ? <span className="text-emerald-600 font-medium">{formatCurrency(item.amount)}</span> : null },
    { key: "amount", label: "Outflow (Cr)", align: "right", render: (item) => item.type === 'Credit' ? <span className="text-destructive font-medium">{formatCurrency(item.amount)}</span> : null },
    { key: "currentBal", label: "Balance", align: "right", render: (item) => <span className="font-bold">{formatCurrency(item.currentBal)}</span> }
  ];

  const exportColumns = [
    { header: 'Date', dataKey: 'date' },
    { header: 'Account', dataKey: 'accountName' },
    { header: 'Ref #', dataKey: 'referenceNo' },
    { header: 'Description', dataKey: 'description' },
    { header: 'Inflow', dataKey: 'inflow' },
    { header: 'Outflow', dataKey: 'outflow' },
    { header: 'Balance', dataKey: 'currentBal' }
  ];

  const exportData = data.map(d => ({
    ...d,
    date: format(new Date(d.date), 'dd-MMM-yyyy'),
    inflow: d.type === 'Debit' ? formatCurrency(d.amount) : '',
    outflow: d.type === 'Credit' ? formatCurrency(d.amount) : '',
    currentBal: formatCurrency(d.currentBal)
  }));

  const handleExportPDF = () => generateEnterpriseDocument({
    title: 'Cashbook Report', filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: ['inflow','outflow','currentBal'].includes(c.dataKey) ? 'right' : 'left' })),
      rows: exportData,
      summaryRows: [[{ description: 'TOTAL', inflow: formatCurrency(totalIn), outflow: formatCurrency(totalOut) }]]
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={setSearch} onDateRangeChange={setDateRange}
        onExportPDF={handleExportPDF}
        onExportExcel={() => exportToExcel({ filename: 'Cashbook.xlsx', data: exportData, columns: exportColumns })}
        onExportCSV={() => exportToCSV({ filename: 'Cashbook.csv', data: exportData, columns: exportColumns })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ReportKPICard title="Total Cash Inflow" value={formatCurrency(totalIn)} icon={ArrowDownRight} valueClassName="text-emerald-600" />
        <ReportKPICard title="Total Cash Outflow" value={formatCurrency(totalOut)} icon={ArrowUpRight} valueClassName="text-destructive" />
        <ReportKPICard title="Closing Balance" value={formatCurrency(balance)} icon={Wallet} />
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
