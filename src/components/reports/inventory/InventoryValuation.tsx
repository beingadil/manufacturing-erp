import React, { useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Database, DollarSign } from 'lucide-react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";

export function InventoryValuation() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getInventoryValuationData(search), [search]);

  const totalValue = data.reduce((sum, item) => sum + item.totalValue, 0);

  return (
    <GenericReportTemplate
      title="Inventory Valuation"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Valued Items", value: data.length, icon: Database },
        { title: "Total Value", value: formatCurrency(totalValue), icon: DollarSign }
      ]}
      columns={[
        { key: "type", label: "Item Type" },
        { key: "name", label: "Item Name" },
        { key: "qty", label: "Qty in Stock", align: "right", render: (item) => formatNumber(item.qty) },
        { key: "cost", label: "Est. Cost/Unit", align: "right", render: (item) => formatCurrency(item.cost) },
        { key: "totalValue", label: "Total Value", align: "right", render: (item) => <span className="font-medium text-foreground">{formatCurrency(item.totalValue)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        qty: formatNumber(item.qty),
        cost: formatCurrency(item.cost),
        totalValue: formatCurrency(item.totalValue)
      })}
      summaryRows={[[{ name: 'TOTAL VALUATION', totalValue: formatCurrency(totalValue) }]]}
    />
  );
}
