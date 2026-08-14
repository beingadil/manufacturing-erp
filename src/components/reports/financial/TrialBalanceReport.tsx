import { useMemo, useState } from 'react';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Scale } from 'lucide-react';
import { FinancialReportService } from '../../../lib/reporting/FinancialReportService';

export function TrialBalanceReport() {
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    return FinancialReportService.getTrialBalance(dateRange, search);
  }, [dateRange, search]);

  const totalDebit = data.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = data.reduce((sum, item) => sum + item.credit, 0);

  return (
    <GenericReportTemplate
      title="Trial Balance"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Debit", value: formatCurrency(totalDebit), icon: Scale },
        { title: "Total Credit", value: formatCurrency(totalCredit), icon: Scale },
        { title: "Difference", value: formatCurrency(Math.abs(totalDebit - totalCredit)), icon: Scale }
      ]}
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "type", label: "Type" },
        { key: "debit", label: "Debit", align: "right", render: (item) => item.debit > 0 ? formatCurrency(item.debit) : '-' },
        { key: "credit", label: "Credit", align: "right", render: (item) => item.credit > 0 ? formatCurrency(item.credit) : '-' }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        debit: item.debit > 0 ? formatCurrency(item.debit) : '',
        credit: item.credit > 0 ? formatCurrency(item.credit) : ''
      })}
      summaryRows={[[{ type: 'TOTAL', debit: formatCurrency(totalDebit), credit: formatCurrency(totalCredit) }]]}
    />
  );
}
