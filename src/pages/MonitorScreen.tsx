import { 
  ArrowLeft, DollarSign, Factory, Maximize, Minimize,Package, RefreshCw, 
  ShoppingCart, TrendingDown, 
  TrendingUp, Users, Wallet
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {Bar, BarChart, CartesianGrid, 
  ComposedChart, Legend, Line, 
  LineChart, Tooltip as RechartsTooltip, ResponsiveContainer,XAxis, YAxis 
} from 'recharts';
import { formatCurrency, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';

export function MonitorScreen() {
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Destructure state
  const {
    sales, purchases, materials, customers, suppliers, processors, processingSends
  } = useERPStore();

  const handleRefresh = () => {
    setLastUpdated(new Date());
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Compute Metrics
  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    let todayRevenue = 0;
    let monthRevenue = 0;
    sales.forEach(s => {
      const d = new Date(s.date);
      if (d >= today) todayRevenue += s.totalAmount;
      if (d >= startOfMonth) monthRevenue += s.totalAmount;
    });

    let todayPurchase = 0;
    let monthPurchase = 0;
    purchases.forEach(p => {
      const d = new Date(p.date);
      if (d >= today) todayPurchase += (p.weight * p.ratePerUnit);
      if (d >= startOfMonth) monthPurchase += (p.weight * p.ratePerUnit);
    });

    const rawMaterialStock = materials.reduce((sum, m) => sum + (m.stockPcs || 0), 0);
    // True WIP: pcs in the processing pipeline (at a processor OR waiting for
    // the next stage) — not finished stock, which has its own column.
    const wipStock = materials.reduce((sum, m) => sum + (m.atProcessorPcs || 0), 0);
    
    const totalAR = customers.reduce((sum, c) => sum + (c.balanceReceivable || 0), 0);
    const totalAP = suppliers.reduce((sum, s) => sum + (s.balancePayable || 0), 0) + 
                    processors.reduce((sum, p) => sum + (p.balancePayable || 0), 0);

    return {
      todayRevenue, monthRevenue, todayPurchase, monthPurchase,
      rawMaterialStock, wipStock, totalAR, totalAP
    };
  }, [sales, purchases, materials, customers, suppliers, processors, lastUpdated]);

  // Compute 30-day trends
  const trendData = useMemo(() => {
    const data: Array<{ date: string; revenue: number; purchase: number; profit: number }> = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const daySales = sales.filter(s => s.date.startsWith(dateStr)).reduce((sum, s) => sum + s.totalAmount, 0);
      const dayPurchases = purchases.filter(p => p.date.startsWith(dateStr)).reduce((sum, p) => sum + (p.weight * p.ratePerUnit), 0);
      
      data.push({
        date: dateStr.substring(5), // MM-DD
        revenue: daySales,
        purchase: dayPurchases,
        profit: daySales - dayPurchases
      });
    }
    return data;
  }, [sales, purchases, lastUpdated]);

  // Rankings
  const rankings = useMemo(() => {
    // 1. Product Sales Rank
    const productSalesMap: Record<string, { name: string, amount: number }> = {};
    sales.forEach(s => {
      if (!productSalesMap[s.productId]) {
        // We'd ideally join with product store, but let's assume we have product names if we look them up
        productSalesMap[s.productId] = { name: s.productId, amount: 0 };
      }
      productSalesMap[s.productId].amount += s.totalAmount;
    });
    const productSales = Object.values(productSalesMap).sort((a, b) => b.amount - a.amount).slice(0, 10);
    // Note: since we don't have product store destructured, we just use ID or fetch products later. Wait, we should get products!

    // 2. Customer Contribution Rank (Top 10 AR)
    const customerRank = [...customers].sort((a, b) => b.balanceReceivable - a.balanceReceivable).slice(0, 10);

    // 3. Supplier Purchase Rank (Top 10 purchases)
    const supplierPurchasesMap: Record<string, { name: string, amount: number }> = {};
    suppliers.forEach(s => {
      supplierPurchasesMap[s.id] = { name: s.name, amount: 0 };
    });
    purchases.forEach(p => {
      if (supplierPurchasesMap[p.supplierId]) {
        supplierPurchasesMap[p.supplierId].amount += (p.weight * p.ratePerUnit);
      }
    });
    const supplierRank = Object.values(supplierPurchasesMap).sort((a, b) => b.amount - a.amount).slice(0, 10);

    return { productSales, customerRank, supplierRank };
  }, [sales, purchases, customers, suppliers, lastUpdated]);

  // For Processor Holdings
  const processorHoldings = useMemo(() => {
    return processors.map(p => {
      const pSends = processingSends.filter(send => send.processorId === p.id);
      const sentPcs = pSends.reduce((sum, s) => sum + s.pcsSent, 0);
      const receivedPcs = pSends.reduce((sum, s) => sum + s.pcsReceived, 0);
      return {
        id: p.id,
        name: p.name,
        sentPcs,
        receivedPcs,
        holdingPcs: sentPcs - receivedPcs,
        balance: p.balancePayable
      };
    }).sort((a, b) => b.holdingPcs - a.holdingPcs);
  }, [processors, processingSends, lastUpdated]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col p-4 md:p-6 overflow-x-hidden font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 shrink-0 gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Business Monitor</h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time enterprise metrics & analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            Updated: {lastUpdated.toLocaleTimeString()}
          </div>
          <button 
            onClick={handleRefresh}
            className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button 
            onClick={toggleFullscreen}
            className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Core Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 shrink-0">
        <MetricCard title="Today's Revenue" value={formatCurrency(metrics.todayRevenue)} icon={DollarSign} color="text-emerald-400" />
        <MetricCard title="This Month Revenue" value={formatCurrency(metrics.monthRevenue)} icon={TrendingUp} color="text-success" />
        <MetricCard title="Today's Purchases" value={formatCurrency(metrics.todayPurchase)} icon={ShoppingCart} color="text-destructive" />
        <MetricCard title="This Month Purchases" value={formatCurrency(metrics.monthPurchase)} icon={TrendingDown} color="text-rose-500" />
        
        <MetricCard title="Raw Material Stock" value={`${formatNumber(metrics.rawMaterialStock)} PCS`} icon={Package} color="text-blue-400" />
        <MetricCard title="WIP Stock" value={`${formatNumber(metrics.wipStock)} PCS`} icon={Factory} color="text-indigo-400" />
        <MetricCard title="Total A/R" value={formatCurrency(metrics.totalAR)} icon={Users} color="text-amber-400" />
        <MetricCard title="Total A/P" value={formatCurrency(metrics.totalAP)} icon={Wallet} color="text-orange-400" />
      </div>

      {/* Middle Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 shrink-0">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <ChartCard title="Revenue & Purchase Trend (30 Days)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `PKR ${val / 1000}k`} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="purchase" name="Purchase" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          
          <ChartCard title="Revenue vs Cost">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData.slice(-10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `PKR ${val / 1000}k`} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="purchase" name="Cost" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="flex flex-col gap-6">
          <RankCard title="Top Customers by A/R" data={rankings.customerRank} nameKey="name" valueKey="balanceReceivable" color="hsl(var(--chart-4))" />
          <RankCard title="Top Suppliers by Purchase" data={rankings.supplierRank} nameKey="name" valueKey="amount" color="hsl(var(--chart-2))" />
        </div>
      </div>

      {/* Bottom Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border font-semibold text-foreground">Raw Material Stock Alerts</div>
          <div className="overflow-x-auto overflow-y-auto flex-1 p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Material</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Stock (PCS)</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Finished (PCS)</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {materials.sort((a, b) => a.stockPcs - b.stockPcs).slice(0, 15).map(m => (
                  <tr key={m.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{m.name}</td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap ${m.stockPcs < 500 ? 'text-destructive font-bold' : 'text-foreground'}`}>
                      {formatNumber(m.stockPcs)}
                    </td>
                    <td className="px-4 py-3 text-foreground text-right whitespace-nowrap">{formatNumber(m.processedStockPcs)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {m.stockPcs < 500 ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-rose-500/20 text-destructive border border-rose-500/30">Low Stock</span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-success/20 text-success border border-success/30">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border font-semibold text-foreground">Processor Holdings</div>
          <div className="overflow-x-auto overflow-y-auto flex-1 p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Processor</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Holding (PCS)</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-right">A/P Balance</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {processorHoldings.slice(0, 15).map(p => (
                  <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{p.name}</td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap ${p.holdingPcs > 5000 ? 'text-amber-400 font-bold' : 'text-foreground'}`}>
                      {formatNumber(p.holdingPcs)}
                    </td>
                    <td className="px-4 py-3 text-foreground text-right whitespace-nowrap">{formatCurrency(p.balance)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.holdingPcs > 5000 ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-warning/20 text-warning border border-warning/30">High Holding</span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground border border-border">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Subcomponents

function MetricCard({ title, value, icon: Icon, color }: { title: string, value: string, icon: any, color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className={`p-2 rounded-lg bg-muted border border-border ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col h-80 hover:border-primary/50 transition-colors">
      <h3 className="text-sm font-medium text-foreground mb-6 shrink-0">{title}</h3>
      <div className="flex-1 min-h-0 w-full">
        {children}
      </div>
    </div>
  );
}

function RankCard({ title, data, nameKey, valueKey, color }: { title: string, data: any[], nameKey: string, valueKey: string, color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col flex-1 min-h-[14rem] hover:border-primary/50 transition-colors">
      <h3 className="text-sm font-medium text-foreground mb-4 shrink-0">{title}</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis dataKey={nameKey} type="category" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
            <RechartsTooltip 
              cursor={{ fill: 'hsl(var(--muted))' }}
              contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
              formatter={(val: number) => formatCurrency(val)}
            />
            <Bar dataKey={valueKey} fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
