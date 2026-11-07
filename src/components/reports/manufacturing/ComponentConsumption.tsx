import { Coins, Factory, Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ManufacturingReportService } from '../../../lib/reporting/ManufacturingReportService';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

/**
 * Component consumption — every batch draw made by a completed manufacturing
 * order, at the batch cost the ledger actually posted.
 */
export function ComponentConsumption() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const data = useMemo(
    () => ManufacturingReportService.getComponentConsumptionData(dateRange, search),
    [dateRange, search],
  );

  const totalPcs = data.reduce((sum, row) => sum + row.pcs, 0);
  const totalCost = data.reduce((sum, row) => sum + row.cost, 0);
  const orderCount = new Set(data.map(row => row.orderNo)).size;

  return (
    <GenericReportTemplate
      title="Manufacturing — Component Consumption"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: 'Manufacturing Orders', value: formatNumber(orderCount), icon: Factory },
        { title: 'Components Drawn (PCS)', value: formatNumber(totalPcs), icon: Layers },
        { title: 'Material Cost Consumed', value: formatCurrency(totalCost), icon: Coins },
      ]}
      columns={[
        { key: 'date', label: 'Date', sortable: true },
        { key: 'orderNo', label: 'MO No.', render: item => <span className="font-mono text-xs">{item.orderNo}</span> },
        { key: 'productName', label: 'Finished Product', sortable: true },
        { key: 'materialName', label: 'Component', sortable: true },
        { key: 'materialCode', label: 'Code', render: item => <span className="font-mono text-xs text-muted-foreground">{item.materialCode || '—'}</span> },
        { key: 'batchNo', label: 'Batch', render: item => <span className="font-mono text-xs text-muted-foreground">{item.batchNo}</span> },
        { key: 'pcs', label: 'PCS', align: 'right', sortable: true, render: item => formatNumber(item.pcs) },
        { key: 'costPerPiece', label: 'Cost / PC', align: 'right', render: item => formatCurrency(item.costPerPiece) },
        { key: 'cost', label: 'Cost', align: 'right', sortable: true, render: item => formatCurrency(item.cost) },
      ]}
      searchKeys={['orderNo', 'productName', 'materialName', 'batchNo']}
      searchPlaceholder="Search orders, products, components…"
      exportDataMapping={item => ({
        ...item,
        pcs: formatNumber(item.pcs),
        costPerPiece: formatCurrency(item.costPerPiece),
        cost: formatCurrency(item.cost),
      })}
    />
  );
}
