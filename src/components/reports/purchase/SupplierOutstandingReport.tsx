import { Activity, AlertCircle, DollarSign, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDrillDown } from '../../../contexts/DrillDownContext';
import { PurchaseReportService } from "../../../lib/reporting/PurchaseReportService";
import { formatCurrency } from '../../../lib/utils';
import { useERPStore } from "../../../store/useERPStore";
import { DrillDownVoucherList } from '../common/DrillDownVoucherList';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function SupplierOutstandingReport() {
  const { accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const { pushLevel } = useDrillDown();

  const data = useMemo(() => PurchaseReportService.getSupplierOutstandingReportData(dateRange, search), [dateRange, search]);

  const totalOutstanding = data.reduce((sum, item) => sum + (item.balance > 0 ? item.balance : 0), 0);
  const totalAdvances = data.reduce((sum, item) => sum + (item.balance < 0 ? Math.abs(item.balance) : 0), 0);

  return (
    <GenericReportTemplate
      title="Supplier Outstanding Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Suppliers with Balance", value: data.length, icon: Users },
        { title: "Total Payable", value: formatCurrency(totalOutstanding), icon: DollarSign },
        { title: "Total Advances", value: formatCurrency(totalAdvances), icon: Activity },
        { title: "Net Outstanding", value: formatCurrency(totalOutstanding - totalAdvances), icon: AlertCircle }
      ]}
      columns={[
        { key: "supplierName", label: "Supplier Name", render: (item) => {
          const acc = accounts.find(a => a.name === item.supplierName);
          return (
            <button
              onClick={() => {
                if (acc) {
                  pushLevel({
                    title: `Outstanding - ${item.supplierName}`,
                    component: <DrillDownVoucherList accountId={acc.id} startDate={dateRange.start} endDate={dateRange.end} />
                  });
                }
              }}
              className="text-primary hover:underline font-medium text-left"
            >
              {item.supplierName}
            </button>
          );
        }},
        { key: "contact", label: "Contact Info" },
        { key: "status", label: "Status" },
        { key: "balance", label: "Outstanding Balance", align: "right", render: (item) => <span className={item.balance > 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>{formatCurrency(Math.abs(item.balance))} {item.balance > 0 ? 'Cr' : 'Dr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        balance: `${formatCurrency(Math.abs(item.balance))} ${item.balance > 0 ? 'Cr' : 'Dr'}`
      })}
      summaryRows={[[{ status: 'TOTAL PAYABLE', balance: formatCurrency(totalOutstanding) }]]}
    />
  );
}
