import { Calculator, Coins, Factory } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ManufacturingReportService } from '../../../lib/reporting/ManufacturingReportService';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

/**
 * Product cost breakdown — material cost + optional production cost for each
 * completed order, and the resulting cost per good piece after any shortfall
 * is absorbed.
 */
export function ProductCostBreakdown() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const data = useMemo(
    () => ManufacturingReportService.getProductCostBreakdownData(dateRange, search),
    [dateRange, search],
  );

  const totalMaterials = data.reduce((sum, row) => sum + row.materialCost, 0);
  const totalProduction = data.reduce((sum, row) => sum + row.productionCost, 0);
  const totalCost = data.reduce((sum, row) => sum + row.totalCost, 0);

  return (
    <GenericReportTemplate
      title="Manufacturing — Product Cost Breakdown"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: 'Completed Orders', value: formatNumber(data.length), icon: Factory },
        { title: 'Material + Production', value: formatCurrency(totalMaterials + totalProduction), icon: Coins },
        { title: 'Capitalised Cost', value: formatCurrency(totalCost), icon: Calculator },
      ]}
      columns={[
        { key: 'date', label: 'Date', sortable: true },
        { key: 'orderNo', label: 'MO No.', render: item => <span className="font-mono text-xs">{item.orderNo}</span> },
        { key: 'productName', label: 'Product', sortable: true },
        { key: 'plannedQty', label: 'Planned', align: 'right', render: item => formatNumber(item.plannedQty) },
        { key: 'finishedQty', label: 'Finished', align: 'right', render: item => formatNumber(item.finishedQty || 0) },
        {
          key: 'shortfall',
          label: 'Shortfall',
          align: 'right',
          render: item => (
            <span className={item.shortfall > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
              {item.shortfall > 0 ? `−${formatNumber(item.shortfall)}` : '—'}
            </span>
          ),
        },
        { key: 'materialCost', label: 'Material Cost', align: 'right', sortable: true, render: item => formatCurrency(item.materialCost) },
        { key: 'productionCost', label: 'Production Cost', align: 'right', sortable: true, render: item => formatCurrency(item.productionCost) },
        { key: 'totalCost', label: 'Total Cost', align: 'right', sortable: true, render: item => formatCurrency(item.totalCost) },
        { key: 'costPerPiece', label: 'Cost / Finished PC', align: 'right', sortable: true, render: item => formatCurrency(item.costPerPiece) },
      ]}
      tableSummaryRow={[
        <span key="label" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>,
        <span key="mo" />,
        <span key="product" />,
        <span key="planned" />,
        <span key="finished" />,
        <span key="shortfall" />,
        <span key="material" className="text-right font-semibold tabular-nums">{formatCurrency(totalMaterials)}</span>,
        <span key="production" className="text-right font-semibold tabular-nums">{formatCurrency(totalProduction)}</span>,
        <span key="total" className="text-right font-semibold tabular-nums">{formatCurrency(totalCost)}</span>,
        <span key="unit" />,
      ]}
      searchKeys={['orderNo', 'productName']}
      searchPlaceholder="Search orders or products…"
      exportDataMapping={item => ({
        ...item,
        plannedQty: formatNumber(item.plannedQty),
        finishedQty: formatNumber(item.finishedQty || 0),
        shortfall: formatNumber(item.shortfall),
        materialCost: formatCurrency(item.materialCost),
        productionCost: formatCurrency(item.productionCost),
        totalCost: formatCurrency(item.totalCost),
        costPerPiece: formatCurrency(item.costPerPiece),
      })}
    />
  );
}
