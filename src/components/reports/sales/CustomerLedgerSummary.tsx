import { DollarSign, FileText, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function CustomerLedgerSummary() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => SalesReportService.getCustomerLedgerSummaryData(dateRange, search), [dateRange, search]);

  const grandDebit = data.reduce((sum, item) => sum + item.totalDebit, 0);
  const grandCredit = data.reduce((sum, item) => sum + item.totalCredit, 0);

  return (
    <GenericReportTemplate
      title="Customer Ledger Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Customers", value: data.length, icon: Users },
        { title: "Total Sales (Dr)", value: formatCurrency(grandDebit), icon: DollarSign },
        { title: "Total Receipts (Cr)", value: formatCurrency(grandCredit), icon: DollarSign },
        { title: "Total Transactions", value: data.reduce((sum, i) => sum + i.transactions, 0), icon: FileText }
      ]}
      columns={[
        { key: "customerName", label: "Customer Name" },
        { key: "transactions", label: "Transactions", align: "right" },
        { key: "totalDebit", label: "Total Debit (Sales)", align: "right", render: (item) => formatCurrency(item.totalDebit) },
        { key: "totalCredit", label: "Total Credit (Receipts)", align: "right", render: (item) => formatCurrency(item.totalCredit) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-success font-medium" : "text-destructive font-medium"}>{formatCurrency(Math.abs(item.netChange))} {item.netChange > 0 ? 'Dr' : 'Cr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalDebit: formatCurrency(item.totalDebit),
        totalCredit: formatCurrency(item.totalCredit),
        netChange: `${formatCurrency(Math.abs(item.netChange))} ${item.netChange > 0 ? 'Dr' : 'Cr'}`
      })}
      summaryRows={[[{ transactions: 'TOTAL', totalDebit: formatCurrency(grandDebit), totalCredit: formatCurrency(grandCredit) }]]}
    />
  );
}
