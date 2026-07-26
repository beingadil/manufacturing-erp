import { useERPStore } from '../../store/useERPStore';
import { ReportEngine } from './ReportEngine';
import { format } from 'date-fns';

export class ProcessingReportService {

  static getDispatchRegisterData() {
    const state = useERPStore.getState();
    const { processingSends, processors, materials } = state;
    return processingSends.map((s: any) => {
const processor = processors.find(p => p.id === s.processorId);
const material = materials.find(m => m.id === s.materialId);
return {
  ...s,
  formattedDate: format(new Date(s.date), 'MMM d, yyyy'),
  processorName: processor?.name || 'Unknown',
  materialName: material?.name || 'Unknown'
};
})
  }


  static getPendingPCSReportData(search: any) {
    const state = useERPStore.getState();
    const { processingSends, processingReceipts, processors, materials } = state;
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
  }


  static getProcessingChargesReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { processingReceipts, processors } = state;
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
  }


  static getProcessingDispatchReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { processingSends, processors, materials } = state;
    return processingSends.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }
  return true;
}).map(p => {
  const processor = processors.find(s => s.id === p.processorId);
  const material = materials.find(m => m.id === p.materialId);
  return {
    ...p,
    processorName: processor?.name || 'Unknown',
    materialName: material?.name || 'Unknown',
  };
}).filter(p => {
  if (!search) return true;
  const q = search.toLowerCase();
  return p.dispatchNo.toLowerCase().includes(q) || 
         p.processorName.toLowerCase().includes(q) || 
         p.materialName.toLowerCase().includes(q);
});
  }


  static getProcessingEfficiencyData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { processingSends, processingReceipts, processors } = state;
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
  }


  static getProcessingLossReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { processingSends, processingReceipts, processors } = state;
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
    processorMap.set(processorName, { processorName, sentPcs: 0, receivedPcs: 0 });
  }
  const c = processorMap.get(processorName);
  c.sentPcs += (send as any).weightSent || send.pcsSent;
  c.receivedPcs += (r as any).weightReceived || r.pcsReceived;
});

return Array.from(processorMap.values()).map(p => ({
    ...p,
    lossPcs: p.sentPcs - p.receivedPcs,
    lossPercentage: p.sentPcs > 0 ? ((p.sentPcs - p.receivedPcs) / p.sentPcs) * 100 : 0
})).filter(p => !search || p.processorName.toLowerCase().includes(search.toLowerCase()))
   .sort((a,b) => b.lossPcs - a.lossPcs);
  }


  static getProcessingReceiveReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { processingReceipts, processingSends, processors, materials } = state;
    return processingReceipts.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }
  return true;
}).map(p => {
  const dispatch = processingSends.find(s => s.id === p.sendId);
  const processor = processors.find(s => s.id === dispatch?.processorId);
  const material = materials.find(m => m.id === dispatch?.materialId);
  return {
    ...p,
    dispatchNo: dispatch?.dispatchNo || 'Unknown',
    processorName: processor?.name || 'Unknown',
    materialName: material?.name || 'Unknown',
  };
}).filter(p => {
  if (!search) return true;
  const q = search.toLowerCase();
  return p.receiveNo.toLowerCase().includes(q) || 
         p.processorName.toLowerCase().includes(q) || 
         p.materialName.toLowerCase().includes(q);
});
  }


  static getProcessorBillingReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { processingReceipts, processors } = state;
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
}).filter(p => !search || p.processorName.toLowerCase().includes(search.toLowerCase()) || p.receiveNo.toLowerCase().includes(search.toLowerCase()));
  }


  static getProcessorLedgerReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts, processors } = state;
    const processorAccounts = accounts.filter(a => a.type === 'Liabilities' && processors.some(s => s.name === a.name));

let filteredEntries = journalEntries.map(entry => {
  const voucher = vouchers.find(v => v.id === entry.voucherId);
  return {
      ...entry,
      date: voucher?.date || '',
      voucherNo: voucher?.voucherNo || '',
      type: entry.debit > 0 ? 'Debit' : 'Credit',
      amount: entry.debit > 0 ? entry.debit : entry.credit
  };
}).filter(e => {
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
  }


  static getProcessorPerformanceData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { processingReceipts, processors } = state;
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
  }


  static getReceiveRegisterData() {
    const state = useERPStore.getState();
    const { processingReceipts, processors } = state;
    return processingReceipts.map((r: any) => {
const processor = processors.find(p => p.id === r.processorId);
return {
  ...r,
  formattedDate: format(new Date(r.date), 'MMM d, yyyy'),
  processorName: processor?.name || 'Unknown'
};
})
  }

}
