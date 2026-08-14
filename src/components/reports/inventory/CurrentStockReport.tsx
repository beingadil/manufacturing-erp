import { useMemo } from 'react';
import { formatCurrency, formatNumber, cn } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { ReportKPICard } from '../common/ReportKPICard';
import { DataTable, Column } from '../../DataTable';
import { PackageSearch, AlertTriangle, Coins, Database } from 'lucide-react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { useERPStore } from "../../../store/useERPStore";

export function CurrentStockReport() {
  const { materials } = useERPStore();
  const totalRawMaterial = materials.reduce((sum, m) => sum + m.stockPcs, 0);
  const totalWIP = materials.reduce((sum, m) => sum + m.processedStockPcs, 0);
  const totalAtProcessor = materials.reduce((sum, m) => sum + (m.atProcessorPcs || 0), 0);
  const lowStockCount = materials.filter(m => m.stockPcs < 500).length;

  const data = useMemo(() => InventoryReportService.getCurrentStockReportData(), []);

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  const columns: Column<typeof data[0]>[] = [
    { key: "name", label: "Material", sortable: true, render: (item) => <span className="font-medium text-foreground">{item.name}</span> },
    { key: "categoryName", label: "Category", sortable: true },
    { key: "stockPcs", label: "Raw Stock", align: "right", sortable: true, render: (item) => (
      <span className={cn(item.stockPcs < 500 && "text-destructive font-bold")}>{formatNumber(item.stockPcs)}</span>
    )},
    { key: "atProcessorPcs", label: "At Processor", align: "right", sortable: true, render: (item) => <span className="text-warning">{formatNumber(item.atProcessorPcs || 0)}</span> },
    { key: "processedStockPcs", label: "Processed", align: "right", sortable: true, render: (item) => <span className="text-success">{formatNumber(item.processedStockPcs)}</span> },
    { key: "costPerPc", label: "Avg Cost", align: "right", sortable: true, render: (item) => <span className="text-muted-foreground">{formatCurrency(item.costPerPc)}</span> },
    { key: "value", label: "Est. Value", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{formatCurrency(item.value)}</span> }
  ];

  return (
    <div className="space-y-6">
      <ReportFilterBar showDateRange={false} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportKPICard title="Total Raw Material" value={formatNumber(totalRawMaterial)} icon={Database} />
        <ReportKPICard title="Total WIP / Processed" value={formatNumber(totalWIP + totalAtProcessor)} icon={PackageSearch} />
        <ReportKPICard title="Est. Inventory Value" value={formatCurrency(totalValue)} icon={Coins} />
        <ReportKPICard title="Low Stock Items" value={lowStockCount} icon={AlertTriangle} className={lowStockCount > 0 ? "border-red-500/50 bg-destructive/100/5" : ""} />
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <DataTable
          data={data}
          columns={columns}
          searchKeys={["name", "categoryName"]}
          searchPlaceholder="Search materials..."
          persistKey="reports-inventory-current"
          defaultSortKey="name"
        />
      </div>
    </div>
  );
}
