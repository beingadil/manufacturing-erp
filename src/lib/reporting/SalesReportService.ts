import { useERPStore } from '../../store/useERPStore';
import { ReportEngine } from './ReportEngine';
import { format } from 'date-fns';

export class SalesReportService {
  static getSalesRegister(dateRange: { start: string; end: string }, searchQuery: string) {
    const { sales, customers, products } = useERPStore.getState();

    const mappedSales = sales.map(s => {
      const customer = customers.find(c => c.id === s.customerId);
      const product = products.find(p => p.id === s.productId);
      return {
        ...s,
        customerName: customer?.name || 'Unknown',
        productName: product?.name || 'Unknown'
      };
    });

    const filtered = ReportEngine.filterByDateRange(mappedSales, 'date', dateRange);
    return ReportEngine.search(filtered, searchQuery, ['invoiceNo', 'customerName', 'productName']);
  }


  static getCustomerLedgerSummaryData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts, customers } = state;
    const customerAccounts = accounts.filter(a => a.type === 'Assets' && customers.some(c => c.name === a.name));

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

const summary = customerAccounts.map(account => {
  const entries = filteredEntries.filter(e => e.accountId === account.id);
  let totalDebit = 0;
  let totalCredit = 0;
  
  entries.forEach(e => {
    if (e.type === 'Debit') totalDebit += e.amount;
    if (e.type === 'Credit') totalCredit += e.amount;
  });

  return {
    customerName: account.name,
    transactions: entries.length,
    totalDebit,
    totalCredit,
    netChange: totalDebit - totalCredit
  };
}).filter(c => c.transactions > 0);

if (search) {
  return summary.filter(c => c.customerName.toLowerCase().includes(search.toLowerCase()));
}
return summary.sort((a,b) => b.transactions - a.transactions);
  }


  static getCustomerOutstandingData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { journalEntries, vouchers, accounts, customers } = state;
    const customerAccounts = accounts.filter(a => a.type === 'Assets' && customers.some(c => c.name === a.name));

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

const balances = customers.map(customer => {
  const account = customerAccounts.find(a => a.name === customer.name);
  if (!account) return { customerName: customer.name, contact: customer.phone, balance: 0, status: 'Clear' };
  
  const entries = filteredEntries.filter(e => e.accountId === account.id);
  let balance = account.openingBalanceType === 'Debit' ? account.openingBalance : -account.openingBalance;
  
  entries.forEach(e => {
    if (e.type === 'Debit') balance += e.amount;
    if (e.type === 'Credit') balance -= e.amount;
  });

  return {
    customerName: customer.name,
    contact: customer.phone,
    balance,
    status: balance > 0 ? 'Receivable' : (balance < 0 ? 'Advance' : 'Clear')
  };
}).filter(c => c.balance !== 0);

if (search) {
  return balances.filter(c => c.customerName.toLowerCase().includes(search.toLowerCase()));
}
return balances.sort((a,b) => b.balance - a.balance);
  }


  static getCustomerOutstandingReportData(search: any) {
    const state = useERPStore.getState();
    const { customers, accounts } = state;
    return customers.map(customer => {
  // Find the associated account
  const account = accounts.find(a => a.type === 'Assets' && a.name.includes(customer.name));
  const balance = account ? account.openingBalance : 0; // Simplified for now
  return {
    ...customer,
    balance
  };
}).filter(c => c.balance > 0 && (!search || c.name.toLowerCase().includes(search.toLowerCase())));
  }


  static getCustomerSalesSummaryData() {
    const state = useERPStore.getState();
    const { sales, customers } = state;
    return customers.map(customer => {
  const customerSales = sales.filter(s => s.customerId === customer.id);
  const totalInvoices = customerSales.length;
  const totalPCS = customerSales.reduce((sum, s) => sum + s.pcsSold, 0);
  const totalRevenue = customerSales.reduce((sum, s) => sum + s.totalAmount, 0);

  return {
    id: customer.id,
    customerName: customer.name,
    contactPerson: customer.contactPerson,
    totalInvoices,
    totalPCS,
    totalRevenue
  };
}).filter(d => d.totalInvoices > 0);
  }


  static getProductSalesAnalysisData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { sales, products } = state;
    let filtered = sales.filter(s => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(s.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const productMap = new Map();
filtered.forEach(s => {
  const product = products.find(p => p.id === s.productId);
  const productName = product?.name || 'Unknown';
  if (!productMap.has(productName)) {
    productMap.set(productName, { productName, count: 0, pcsSold: 0, totalAmount: 0, minPrice: s.pricePerPiece, maxPrice: s.pricePerPiece });
  }
  const c = productMap.get(productName);
  c.count += 1;
  c.pcsSold += s.pcsSold;
  c.totalAmount += s.totalAmount;
  if (s.pricePerPiece < c.minPrice) c.minPrice = s.pricePerPiece;
  if (s.pricePerPiece > c.maxPrice) c.maxPrice = s.pricePerPiece;
});

return Array.from(productMap.values()).map(m => ({
    ...m,
    avgPrice: m.totalAmount / (m.pcsSold || 1),
    variance: m.maxPrice - m.minPrice
})).filter(p => !search || p.productName.toLowerCase().includes(search.toLowerCase()));
  }


  static getProductSalesReportData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { sales, products } = state;
    const filtered = sales.filter(s => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(s.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }
  return true;
});

