import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(process.cwd(), 'src/components/reports');

const generateReport = (filepath, reportName, config) => {
  const {
    hooks,
    dataAggregation,
    kpiCards,
    columns,
    exportColumns,
    exportDataMapping,
    summaryRows
  } = config;

  const content = `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { ReportFilterBar } from '../common/ReportFilterBar';
import { DataTable, Column } from '../../DataTable';
import { ReportKPICard } from '../common/ReportKPICard';
import { ShoppingCart, Scale, Hash, DollarSign, Package, Users, ArrowUpRight, ArrowDownRight, Activity, Percent } from 'lucide-react';
import { generateEnterpriseDocument } from '../../../lib/pdfEngine';
import { exportToExcel, exportToCSV } from '../../../lib/exportUtils';
import { format } from 'date-fns';

export function ${reportName}() {
  const { ${hooks.join(', ')} } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    ${dataAggregation}
  }, [${hooks.join(', ')}, dateRange, search]);

  ${kpiCards.logic || ''}

  const columns: Column<any>[] = [
    ${columns.map(c => `{ key: "${c.key}", label: "${c.label}", sortable: true${c.align ? `, align: "${c.align}"` : ''}${c.render ? `, render: ${c.render}` : ''} }`).join(',\n    ')}
  ];

  const exportColumns = [
    ${exportColumns.map(c => `{ header: '${c.header}', dataKey: '${c.dataKey}' }`).join(',\n    ')}
  ];

  const exportData = data.map((d: any) => ({
    ...d,
    ${exportDataMapping}
  }));

  const handleExportPDF = () => generateEnterpriseDocument({
    title: '${reportName.replace(/([A-Z])/g, ' $1').trim()}', filters: [{ label: 'Date Range', value: dateRange.label }],
    tables: [{
      columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: ['amount','totalamount','weight','pcs','calculatedpcs','rate','rateperunit','balance','debit','credit', 'total', 'totalpcs'].includes(c.dataKey.toLowerCase()) ? 'right' : 'left' })),
      rows: exportData,
      ${summaryRows ? `summaryRows: ${summaryRows}` : ''}
    }]
  });

  return (
    <div className="space-y-6">
      <ReportFilterBar 
        onSearch={setSearch} 
        onDateRangeChange={setDateRange}
        onExportPDF={handleExportPDF}
        onPrint={() => generateEnterpriseDocument({
          title: '${reportName.replace(/([A-Z])/g, ' $1').trim()}', action: 'print', filters: [{ label: 'Date Range', value: dateRange.label }],
          tables: [{
            columns: exportColumns.map(c => ({ header: c.header, dataKey: c.dataKey, align: ['amount','totalamount','weight','pcs','calculatedpcs','rate','rateperunit','balance','debit','credit', 'total', 'totalpcs'].includes(c.dataKey.toLowerCase()) ? 'right' : 'left' })),
            rows: exportData,
            ${summaryRows ? `summaryRows: ${summaryRows}` : ''}
          }]
        })}
        onExportExcel={() => exportToExcel({ filename: \`${reportName}_\${format(new Date(), 'yyyyMMdd')}.xlsx\`, data: exportData, columns: exportColumns })}
        onExportCSV={() => exportToCSV({ filename: \`${reportName}_\${format(new Date(), 'yyyyMMdd')}.csv\`, data: exportData, columns: exportColumns })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${kpiCards.render}
      </div>

      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/10">
          <h3 className="text-base font-semibold text-foreground">Detailed Report</h3>
        </div>
        <DataTable data={data} columns={columns} />
      </div>
    </div>
  );
}
`;
  fs.writeFileSync(filepath, content);
};

export { generateReport, SRC_DIR };
