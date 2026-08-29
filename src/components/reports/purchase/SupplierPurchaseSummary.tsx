import { useMemo } from 'react';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { Column, DataTable } from '../../DataTable';
import { ReportFilterBar } from '../common/ReportFilterBar';

export function SupplierPurchaseSummary() {
  const data = useMemo(() => PurchaseReportService.getSupplierPurchaseSummaryData(), []);

  const columns: Column<typeof data[0]>[] = [
    { key: "supplierName", label: "Supplier", sortable: true, render: (item) => <span className="font-medium text-foreground">{item.supplierName}</span> },
    { key: "contactPerson", label: "Contact", sortable: true },
    { key: "totalOrders", label: "Orders", align: "right", sortable: true },
    { key: "totalWeight", label: "Total Weight (KG)", align: "right", sortable: true, render: (item) => formatNumber(item.totalWeight) },
    { key: "totalPCS", label: "Total PCS", align: "right", sortable: true, render: (item) => formatNumber(item.totalPCS) },
    { key: "totalAmount", label: "Total Amount", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{formatCurrency(item.totalAmount)}</span> }
  ];

  return (
    <div className="space-y-6">
      <ReportFilterBar />
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <DataTable
          data={data}
          columns={columns}
          searchKeys={["supplierName"]}
          searchPlaceholder="Search suppliers..."
          persistKey="reports-supplier-purchase-summary"
          defaultSortKey="totalAmount"
        />
      </div>
    </div>
  );
}
