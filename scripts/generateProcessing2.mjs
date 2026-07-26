import fs from 'fs';
import path from 'path';

const outDir = '/workspace/app-d0luni1anmkh/src/components/reports/processing';

const generateFile = (name, content) => {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), content);
};

generateFile('ProcessorBillingReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Factory, DollarSign, Activity } from 'lucide-react';
import { format } from 'date-fns';

export function ProcessorBillingReport() {
  const { processingReceipts, processors } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = processingReceipts.filter(p => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(p.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    return filtered.map(r => {
        const processorName = processors.find(p => p.id === r.processorId)?.name || 'Unknown';
        return {
            ...r,
            processorName
        };
    }).filter(p => !search || p.processorName.toLowerCase().includes(search.toLowerCase()) || p.receiptNo.toLowerCase().includes(search.toLowerCase()));
  }, [processingReceipts, processors, dateRange, search]);

  const totalAmount = data.reduce((sum, item) => sum + item.billAmount, 0);

  return (
    <GenericReportTemplate
      title="Processor Billing Report"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Total Bills", value: data.length, icon: Activity },
        { title: "Total Amount", value: formatCurrency(totalAmount), icon: DollarSign }
      ]}
      columns={[
        { key: "date", label: "Date", render: (item) => format(new Date(item.date), 'dd-MMM-yyyy') },
        { key: "receiptNo", label: "Receipt No" },
        { key: "processorName", label: "Processor" },
        { key: "pcsReceived", label: "PCS", align: "right", render: (item) => formatNumber(item.pcsReceived) },
        { key: "billAmount", label: "Bill Amount", align: "right", render: (item) => formatCurrency(item.billAmount) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        date: format(new Date(item.date), 'dd-MMM-yyyy'),
        pcsReceived: formatNumber(item.pcsReceived),
        billAmount: formatCurrency(item.billAmount)
      })}
    />
  );
}
`);

generateFile('ProcessingLossReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Factory, AlertCircle, Percent } from 'lucide-react';

export function ProcessingLossReport() {
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
        processorMap.set(processorName, { processorName, sentWeight: 0, receivedWeight: 0 });
      }
      const c = processorMap.get(processorName);
      c.sentWeight += send.weightSent;
      c.receivedWeight += r.weightReceived;
    });

    return Array.from(processorMap.values()).map(p => ({
        ...p,
        lossWeight: p.sentWeight - p.receivedWeight,
        lossPercentage: p.sentWeight > 0 ? ((p.sentWeight - p.receivedWeight) / p.sentWeight) * 100 : 0
    })).filter(p => !search || p.processorName.toLowerCase().includes(search.toLowerCase()))
       .sort((a,b) => b.lossWeight - a.lossWeight);
  }, [processingSends, processingReceipts, processors, dateRange, search]);

  const totalLoss = data.reduce((sum, item) => sum + item.lossWeight, 0);

  return (
    <GenericReportTemplate
      title="Processing Loss / Wastage"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Processors", value: data.length, icon: Factory },
        { title: "Total Loss (KGs)", value: formatNumber(totalLoss), icon: AlertCircle }
      ]}
      columns={[
        { key: "processorName", label: "Processor Name" },
        { key: "sentWeight", label: "Sent (KGs)", align: "right", render: (item) => formatNumber(item.sentWeight) },
        { key: "receivedWeight", label: "Received (KGs)", align: "right", render: (item) => formatNumber(item.receivedWeight) },
        { key: "lossWeight", label: "Loss (KGs)", align: "right", render: (item) => <span className="text-rose-600 font-medium">{formatNumber(item.lossWeight)}</span> },
        { key: "lossPercentage", label: "Loss %", align: "right", render: (item) => \`\${item.lossPercentage.toFixed(2)}%\` }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        sentWeight: formatNumber(item.sentWeight),
        receivedWeight: formatNumber(item.receivedWeight),
        lossWeight: formatNumber(item.lossWeight),
        lossPercentage: \`\${item.lossPercentage.toFixed(2)}%\`
      })}
    />
  );
}
`);

