import { useERPStore } from '../../store/useERPStore';
import { ReportEngine } from './ReportEngine';
import { format } from 'date-fns';

export class PurchaseReportService {
  static getPurchaseRegister(dateRange: { start: string; end: string }, searchQuery: string) {
    const { purchases, suppliers, materials } = useERPStore.getState();

    const mappedPurchases = purchases.map(p => {
      const supplier = suppliers.find(s => s.id === p.supplierId);
      const material = materials.find(m => m.id === p.materialId);
      return {
        ...p,
        supplierName: supplier?.name || 'Unknown',
        materialName: material?.name || 'Unknown',
      };
    });

    const filtered = ReportEngine.filterByDateRange(mappedPurchases, 'date', dateRange);
    return ReportEngine.search(filtered, searchQuery, ['purchaseNo', 'supplierName', 'materialName']);
  }


  static getMaterialPurchaseReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { purchases, materials } = state;
    let filtered = purchases.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const materialMap = new Map();
filtered.forEach(p => {
  const materialName = materials.find(m => m.id === p.materialId)?.name || 'Unknown';
  if (!materialMap.has(materialName)) {
    materialMap.set(materialName, { materialName, count: 0, weight: 0, amount: 0 });
  }
  const c = materialMap.get(materialName);
  c.count += 1;
  c.weight += p.weight;
  c.amount += p.amount;
});

return Array.from(materialMap.values()).filter(p => !search || p.materialName.toLowerCase().includes(search.toLowerCase()));
  }


  static getPurchaseByCategoryData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { purchases, materials, categories } = state;
    let filtered = purchases.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const categoryMap = new Map();
filtered.forEach(p => {
  const material = materials.find(m => m.id === p.materialId);
  const categoryName = categories.find(c => c.id === material?.categoryId)?.name || 'Unknown';
  if (!categoryMap.has(categoryName)) {
    categoryMap.set(categoryName, { categoryName, count: 0, weight: 0, amount: 0 });
  }
  const c = categoryMap.get(categoryName);
  c.count += 1;
  c.weight += p.weight;
  c.amount += p.amount;
});

return Array.from(categoryMap.values()).filter(p => !search || p.categoryName.toLowerCase().includes(search.toLowerCase()));
  }


  static getPurchaseComparisonReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { purchases, materials } = state;
    // Current period
let currentPurchases = purchases.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }
  return true;
});

// Previous period (same length)
let prevPurchases: any[] = [];
if (dateRange.start && dateRange.end) {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const diff = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    prevPurchases = purchases.filter(p => {
        const d = new Date(p.date);
        return d >= prevStart && d <= prevEnd;
    });
}

const materialMap = new Map();

currentPurchases.forEach(p => {
  const mat = materials.find(m => m.id === p.materialId)?.name || 'Unknown';
  if (!materialMap.has(mat)) {
    materialMap.set(mat, { materialName: mat, currentAmount: 0, prevAmount: 0, currentWeight: 0, prevWeight: 0 });
  }
  const m = materialMap.get(mat);
  m.currentAmount += p.amount;
  m.currentWeight += p.weight;
});

prevPurchases.forEach(p => {
  const mat = materials.find(m => m.id === p.materialId)?.name || 'Unknown';
  if (!materialMap.has(mat)) {
    materialMap.set(mat, { materialName: mat, currentAmount: 0, prevAmount: 0, currentWeight: 0, prevWeight: 0 });
  }
  const m = materialMap.get(mat);
  m.prevAmount += p.amount;
  m.prevWeight += p.weight;
});

return Array.from(materialMap.values()).map(m => {
    const growth = m.prevAmount > 0 ? ((m.currentAmount - m.prevAmount) / m.prevAmount) * 100 : 100;
    return { ...m, growth };
}).filter(p => !search || p.materialName.toLowerCase().includes(search.toLowerCase()));
  }


  static getPurchaseCostAnalysisData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { purchases, materials } = state;
    let filtered = purchases.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const materialMap = new Map();
filtered.forEach(p => {
  const materialName = materials.find(m => m.id === p.materialId)?.name || 'Unknown';
  if (!materialMap.has(materialName)) {
    materialMap.set(materialName, { materialName, count: 0, weight: 0, amount: 0, minRate: p.ratePerUnit, maxRate: p.ratePerUnit });
  }
  const c = materialMap.get(materialName);
  c.count += 1;
  c.weight += p.weight;
  c.amount += p.amount;
  if (p.ratePerUnit < c.minRate) c.minRate = p.ratePerUnit;
  if (p.ratePerUnit > c.maxRate) c.maxRate = p.ratePerUnit;
});

return Array.from(materialMap.values()).map(m => ({
    ...m,
    avgRate: m.amount / (m.weight || 1),
    variance: m.maxRate - m.minRate
})).filter(p => !search || p.materialName.toLowerCase().includes(search.toLowerCase()));
  }


  static getPurchaseOrderReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { purchases, suppliers, materials } = state;
    return purchases.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
}).map(p => {
  const supplier = suppliers.find(s => s.id === p.supplierId);
  const material = materials.find(m => m.id === p.materialId);
  return {
    ...p,
    supplierName: supplier?.name || 'Unknown',
    materialName: material?.name || 'Unknown',
  };
}).filter(p => {
  if (!search) return true;
  const q = search.toLowerCase();
  return p.purchaseNo.toLowerCase().includes(q) || 
         p.supplierName.toLowerCase().includes(q) || 
         p.materialName.toLowerCase().includes(q);
});
  }


  static getPurchaseSummaryData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { purchases, suppliers } = state;
    let filtered = purchases.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const supplierMap = new Map();
