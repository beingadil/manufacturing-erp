import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Users, DollarSign, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";

export function SupplierLedgerSummary() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => PurchaseReportService.getSupplierLedgerSummaryData(dateRange, search), [dateRange, search]);

  const grandDebit = data.reduce((sum, item) => sum + item.totalDebit, 0);
  const grandCredit = data.reduce((sum, item) => sum + item.totalCredit, 0);

  return (
    <GenericReportTemplate
      title="Supplier Ledger Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Suppliers", value: data.length, icon: Users },
        { title: "Total Payments (Dr)", value: formatCurrency(grandDebit), icon: DollarSign },
        { title: "Total Purchases (Cr)", value: formatCurrency(grandCredit), icon: DollarSign },
        { title: "Total Transactions", value: data.reduce((sum, i) => sum + i.transactions, 0), icon: FileText }
      ]}
      columns={[
        { key: "supplierName", label: "Supplier Name" },
        { key: "transactions", label: "Transactions", align: "right" },
        { key: "totalDebit", label: "Total Debit (Payments)", align: "right", render: (item) => formatCurrency(item.totalDebit) },
        { key: "totalCredit", label: "Total Credit (Purchases)", align: "right", render: (item) => formatCurrency(item.totalCredit) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>{formatCurrency(Math.abs(item.netChange))} {item.netChange > 0 ? 'Cr' : 'Dr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalDebit: formatCurrency(item.totalDebit),
        totalCredit: formatCurrency(item.totalCredit),
        netChange: `${formatCurrency(Math.abs(item.netChange))} ${item.netChange > 0 ? 'Cr' : 'Dr'}`
      })}
      summaryRows={[[{ transactions: 'TOTAL', totalDebit: formatCurrency(grandDebit), totalCredit: formatCurrency(grandCredit) }]]}
    />
  );
}
