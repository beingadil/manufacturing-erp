import { DollarSign, Users, } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDrillDown } from '../../../contexts/DrillDownContext';
import { SalesReportService } from "../../../lib/reporting/SalesReportService";
import { formatCurrency } from '../../../lib/utils';
import { useERPStore } from "../../../store/useERPStore";
import { DrillDownVoucherList } from '../common/DrillDownVoucherList';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function CustomerOutstanding() {
  const { accounts } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const { pushLevel } = useDrillDown();

  const data = useMemo(() => SalesReportService.getCustomerOutstandingData(dateRange, search), [dateRange, search]);

  // Precompute a name->account map once instead of accounts.find per row per render.
  const accountByName = useMemo(() => new Map(accounts.map(a => [a.name, a])), [accounts]);

  const totalReceivable = data.reduce((sum, item) => sum + (item.balance > 0 ? item.balance : 0), 0);

  return (
    <GenericReportTemplate
      title="Customer Outstanding Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Customers with Balance", value: data.length, icon: Users },
        { title: "Total Receivable", value: formatCurrency(totalReceivable), icon: DollarSign }
      ]}
      columns={[
        { key: "customerName", label: "Customer Name", render: (item) => {
          const acc = accountByName.get(item.customerName);
          return (
            <button
              onClick={() => {
                if (acc) {
                  pushLevel({
                    title: `Outstanding - ${item.customerName}`,
                    component: <DrillDownVoucherList accountId={acc.id} startDate={dateRange.start} endDate={dateRange.end} />
                  });
                }
              }}
              className="text-primary hover:underline font-medium text-left"
            >
              {item.customerName}
            </button>
          );
        }},
        { key: "contact", label: "Contact Info" },
        { key: "status", label: "Status" },
        { key: "balance", label: "Outstanding Balance", align: "right", render: (item) => <span className={item.balance > 0 ? "text-success font-medium" : "text-destructive font-medium"}>{formatCurrency(Math.abs(item.balance))} {item.balance > 0 ? 'Dr' : 'Cr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        balance: `${formatCurrency(Math.abs(item.balance))} ${item.balance > 0 ? 'Dr' : 'Cr'}`
      })}
      summaryRows={[[{ status: 'TOTAL RECEIVABLE', balance: formatCurrency(totalReceivable) }]]}
    />
  );
}
