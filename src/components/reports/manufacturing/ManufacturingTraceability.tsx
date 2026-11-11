import { ClipboardList, Layers3, Package, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ManufacturingReportService } from '../../../lib/reporting/ManufacturingReportService';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

/**
 * End-to-end trace — one row per completed production order:
 * raw material batches consumed → order → FG lot → the sales that drew from the lot.
 * The audit tab for "where did this stock go, who bought it, what did it cost".
 */
export function ManufacturingTraceability() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const data = useMemo(
    () => ManufacturingReportService.getTraceabilityData(dateRange, search),
    [dateRange, search],
  );

  const totalOrders = data.length;
  const totalPcs = data.reduce((s, r) => s + r.finishedQty, 0);
  const totalCost = data.reduce((s, r) => s + r.totalCost, 0);
  const totalSales = data.reduce((s, r) => s + r.saleAmount, 0);

  return (
    <GenericReportTemplate
      title="Manufacturing — Order to Sale Traceability"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: 'Completed orders', value: String(totalOrders), icon: ClipboardList },
        { title: 'PCS produced', value: formatNumber(totalPcs), icon: Package },
        { title: 'Produced cost', value: formatCurrency(totalCost), icon: Layers3 },
        { title: 'Sales linked', value: formatCurrency(totalSales), icon: Receipt },
      ]}
      columns={[
        { key: 'orderNo', label: 'Order', sortable: true },
        { key: 'productName', label: 'Product', sortable: true },
        { key: 'finishedQty', label: 'Finished', align: 'right', sortable: true, render: item => formatNumber(item.finishedQty) },
        { key: 'shortfall', label: 'Shortfall', align: 'right', sortable: true, render: item => formatNumber(item.shortfall) },
        { key: 'lotRemaining', label: 'Lot remaining', align: 'right', sortable: true, render: item => formatNumber(item.lotRemaining) },
        { key: 'componentCount', label: 'Batches', align: 'right', sortable: true },
        { key: 'costPerPiece', label: 'Cost / pc', align: 'right', sortable: true, render: item => formatCurrency(item.costPerPiece) },
        {
          key: 'saleInvoices',
          label: 'Sale(s)',
          sortable: true,
          render: item => <span className="font-mono text-xs">{item.saleInvoices}</span>,
        },
      ]}
      tableSummaryRow={[
        <span key="label" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>,
        <span key="product" />,
        <span key="finished" className="text-right font-semibold tabular-nums">{formatNumber(totalPcs)}</span>,
        <span key="shortfall" />,
        <span key="lots" />,
        <span key="batches" />,
        <span key="cost-pc" />,
        <span key="sales" className="font-mono text-xs">{totalOrders} orders</span>,
      ]}
      searchKeys={['orderNo', 'productName', 'productSku', 'lotNo', 'componentNames', 'saleInvoices']}
      searchPlaceholder="Search order, product, lot, material or invoice…"
      exportDataMapping={item => ({
        ...item,
        finishedQty: formatNumber(item.finishedQty),
        costPerPiece: formatCurrency(item.costPerPiece),
        totalCost: formatCurrency(item.totalCost),
        materialCost: formatCurrency(item.materialCost),
        productionCost: formatCurrency(item.productionCost),
        saleAmount: formatCurrency(item.saleAmount),
      })}
    />
  );
}