filtered.forEach(p => {
  const supplierName = suppliers.find(s => s.id === p.supplierId)?.name || 'Unknown';
  if (!supplierMap.has(supplierName)) {
    supplierMap.set(supplierName, { supplierName, count: 0, weight: 0, calculatedPcs: 0, amount: 0 });
  }
  const s = supplierMap.get(supplierName);
  s.count += 1;
  s.weight += p.weight;
  s.calculatedPcs += p.calculatedPcs;
  s.amount += p.amount;
});

return Array.from(supplierMap.values()).filter(p => !search || p.supplierName.toLowerCase().includes(search.toLowerCase()));
  }


  static getPurchaseTrendData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { purchases } = state;
    let filtered = purchases.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const dateMap = new Map();
filtered.forEach(p => {
  const dateStr = format(new Date(p.date), 'yyyy-MM-dd');
  if (!dateMap.has(dateStr)) {
    dateMap.set(dateStr, { dateStr, count: 0, weight: 0, amount: 0 });
  }
  const c = dateMap.get(dateStr);
  c.count += 1;
  c.weight += p.weight;
  c.amount += p.amount;
});

return Array.from(dateMap.values())
    .sort((a,b) => a.dateStr.localeCompare(b.dateStr))
    .filter(p => !search || p.dateStr.includes(search));
  }


  static getSupplierLedgerSummaryData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts, suppliers } = state;
    const supplierAccounts = accounts.filter(a => a.type === 'Liabilities' && suppliers.some(s => s.name === a.name));

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

const summary = supplierAccounts.map(account => {
  const entries = filteredEntries.filter(e => e.accountId === account.id);
  let totalDebit = 0;
  let totalCredit = 0;
  
  entries.forEach(e => {
    if (e.type === 'Debit') totalDebit += e.amount;
    if (e.type === 'Credit') totalCredit += e.amount;
  });

  return {
    supplierName: account.name,
    transactions: entries.length,
    totalDebit,
    totalCredit,
    netChange: totalCredit - totalDebit
  };
}).filter(s => s.transactions > 0);

if (search) {
  return summary.filter(s => s.supplierName.toLowerCase().includes(search.toLowerCase()));
}
return summary.sort((a,b) => b.transactions - a.transactions);
  }


  static getSupplierOutstandingReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts, suppliers } = state;
    // Get all supplier accounts
const supplierAccounts = accounts.filter(a => a.type === 'Liabilities' && suppliers.some(s => s.name === a.name));

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

const supplierBalances = suppliers.map(supplier => {
  const account = supplierAccounts.find(a => a.name === supplier.name);
  if (!account) return { supplierName: supplier.name, contact: supplier.phone, balance: 0, status: 'Clear' };
  
  const entries = filteredEntries.filter(e => e.accountId === account.id);
  let balance = account.openingBalanceType === 'Credit' ? account.openingBalance : -account.openingBalance;
  
  entries.forEach(e => {
    if (e.type === 'Credit') balance += e.amount;
    if (e.type === 'Debit') balance -= e.amount;
  });

  return {
    supplierName: supplier.name,
    contact: supplier.phone,
    balance,
    status: balance > 0 ? 'Payable' : (balance < 0 ? 'Advance' : 'Clear')
  };
}).filter(s => s.balance !== 0);

if (search) {
  return supplierBalances.filter(s => s.supplierName.toLowerCase().includes(search.toLowerCase()));
}
return supplierBalances.sort((a,b) => b.balance - a.balance);
  }


  static getSupplierPurchaseReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { purchases, suppliers } = state;
    let filtered = purchases.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const supplierMap = new Map();
filtered.forEach(p => {
  const supplierName = suppliers.find(s => s.id === p.supplierId)?.name || 'Unknown';
  if (!supplierMap.has(supplierName)) {
    supplierMap.set(supplierName, { supplierName, count: 0, weight: 0, amount: 0 });
  }
  const c = supplierMap.get(supplierName);
  c.count += 1;
  c.weight += p.weight;
  c.amount += p.amount;
});

return Array.from(supplierMap.values()).filter(p => !search || p.supplierName.toLowerCase().includes(search.toLowerCase()));
  }


  static getSupplierPurchaseSummaryData() {
    const state = useERPStore.getState();
    const { purchases, suppliers } = state;
    return suppliers.map(supplier => {
  const supplierPurchases = purchases.filter(p => p.supplierId === supplier.id);
  const totalOrders = supplierPurchases.length;
  const totalWeight = supplierPurchases.reduce((sum, p) => sum + p.weight, 0);
  const totalPCS = supplierPurchases.reduce((sum, p) => sum + p.calculatedPcs, 0);
  const totalAmount = supplierPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);

  return {
    id: supplier.id,
    supplierName: supplier.name,
    contactPerson: supplier.contactPerson,
    totalOrders,
    totalWeight,
    totalPCS,
    totalAmount
  };
}).filter(d => d.totalOrders > 0);
  }

}