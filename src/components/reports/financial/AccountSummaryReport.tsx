import { BookOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDrillDown } from '../../../contexts/DrillDownContext';
import { FinancialReportService } from "../../../lib/reporting/FinancialReportService";
import { formatCurrency } from '../../../lib/utils';
import { DrillDownVoucherList } from '../common/DrillDownVoucherList';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

export function AccountSummaryReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const { pushLevel } = useDrillDown();

  const data = useMemo(() => FinancialReportService.getAccountSummaryReportData(dateRange, search), [dateRange, search]);

  return (
    <GenericReportTemplate
      title="Account Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Accounts", value: data.length, icon: BookOpen }
      ]}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Account", render: (item) => (
          <button 
            onClick={() => pushLevel({
              title: `Transactions - ${item.name}`,
              component: <DrillDownVoucherList accountId={item.id} startDate={dateRange.start} endDate={dateRange.end} />
            })}
            className="text-primary hover:underline font-medium text-left"
          >
            {item.name}
          </button>
        ) },
        { key: "type", label: "Type" },
        { key: "debit", label: "Total Debit", align: "right", render: (item) => formatCurrency(item.debit) },
        { key: "credit", label: "Total Credit", align: "right", render: (item) => formatCurrency(item.credit) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-emerald-600" : (item.netChange < 0 ? "text-rose-600" : "")}>{item.netChange > 0 ? '+' : ''}{formatCurrency(item.netChange)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        debit: formatCurrency(item.debit),
        credit: formatCurrency(item.credit),
        netChange: formatCurrency(item.netChange)
      })}
    />
  );
}