generateFile('ProcessingChargesReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Factory, DollarSign } from 'lucide-react';

export function ProcessingChargesReport() {
  const { processingReceipts, processors } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    let filtered = processingReceipts.filter(r => {
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
    filtered.forEach(r => {
      const processorName = processors.find(p => p.id === r.processorId)?.name || 'Unknown';
      if (!processorMap.has(processorName)) {
        processorMap.set(processorName, { processorName, totalCharges: 0, totalPcs: 0 });
      }
      const c = processorMap.get(processorName);
      c.totalCharges += r.billAmount;
      c.totalPcs += r.pcsReceived;
    });

    return Array.from(processorMap.values()).map(p => ({
        ...p,
        avgChargePerPc: p.totalPcs > 0 ? p.totalCharges / p.totalPcs : 0
    })).filter(p => !search || p.processorName.toLowerCase().includes(search.toLowerCase()));
  }, [processingReceipts, processors, dateRange, search]);

  const totalCharges = data.reduce((sum, item) => sum + item.totalCharges, 0);

  return (
    <GenericReportTemplate
      title="Processing Charges Analysis"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Processors Tracked", value: data.length, icon: Factory },
        { title: "Total Charges", value: formatCurrency(totalCharges), icon: DollarSign }
      ]}
      columns={[
        { key: "processorName", label: "Processor" },
        { key: "totalPcs", label: "Total PCS", align: "right", render: (item) => formatNumber(item.totalPcs) },
        { key: "totalCharges", label: "Total Charges", align: "right", render: (item) => formatCurrency(item.totalCharges) },
        { key: "avgChargePerPc", label: "Avg / PC", align: "right", render: (item) => formatCurrency(item.avgChargePerPc) }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalPcs: formatNumber(item.totalPcs),
        totalCharges: formatCurrency(item.totalCharges),
        avgChargePerPc: formatCurrency(item.avgChargePerPc)
      })}
    />
  );
}
`);

generateFile('ProcessorLedgerReport', `import React, { useMemo, useState } from 'react';
import { useERPStore } from '../../../store/useERPStore';
import { formatCurrency } from '../../../lib/utils';
import { GenericReportTemplate } from '../common/GenericReportTemplate';
import { Factory, DollarSign, FileText } from 'lucide-react';

export function ProcessorLedgerReport() {
  const { ledgerEntries, accounts, processors } = useERPStore();
  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');

  const data = useMemo(() => {
    const processorAccounts = accounts.filter(a => a.type === 'Liabilities' && processors.some(s => s.name === a.name));
    
    let filteredEntries = ledgerEntries.filter(e => {
      if (dateRange.start && dateRange.end) {
        const d = new Date(e.date);
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        start.setHours(0,0,0,0); end.setHours(23,59,59,999);
        if (d < start || d > end) return false;
      }
      return true;
    });

    const summary = processorAccounts.map(account => {
      const entries = filteredEntries.filter(e => e.accountId === account.id);
      let totalDebit = 0;
      let totalCredit = 0;
      
      entries.forEach(e => {
        if (e.type === 'Debit') totalDebit += e.amount;
        if (e.type === 'Credit') totalCredit += e.amount;
      });

      return {
        processorName: account.name,
        transactions: entries.length,
        totalDebit,
        totalCredit,
        netChange: totalCredit - totalDebit
      };
    }).filter(s => s.transactions > 0);

    if (search) {
      return summary.filter(s => s.processorName.toLowerCase().includes(search.toLowerCase()));
    }
    return summary.sort((a,b) => b.transactions - a.transactions);
  }, [ledgerEntries, accounts, processors, dateRange, search]);

  const grandDebit = data.reduce((sum, item) => sum + item.totalDebit, 0);
  const grandCredit = data.reduce((sum, item) => sum + item.totalCredit, 0);

  return (
    <GenericReportTemplate
      title="Processor Ledger Summary"
      data={data}
      onDateRangeChange={setDateRange}
      onSearch={setSearch}
      kpis={[
        { title: "Active Processors", value: data.length, icon: Factory },
        { title: "Total Payments (Dr)", value: formatCurrency(grandDebit), icon: DollarSign },
        { title: "Total Billings (Cr)", value: formatCurrency(grandCredit), icon: DollarSign },
        { title: "Total Transactions", value: data.reduce((sum, i) => sum + i.transactions, 0), icon: FileText }
      ]}
      columns={[
        { key: "processorName", label: "Processor Name" },
        { key: "transactions", label: "Transactions", align: "right" },
        { key: "totalDebit", label: "Total Debit", align: "right", render: (item) => formatCurrency(item.totalDebit) },
        { key: "totalCredit", label: "Total Credit", align: "right", render: (item) => formatCurrency(item.totalCredit) },
        { key: "netChange", label: "Net Change", align: "right", render: (item) => <span className={item.netChange > 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>{formatCurrency(Math.abs(item.netChange))} {item.netChange > 0 ? 'Cr' : 'Dr'}</span> }
      ]}
      exportDataMapping={(item) => ({
        ...item,
        totalDebit: formatCurrency(item.totalDebit),
        totalCredit: formatCurrency(item.totalCredit),
        netChange: \`\${formatCurrency(Math.abs(item.netChange))} \${item.netChange > 0 ? 'Cr' : 'Dr'}\`
      })}
    />
  );
}
`);

// PendingProcessingReport
generateFile('PendingProcessingReport', `import React from 'react';
import { PendingPCSReport } from './PendingPCSReport';

export function PendingProcessingReport() {
  return <PendingPCSReport />;
}
`);

