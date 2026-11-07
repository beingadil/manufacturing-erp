import { Boxes, Layers, PackageCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ManufacturingReportService } from '../../../lib/reporting/ManufacturingReportService';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

/**
 * Finished-goods stock — a point-in-time view of what the manufacturing
 * pipeline has produced and not yet sold, valued at the lots' own cost.
 */
export function ManufacturingFgStock() {
  const [search, setSearch] = useState('');
  const data = useMemo(() => ManufacturingReportService.getFinishedGoodsStockData(search), [search]);

  const totalPcs = data.reduce((sum, item) => sum + item.currentStock, 0);
  const totalValue = data.reduce((sum, item) => sum + item.stockValue, 0);
  const withStock = data.filter(item => item.currentStock > 0).length;

  return (
    <GenericReportTemplate
      title="Manufacturing — Finished Goods Stock"
      data={data}
      onSearch={setSearch}
      showDateRange={false}
      kpis={[
        { title: 'Products With Stock', value: formatNumber(withStock), icon: PackageCheck },
        { title: 'Total PCS On Hand', value: formatNumber(totalPcs), icon: Boxes },
        { title: 'Stock Value', value: formatCurrency(totalValue), icon: Layers },
      ]}
      columns={[
        { key: 'name', label: 'Product', sortable: true },
        { key: 'sku', label: 'SKU', render: item => <span className="font-mono text-xs text-muted-foreground">{item.sku || '—'}</span> },
        { key: 'lotCount', label: 'Active Lots', align: 'right', sortable: true, render: item => formatNumber(item.lotCount) },
        { key: 'orderCount', label: 'Completed MOs', align: 'right', sortable: true, render: item => formatNumber(item.orderCount) },
        { key: 'currentStock', label: 'Stock (PCS)', align: 'right', sortable: true, render: item => formatNumber(item.currentStock) },
        { key: 'avgCost', label: 'Avg Cost / PC', align: 'right', sortable: true, render: item => formatCurrency(item.avgCost) },
        { key: 'stockValue', label: 'Stock Value', align: 'right', sortable: true, render: item => formatCurrency(item.stockValue) },
      ]}
      tableSummaryRow={[
        <span key="label" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>,
        <span key="sku" />,
        <span key="lots" />,
        <span key="orders" />,
        <span key="pcs" className="text-right font-semibold tabular-nums">{formatNumber(totalPcs)}</span>,
        <span key="cost" />,
        <span key="value" className="text-right font-semibold tabular-nums">{formatCurrency(totalValue)}</span>,
      ]}
      searchKeys={['name', 'sku']}
      searchPlaceholder="Search products…"
      exportDataMapping={item => ({
        ...item,
        lotCount: formatNumber(item.lotCount),
        orderCount: formatNumber(item.orderCount),
        currentStock: formatNumber(item.currentStock),
        avgCost: formatCurrency(item.avgCost),
        stockValue: formatCurrency(item.stockValue),
      })}
    />
  );
}
