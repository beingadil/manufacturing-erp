import { Activity, PackageSearch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function StockLedger() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getStockLedgerData(dateRange, search), [dateRange, search]);

  return (
    <GenericReportTemplate
      title="Stock Ledger Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Items Active", value: data.length, icon: PackageSearch },
        { title: "Total Transactions", value: data.reduce((sum, item) => sum + item.transactions, 0), icon: Activity }
      ]}
      columns={[
        { key: "itemName", label: "Item Name" },
        { key: "transactions", label: "Transactions", align: "right" },
        { key: "inQty", label: "Total In", align: "right", render: (item) => formatNumber(item.inQty) },
        { key: "outQty", label: "Total Out", align: "right", render: (item) => formatNumber(item.outQty) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-success" : (item.netChange < 0 ? "text-destructive" : "")}>{item.netChange > 0 ? '+' : ''}{formatNumber(item.netChange)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        inQty: formatNumber(item.inQty),
        outQty: formatNumber(item.outQty),
        netChange: `${item.netChange > 0 ? '+' : ''}${formatNumber(item.netChange)}`
      })}
    />
  );
}
