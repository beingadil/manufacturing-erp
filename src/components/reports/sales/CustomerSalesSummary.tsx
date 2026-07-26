import React, { useMemo } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { DataTable, Column } from '../../DataTable';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";

export function CustomerSalesSummary() {
  const data = useMemo(() => SalesReportService.getCustomerSalesSummaryData(), []);

  const columns: Column<typeof data[0]>[] = [
    { key: "customerName", label: "Customer", sortable: true, render: (item) => <span className="font-medium text-foreground">{item.customerName}</span> },
    { key: "contactPerson", label: "Contact", sortable: true },
    { key: "totalInvoices", label: "Invoices", align: "right", sortable: true },
    { key: "totalPCS", label: "Total PCS", align: "right", sortable: true, render: (item) => formatNumber(item.totalPCS) },
    { key: "totalRevenue", label: "Total Revenue", align: "right", sortable: true, render: (item) => <span className="font-bold text-success">{formatCurrency(item.totalRevenue)}</span> }
  ];

  return (
    <div className="space-y-6">
      <ReportFilterBar />
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <DataTable
          data={data}
          columns={columns}
          searchKeys={["customerName"]}
          searchPlaceholder="Search customers..."
          persistKey="reports-customer-sales-summary"
          defaultSortKey="totalRevenue"
        />
      </div>
    </div>
  );
}
