import { Database, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { InventoryReportService } from "../../../lib/reporting/InventoryReportService";
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function FinishedGoodsStock() {
  const [search, setSearch] = useState('');

  const data = useMemo(() => InventoryReportService.getFinishedGoodsStockData(search), [search]);

  const totalStock = data.reduce((sum, item) => sum + item.currentStock, 0);

  return (
    <GenericReportTemplate
      title="Finished Goods Stock"
      data={data}
      onSearch={setSearch}
      showDateRange={false}
      kpis={[
        { title: "Product Types", value: data.length, icon: Database },
        { title: "Total PCS in Stock", value: formatNumber(totalStock), icon: Package }
      ]}
      columns={[
        { key: "name", label: "Product Name" },
        { key: "category", label: "Category" },
        { key: "currentStock", label: "Current Stock", align: "right", render: (item) => <span className="font-medium">{formatNumber(item.currentStock)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        currentStock: formatNumber(item.currentStock)
      })}
    />
  );
}
