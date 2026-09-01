import { AlertTriangle, Coins, Database, PackageSearch } from 'lucide-react';
import { useMemo } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { cn, formatCurrency, formatNumber } from '../../../lib/utils';
import { useERPStore } from "../../../store/useERPStore";
import { Column } from '../../DataTable';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function CurrentStockReport() {
  const materials = useERPStore(s => s.materials);

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
    <GenericReportTemplate
      title="Current Stock"
      data={data}
      onSearch={() => {}}
      showDateRange={false}
      tableTitle="Current Stock"
      kpis={[
        { title: "Total Raw Material", value: formatNumber(totalRawMaterial), icon: Database },
        { title: "Total WIP / Processed", value: formatNumber(totalWIP + totalAtProcessor), icon: PackageSearch },
        { title: "Est. Inventory Value", value: formatCurrency(totalValue), icon: Coins },
        { title: "Low Stock Items", value: lowStockCount, icon: AlertTriangle }
      ]}
      columns={columns}
      searchKeys={["name", "categoryName"]}
      searchPlaceholder="Search materials…"
      tableSummaryRow={[
        'TOTAL', '', '',
        formatNumber(totalRawMaterial),
        formatNumber(totalAtProcessor),
        formatNumber(totalWIP),
        '',
        formatCurrency(totalValue)
      ]}
    />
  );
}
