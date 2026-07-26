import React, { useMemo, useState } from 'react';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Activity } from 'lucide-react';
import { format } from 'date-fns';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";

export function StockMovement() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getStockMovementData(dateRange, search), [dateRange, search]);

  return (
    <GenericReportTemplate
      title="Stock Movement Log"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Movements", value: data.length, icon: Activity }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "type", label: "Type", render: (item) => <span className={item.transactionType.startsWith('IN') ? "text-emerald-600" : "text-rose-600"}>{item.transactionType}</span> },
        { key: "itemName", label: "Item Name" },
        { key: "referenceNo", label: "Reference" },
        { key: "quantity", label: "Quantity", align: "right", render: (item) => formatNumber(item.quantity) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        quantity: formatNumber(item.quantity)
      })}
    />
  );
}
