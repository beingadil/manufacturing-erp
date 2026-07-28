import { useAuth } from "../contexts/AuthContext";
import { filterFinancialData } from "../lib/abac";
import React, { useMemo } from "react";
import { useERPStore } from "../store/useERPStore";
import { formatCurrency, formatNumber } from "../lib/utils";
import { ArrowRight, PackageSearch, Users, Truck, Wallet, TrendingUp, AlertTriangle, CircleDollarSign, ArrowUpCircle, ArrowDownCircle, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format, subDays, isAfter } from 'date-fns';
import { CashBookEngine } from '../lib/finance/CashBookEngine';

export function Dashboard() {
  const { profile, isAdmin, dataPolicies } = useAuth();
  const { materials, processors, suppliers, customers, processingSends, processingReceipts, sales, purchases, products, accounts, journalEntries } = useERPStore();
  const navigate = useNavigate();
  const secureSales = filterFinancialData(sales, profile, isAdmin, dataPolicies);
  const securePurchases = filterFinancialData(purchases, profile, isAdmin, dataPolicies);

  const totalRawStockPcs = materials.reduce((acc, m) => acc + m.stockPcs, 0);
  const totalProcessedStockPcs = materials.reduce((acc, m) => acc + m.processedStockPcs, 0);
  
  const totalSent = processingSends.reduce((acc, s) => acc + s.pcsSent, 0);
  const totalReceived = processingReceipts.reduce((acc, r) => acc + r.pcsReceived, 0);
  const totalPendingWithProcessors = totalSent - totalReceived;

  
  const totalSalesRevenue = secureSales.reduce((acc: number, s: any) => acc + s.totalAmount, 0);
  const totalPurchasesCost = purchases.reduce((acc, p) => acc + p.amount, 0);

  // Use CashBookEngine for all cash position calculations
  const cashPosition = useMemo(() =>
    CashBookEngine.getCashPosition(accounts, journalEntries, vouchers),
    [accounts, journalEntries, vouchers]
  );


  // Generate last 7 days sales data
  const last7DaysSales = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const daySales = secureSales.filter((s: any) => s.date.startsWith(dateStr)).reduce((sum, s) => sum + s.totalAmount, 0);
      data.push({
        name: format(d, 'MMM dd'),
        sales: daySales
      });
    }
    return data;
  }, [sales]);

  const topProducts = useMemo(() => {
    const productSales: Record<string, number> = {};
    sales.forEach(s => {
      productSales[s.productId] = (productSales[s.productId] || 0) + s.totalAmount;
    });
    return Object.entries(productSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amount]) => {
        const p = products.find(prod => prod.id === id);
        return { name: p?.name || 'Unknown', amount };
      });
  }, [sales, products]);

  const lowStockMaterials = materials.filter(m => m.stockPcs < 500 && m.stockPcs > 0);
  const outOfStockMaterials = materials.filter(m => m.stockPcs === 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Executive Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time overview of enterprise operations.</p>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={() => navigate('/reports')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
            View Full Reports <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <CircleDollarSign className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-medium">Cash in Hand</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{formatCurrency(cashPosition.cashInHand)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-medium">Today's Receipts</span>
          </div>
          <div className="text-2xl font-bold text-success">{formatCurrency(cashPosition.todayReceipts)}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <ArrowDownCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium">Today's Payments</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{formatCurrency(cashPosition.todayPayments)}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Today's Closing</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{formatCurrency(cashPosition.todayClosing)}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Wallet className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium">Total Revenue</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{formatCurrency(totalSalesRevenue)}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <TrendingUp className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium">Total Cost</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{formatCurrency(totalPurchasesCost)}</div>
        </div>
        
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <PackageSearch className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium">Raw Inventory (PCS)</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{formatNumber(totalRawStockPcs)}</div>
        </div>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-3 md:grid-cols-2">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-border/50">
            <h3 className="text-lg font-bold text-foreground">Revenue Trend (Last 7 Days)</h3>
          </div>
          <div className="p-6 flex-1 min-h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7DaysSales} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} dx={-10} tickFormatter={(value) => `₹${value/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "hsl(var(--card))", color: "hsl(var(--foreground))", borderRadius: '12px', border: "1px solid hsl(var(--border))", boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Line type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-border/50">
            <h3 className="text-lg font-bold text-foreground">Top Products by Revenue</h3>
          </div>
          <div className="p-6 flex-1 min-h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--foreground))", fontSize: 13, fontWeight: 500 }} width={100} />
                <Tooltip 
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", color: "hsl(var(--foreground))", borderRadius: '12px', border: "1px solid hsl(var(--border))", boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border/50 flex items-center justify-between bg-muted/40/50">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Alerts & Notifications
            </h3>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            <ul className="divide-y divide-border/50">
              {outOfStockMaterials.map(m => (
                <li key={m.id} className="p-4 flex items-start gap-3 hover:bg-muted/40">
                  <div className="mt-0.5 rounded-full bg-destructive/10 p-1"><AlertTriangle className="h-4 w-4 text-destructive"/></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name} is Out of Stock</p>
                    <p className="text-xs text-muted-foreground mt-1">Please create a purchase order immediately.</p>
                  </div>
                </li>
              ))}
              {lowStockMaterials.map(m => (
                <li key={m.id} className="p-4 flex items-start gap-3 hover:bg-muted/40">
                  <div className="mt-0.5 rounded-full bg-warning/10 p-1"><AlertTriangle className="h-4 w-4 text-warning"/></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name} is running low ({m.stockPcs} PCS)</p>
                    <p className="text-xs text-muted-foreground mt-1">Consider restocking soon to avoid production delays.</p>
                  </div>
                </li>
              ))}
              {outOfStockMaterials.length === 0 && lowStockMaterials.length === 0 && (
                <li className="p-8 text-center text-muted-foreground text-sm">No alerts at this time. All systems nominal.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-border/50 flex items-center justify-between bg-muted/40/50">
            <h3 className="font-semibold text-foreground">Recent Transactions</h3>
            <button onClick={() => navigate('/sales')} className="text-sm font-medium text-info hover:text-info">View All Sales</button>
          </div>
          <div className="p-0">
            <table className="w-full text-sm text-left">
              <tbody className="divide-y divide-border/50">
                {(secureSales as any[]).slice(0, 5).map(s => (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className="px-5 py-4"><span className="text-xs text-muted-foreground">{new Date(s.date).toLocaleDateString()}</span></td>
                    <td className="px-5 py-4 font-medium">{s.invoiceNo}</td>
                    <td className="px-5 py-4 text-right font-bold text-success">+{formatCurrency(s.totalAmount)}</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">No recent transactions</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
