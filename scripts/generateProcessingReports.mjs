import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/processing';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

generateFile('ProcessingEfficiency', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Factory, Percent, Activity } from 'lucide-react';

export function ProcessingEfficiency() {
  const { processingSends, processingReceipts, processors } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filteredReceipts = processingReceipts.filter(r => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(r.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      }
      return true;
    });

    const processorMap = new Map();
    filteredReceipts.forEach(r => {
      const send = processingSends.find(s => s.id === r.sendId);
      if (!send) return;

      const processorName = processors.find(p => p.id === r.processorId)?.name || 'Unknown';
      if (!processorMap.has(processorName)) {
        processorMap.set(processorName, { processorName, sentPcs: 0, receivedPcs: 0, timeTakenDays: 0, count: 0 });
      }
      const c = processorMap.get(processorName);
      c.sentPcs += send.pcsSent;
      c.receivedPcs += r.pcsReceived;
      
      const sendDate = new Date(send.date).getTime();
      const recDate = new Date(r.date).getTime();
      const days = Math.max(1, (recDate - sendDate) / (1000 * 3600 * 24));
      
      c.timeTakenDays += days;
      c.count += 1;
    });

    return Array.from(processorMap.values()).map(p => ({
        ...p,
        efficiency: p.sentPcs > 0 ? (p.receivedPcs / p.sentPcs) * 100 : 0,
        avgTurnaround: p.timeTakenDays / p.count
    })).filter(p => !search || p.processorName.toLowerCase().includes(search.toLowerCase()))
       .sort((a,b) => b.efficiency - a.efficiency);
  }, [processingSends, processingReceipts, processors, dateRange, search]);

  const totalSent = data.reduce((sum, item) => sum + item.sentPcs, 0);
  const totalReceived = data.reduce((sum, item) => sum + item.receivedPcs, 0);

  return (
    <GenericReportTemplate
      title="Processing Efficiency"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Processors Tracked", value: data.length, icon: Factory },
        { title: "Overall Efficiency", value: \`\${totalSent ? ((totalReceived / totalSent)*100).toFixed(2) : 0}%\`, icon: Percent }
      ]}
      columns={[
        { key: "processorName", label: "Processor" },
        { key: "sentPcs", label: "Sent PCS", align: "right", render: (item) => formatNumber(item.sentPcs) },
        { key: "receivedPcs", label: "Received PCS", align: "right", render: (item) => formatNumber(item.receivedPcs) },
        { key: "efficiency", label: "Efficiency", align: "right", render: (item) => <span className={item.efficiency < 95 ? "text-rose-600" : "text-emerald-600"}>{item.efficiency.toFixed(2)}%</span> },
        { key: "avgTurnaround", label: "Avg Turnaround", align: "right", render: (item) => \`\${item.avgTurnaround.toFixed(1)} Days\` }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        sentPcs: formatNumber(item.sentPcs),
        receivedPcs: formatNumber(item.receivedPcs),
        efficiency: \`\${item.efficiency.toFixed(2)}%\`,
        avgTurnaround: \`\${item.avgTurnaround.toFixed(1)} Days\`
      })}
    />
  );
}
`);

generateFile('ProcessorPerformance', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Factory, DollarSign, Target } from 'lucide-react';

export function ProcessorPerformance() {
  const { processingReceipts, processors } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filteredReceipts = processingReceipts.filter(r => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(r.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        return d >= start && d <= end;
      }
      return true;
    });

    const processorMap = new Map();
    filteredReceipts.forEach(r => {
      const processorName = processors.find(p => p.id === r.processorId)?.name || 'Unknown';
      if (!processorMap.has(processorName)) {
        processorMap.set(processorName, { processorName, totalVolume: 0, totalValue: 0, jobs: 0 });
      }
      const c = processorMap.get(processorName);
      c.totalVolume += r.pcsReceived;
      c.totalValue += r.billAmount;
      c.jobs += 1;
    });

    return Array.from(processorMap.values()).map(p => ({
        ...p,
        avgJobValue: p.totalValue / (p.jobs || 1)
    })).filter(p => !search || p.processorName.toLowerCase().includes(search.toLowerCase()))
       .sort((a,b) => b.totalVolume - a.totalVolume);
  }, [processingReceipts, processors, dateRange, search]);

  const totalVolume = data.reduce((sum, item) => sum + item.totalVolume, 0);

  return (
    <GenericReportTemplate
      title="Processor Performance"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Processors Tracked", value: data.length, icon: Factory },
        { title: "Total Processing Volume", value: formatNumber(totalVolume), icon: Target },
        { title: "Total Value Generated", value: formatCurrency(data.reduce((sum, item) => sum + item.totalValue, 0)), icon: DollarSign }
      ]}
      columns={[
        { key: "processorName", label: "Processor Name" },
        { key: "jobs", label: "Completed Jobs", align: "right" },
        { key: "totalVolume", label: "Total Volume (PCS)", align: "right", render: (item) => formatNumber(item.totalVolume) },
        { key: "totalValue", label: "Total Value Generated", align: "right", render: (item) => formatCurrency(item.totalValue) },
        { key: "avgJobValue", label: "Avg Job Value", align: "right", render: (item) => formatCurrency(item.avgJobValue) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalVolume: formatNumber(item.totalVolume),
        totalValue: formatCurrency(item.totalValue),
        avgJobValue: formatCurrency(item.avgJobValue)
      })}
    />
  );
}
`);

generateFile('PendingPCSReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Factory, AlertCircle } from 'lucide-react';

export function PendingPCSReport() {
  const { processingSends, processingReceipts, processors, materials } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let pendingDispatches = processingSends.filter(s => s.status !== 'Closed');

    const mapped = pendingDispatches.map(s => {
      const processorName = processors.find(p => p.id === s.processorId)?.name || 'Unknown';
      const materialName = materials.find(m => m.id === s.materialId)?.name || 'Unknown';
      
      const relatedReceipts = processingReceipts.filter(r => r.sendId === s.id);
      const totalReceived = relatedReceipts.reduce((sum, r) => sum + r.pcsReceived, 0);
      const pendingPcs = s.pcsSent - totalReceived;

      return {
        dispatchNo: s.dispatchNo,
        date: s.date,
        processorName,
        materialName,
        sentPcs: s.pcsSent,
        receivedPcs: totalReceived,
        pendingPcs,
        status: s.status
      };
    }).filter(p => p.pendingPcs > 0);

    return mapped.filter(p => !search || p.processorName.toLowerCase().includes(search.toLowerCase()) || p.dispatchNo.toLowerCase().includes(search.toLowerCase()));
  }, [processingSends, processingReceipts, processors, materials, search]);

  const totalPending = data.reduce((sum, item) => sum + item.pendingPcs, 0);

  return (
    <GenericReportTemplate
      title="Pending PCS Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Pending Orders", value: data.length, icon: Factory },
        { title: "Total Pending PCS", value: formatNumber(totalPending), icon: AlertCircle }
      ]}
      columns={[
        { key: "dispatchNo", label: "Dispatch No" },
        { key: "processorName", label: "Processor" },
        { key: "materialName", label: "Material" },
        { key: "sentPcs", label: "Sent PCS", align: "right", render: (item) => formatNumber(item.sentPcs) },
        { key: "pendingPcs", label: "Pending PCS", align: "right", render: (item) => <span className="font-medium text-rose-600">{formatNumber(item.pendingPcs)}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        sentPcs: formatNumber(item.sentPcs),
        pendingPcs: formatNumber(item.pendingPcs)
      })}
    />
  );
}
`);