return products.map(product => {
  const prodSales = filtered.filter(s => s.productId === product.id);
  return {
    ...product,
    transactionCount: prodSales.length,
    totalPcs: prodSales.reduce((sum, s) => sum + s.pcsSold, 0),
    totalAmount: prodSales.reduce((sum, s) => sum + s.totalAmount, 0)
  };
}).filter(p => p.transactionCount > 0 && (!search || p.name.toLowerCase().includes(search.toLowerCase())));
  }


  static getProfitByProductData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { sales, products, purchases } = state;
    let filteredSales = sales.filter(s => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(s.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }
  return true;
});

// Approximate cost by finding raw material avg purchase rate
const avgMaterialCost = new Map();
purchases.forEach(p => {
    if (!avgMaterialCost.has(p.materialId)) avgMaterialCost.set(p.materialId, { amount: 0, weight: 0 });
    const c = avgMaterialCost.get(p.materialId);
    c.amount += p.amount;
    c.weight += p.weight;
});

const productMap = new Map();
filteredSales.forEach(s => {
  const product = products.find(p => p.id === s.productId);
  const productName = product?.name || 'Unknown';
  if (!productMap.has(productName)) {
    // Calculate approx cost if material is linked
    let costPerPiece = 0;
    if (product && product.materialId && avgMaterialCost.has(product.materialId)) {
        const mc = avgMaterialCost.get(product.materialId);
        const ratePerKg = mc.amount / (mc.weight || 1);
        // Rough estimation
        costPerPiece = (ratePerKg / 1000) * 100; // Assume 100g per piece
    }
    productMap.set(productName, { productName, revenue: 0, cost: 0, pcs: 0, costPerPiece });
  }
  const c = productMap.get(productName);
  c.pcs += s.pcsSold;
  c.revenue += s.totalAmount;
  c.cost += (s.pcsSold * c.costPerPiece);
});

return Array.from(productMap.values()).map(p => ({
    ...p,
    profit: p.revenue - p.cost,
    margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0
})).filter(p => !search || p.productName.toLowerCase().includes(search.toLowerCase()))
   .sort((a,b) => b.profit - a.profit);
  }


  static getSalesComparisonData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { sales, products } = state;
    let currentSales = sales.filter(s => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(s.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }
  return true;
});

let prevSales: any[] = [];
if (dateRange.start && dateRange.end) {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const diff = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    prevSales = sales.filter(s => {
        const d = new Date(s.date);
        return d >= prevStart && d <= prevEnd;
    });
}

const productMap = new Map();

currentSales.forEach(s => {
  const prod = products.find(p => p.id === s.productId)?.name || 'Unknown';
  if (!productMap.has(prod)) productMap.set(prod, { productName: prod, currentAmount: 0, prevAmount: 0 });
  productMap.get(prod).currentAmount += s.totalAmount;
});

prevSales.forEach(s => {
  const prod = products.find(p => p.id === s.productId)?.name || 'Unknown';
  if (!productMap.has(prod)) productMap.set(prod, { productName: prod, currentAmount: 0, prevAmount: 0 });
  productMap.get(prod).prevAmount += s.totalAmount;
});

return Array.from(productMap.values()).map(p => ({
    ...p,
    growth: p.prevAmount > 0 ? ((p.currentAmount - p.prevAmount) / p.prevAmount) * 100 : 100
})).filter(p => !search || p.productName.toLowerCase().includes(search.toLowerCase()));
  }


  static getSalesSummaryData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { sales, customers } = state;
    const filtered = sales.filter(s => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(s.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }
  return true;
});

const summaryMap = new Map();
filtered.forEach(s => {
  const key = s.customerId;
  if (!summaryMap.has(key)) {
    summaryMap.set(key, {
      customerId: key,
      customerName: customers.find(c => c.id === key)?.name || 'Unknown',
      transactionCount: 0,
      totalPcs: 0,
      totalAmount: 0
    });
  }
  const existing = summaryMap.get(key);
  existing.transactionCount++;
  existing.totalPcs += s.pcsSold;
  existing.totalAmount += s.totalAmount;
});

return Array.from(summaryMap.values()).filter(s => !search || s.customerName.toLowerCase().includes(search.toLowerCase()));
  }


  static getSalesTrendData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { sales } = state;
    let filtered = sales.filter(p => {
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
    dateMap.set(dateStr, { dateStr, count: 0, pcs: 0, amount: 0 });
  }
  const c = dateMap.get(dateStr);
  c.count += 1;
  c.pcs += p.pcsSold;
  c.amount += p.totalAmount;
});

return Array.from(dateMap.values())
    .sort((a,b) => a.dateStr.localeCompare(b.dateStr))
    .filter(p => !search || p.dateStr.includes(search));
  }


  static getTopSellingProductsData(dateRange: any, search: any) {
    const state = useERPStore.getState();
    const { sales, products } = state;
    let filtered = sales.filter(p => {
  if (dateRange.start && dateRange.end) {
    const d = new Date(p.date);
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    if (d < start || d > end) return false;
  }
  return true;
});

const prodMap = new Map();
filtered.forEach(p => {
  const prod = products.find(m => m.id === p.productId)?.name || 'Unknown';
  if (!prodMap.has(prod)) {
    prodMap.set(prod, { productName: prod, count: 0, pcs: 0, amount: 0 });
  }
  const c = prodMap.get(prod);
  c.count += 1;
  c.pcs += p.pcsSold;
  c.amount += p.totalAmount;
});

return Array.from(prodMap.values())
    .sort((a,b) => b.amount - a.amount)
    .filter(p => !search || p.productName.toLowerCase().includes(search.toLowerCase()));
  }

}