const reportsIndex = `import React from 'react';
import { ProcessingDispatchReport } from './ProcessingDispatchReport';
import { ProcessingReceiveReport } from './ProcessingReceiveReport';
import { PendingProcessingReport } from './PendingProcessingReport';
import { ProcessorBillingReport } from './ProcessorBillingReport';
import { ProcessorLedgerReport } from './ProcessorLedgerReport';
import { ProcessingChargesReport } from './ProcessingChargesReport';
import { ProcessingEfficiency } from './ProcessingEfficiency';
import { ProcessingLossReport } from './ProcessingLossReport';
import { ProcessorPerformance } from './ProcessorPerformance';
import { PendingPCSReport } from './PendingPCSReport';

const Placeholder = ({ name }: {name:string}) => <div className="p-8 text-center text-muted-foreground">{name} Report will be implemented here.</div>;

export function ProcessingReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'processing-dispatch': return <ProcessingDispatchReport />;
    case 'processing-receive': return <ProcessingReceiveReport />;
    case 'pending-processing': return <PendingProcessingReport />;
    case 'processor-billing': return <ProcessorBillingReport />;
    case 'processor-ledger': return <ProcessorLedgerReport />;
    case 'processing-charges': return <ProcessingChargesReport />;
    case 'processing-efficiency': return <ProcessingEfficiency />;
    case 'processing-loss': return <ProcessingLossReport />;
    case 'processor-performance': return <ProcessorPerformance />;
    case 'pending-pcs': return <PendingPCSReport />;
    default: return <Placeholder name={activeReport} />;
  }
}
`;
fs.writeFileSync(path.join(outDir, 'ProcessingReports.tsx'), reportsIndex);

