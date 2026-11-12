import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Factory,
  FileText,
  Maximize,
  Minimize,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DatePicker } from '../components/ui/date-picker';
import { cn, formatCurrency, formatNumber } from '../lib/utils';
import {
  parseRange,
  rangeToParams,
  inRange,
  type MonitorRangeId,
} from '../lib/monitor/monitorRange';
import {
  deltaFraction,
  purchaseTotal,
  saleTotal,
  seriesForRange,
  sumInRange,
} from '../lib/monitor/monitorMetrics';
import { useERPStore } from '../store/useERPStore';

const PRESETS: Array<{ id: MonitorRangeId; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'mtd', label: 'MTD' },
];

export function MonitorScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const range = useMemo(() => parseRange(searchParams), [searchParams]);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const {
    sales, purchases, materials, customers, suppliers, processors,
    processingSends, processingReceipts, products, vouchers, journalEntries,
  } = useERPStore();

  const updateRange = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    if (patch.range && patch.range !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  // ── Fullscreen sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  // ── KPIs for the selected range ─────────────────────────────────────────────
  const revenue = sumInRange(sales, saleTotal, range.from, range.to);
  const revenuePrior = sumInRange(sales, saleTotal, range.prior.from, range.prior.to);
  const purchaseAmt = sumInRange(purchases, purchaseTotal, range.from, range.to);
  const purchasePrior = sumInRange(purchases, purchaseTotal, range.prior.from, range.prior.to);

  const rawPcs = useMemo(() => materials.reduce((s, m) => s + (m.stockPcs || 0), 0), [materials]);
  const wipPcs = useMemo(() => materials.reduce((s, m) => s + (m.atProcessorPcs || 0), 0), [materials]);
  const totalAR = useMemo(() => customers.reduce((s, c) => s + (c.balanceReceivable || 0), 0), [customers]);
  const totalAP = useMemo(
    () => suppliers.reduce((s, p) => s + (p.balancePayable || 0), 0) + processors.reduce((s, p) => s + (p.balancePayable || 0), 0),
    [suppliers, processors],
  );
  const apParties = useMemo(() => suppliers.filter(s => (s.balancePayable || 0) > 0).length + processors.filter(p => (p.balancePayable || 0) > 0).length, [suppliers, processors]);
  const arParties = useMemo(() => customers.filter(c => (c.balanceReceivable || 0) > 0).length, [customers]);

  const series = useMemo(() => seriesForRange(sales, purchases, range), [sales, purchases, range]);

  // ── Top lists ───────────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number }>();
    for (const s of sales.filter(s => inRange(s.date, range.from, range.to))) {
      const name = products.find(p => p.id === s.productId)?.name ?? 'Unknown';
      const e = map.get(s.productId) ?? { name, revenue: 0 };
      e.revenue += s.totalAmount || 0;
      map.set(s.productId, e);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [sales, products, range.from, range.to]);

  const topCustomers = useMemo(
    () => [...customers].filter(c => (c.balanceReceivable || 0) > 0).sort((a, b) => (b.balanceReceivable || 0) - (a.balanceReceivable || 0)).slice(0, 5),
    [customers],
  );

  const topSuppliers = useMemo(() => {
    const map = new Map<string, { name: string; amount: number }>();
    for (const p of purchases.filter(p => inRange(p.date, range.from, range.to))) {
      const name = suppliers.find(s => s.id === p.supplierId)?.name ?? 'Unknown';
      const e = map.get(p.supplierId) ?? { name, amount: 0 };
      e.amount += purchaseTotal(p);
      map.set(p.supplierId, e);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [purchases, suppliers, range.from, range.to]);

  const holdingProcessors = useMemo(() => processors.map(p => {
    const mine = processingSends.filter(s => s.processorId === p.id);
    const sent = mine.reduce((sum, s) => sum + (s.pcsSent || 0), 0);
    const recv = mine.reduce((sum, s) => sum + (s.pcsReceived || 0), 0);
    const loss = mine.reduce((sum, s) => sum + (s.lossQuantity || 0), 0);
    return { id: p.id, name: p.name, holding: Math.max(0, sent - recv - loss), balance: p.balancePayable || 0 };
  }).sort((a, b) => b.holding - a.holding).slice(0, 8),
  [processors, processingSends]);

  // ── Alert strip ─────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const lowStock = materials.filter(m => (m.minStockLevel ?? 0) > 0 && (m.stockPcs ?? 0) < (m.minStockLevel ?? 0)).length;
    const pendingPcs = processingSends.reduce((sum, s) => sum + Math.max(0, (s.pcsSent || 0) - (s.pcsReceived || 0) - (s.lossQuantity || 0)), 0);
    const unbilled = processingReceipts.filter(r => (r.billedStatus ?? 'Unbilled') === 'Unbilled' && (r.pcsReceived || 0) > 0).length;
    const out: Array<{ label: string; detail: string; to: string; tone: 'warning' | 'destructive' | 'info' }> = [];
    if (lowStock > 0) out.push({ label: `${lowStock} below min stock`, detail: 'Replenish raw materials', to: '/monitor/stock', tone: 'destructive' });
    if (pendingPcs > 0) out.push({ label: `${formatNumber(pendingPcs)} PCS pending`, detail: 'Out at processors — chase receipts', to: '/monitor/wip', tone: 'warning' });
    if (totalAR > 0) out.push({ label: `${formatCurrency(totalAR)} receivable`, detail: `${arParties} customers with balance`, to: '/monitor/ar', tone: 'info' });
    if (totalAP > 0) out.push({ label: `${formatCurrency(totalAP)} payable`, detail: `${apParties} parties`, to: '/monitor/ap', tone: 'warning' });
    if (unbilled > 0) out.push({ label: `${unbilled} unbilled receipt${unbilled === 1 ? '' : 's'}`, detail: 'Generate processor bills', to: '/processing/generate-bill', tone: 'info' });
    return out;
  }, [materials, processingSends, processingReceipts, totalAR, totalAP, arParties, apParties]);

  // ── Posting feed (latest posted vouchers in range) ───────────────────────────
  const feed = useMemo(() => {
    return vouchers
      .filter(v => v.status === 'Posted' && inRange(v.date, range.from, range.to))
      .sort((a, b) => b.date.localeCompare(a.date) || b.voucherNo.localeCompare(a.voucherNo))
      .slice(0, 12)
      .map(v => ({
        id: v.id,
        date: v.date,
        no: v.voucherNo,
        module: v.sourceModule,
        type: v.type,
        amount: journalEntries.filter(je => je.voucherId === v.id).reduce((s, je) => s + (je.debit || 0), 0),
      }));
  }, [vouchers, journalEntries, range.from, range.to]);

  const chip = (id: MonitorRangeId, label: string) => {
    const active = range.id === id;
    return (
      <button
        key={id}
        onClick={() => updateRange({ range: id })}
        aria-pressed={active}
        className={cn(
          'h-9 rounded-lg border px-3 text-xs font-semibold transition-colors',
          active
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {label}
      </button>
    );
  };

  const cardHref = (slug: string) => `/monitor/${slug}?${rangeToParams(range)}`;

  const KPI_CARDS: Array<{
    slug: string;
    label: string;
    value: string;
    caption: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: 'foreground' | 'success' | 'destructive' | 'warning';
    delta?: number | null;
  }> = [
    { slug: 'revenue', label: `Revenue · ${range.label}`, value: formatCurrency(revenue), caption: `${formatNumber(sales.filter(s => inRange(s.date, range.from, range.to)).length)} sales`, icon: TrendingUp, tone: 'success', delta: deltaFraction(revenue, revenuePrior) },
    { slug: 'purchases', label: `Purchases · ${range.label}`, value: formatCurrency(purchaseAmt), caption: `${formatNumber(purchases.filter(p => inRange(p.date, range.from, range.to)).length)} purchases`, icon: ShoppingCart, tone: 'destructive', delta: deltaFraction(purchaseAmt, purchasePrior) },
    { slug: 'stock', label: 'Raw stock', value: `${formatNumber(rawPcs)} PCS`, caption: 'Raw material on hand', icon: Package },
    { slug: 'wip', label: 'WIP', value: `${formatNumber(wipPcs)} PCS`, caption: 'Out at processors + waiting', icon: Factory, tone: 'warning' },
    { slug: 'ar', label: 'Accounts receivable', value: formatCurrency(totalAR), caption: `${arParties} customers with balance`, icon: Users, tone: 'warning' },
    { slug: 'ap', label: 'Accounts payable', value: formatCurrency(totalAP), caption: `${apParties} parties with balance`, icon: Wallet, tone: 'warning' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col p-4 md:p-6 overflow-x-hidden font-sans">
      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Business Monitor</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Operations floor — live posting, stock and cash position</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-xs tabular-nums text-muted-foreground">Updated {lastUpdated.toLocaleTimeString()}</span>
          <button onClick={() => setLastUpdated(new Date())} className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={toggleFullscreen} className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" aria-label="Toggle fullscreen">
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ── Date range ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
        <div role="group" aria-label="Date range presets" className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map(p => chip(p.id, p.label))}
        </div>
        <div className="flex items-center gap-2">
          <DatePicker size="sm" className="w-40" value={range.from} onChange={(v) => updateRange({ range: 'custom', from: v, to: range.to })} placeholder="From" />
          <span className="text-xs text-muted-foreground">to</span>
          <DatePicker size="sm" className="w-40" value={range.to} onChange={(v) => updateRange({ range: 'custom', from: range.from, to: v })} placeholder="To" />
        </div>
        <span className="hidden lg:inline text-xs text-muted-foreground ml-1">
          {range.days} day{range.days === 1 ? '' : 's'} · vs {range.prior.from} → {range.prior.to}
        </span>
      </div>

      {/* ── Action alert strip ── */}
      {alerts.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
          {alerts.map((a, i) => (
            <button
              key={i}
              onClick={() => navigate(a.to)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                a.tone === 'destructive' && 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
                a.tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/20',
                a.tone === 'info' && 'border-info/30 bg-info/10 text-info hover:bg-info/20',
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {a.label}
              <span className="font-normal opacity-80">· {a.detail}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── KPI grid (clickable) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4 mb-6 shrink-0">
        {KPI_CARDS.map(card => (
          <button
            key={card.slug}
            onClick={() => navigate(cardHref(card.slug))}
            aria-label={`Open ${card.label} details`}
            className="group rounded-xl border border-border bg-card p-4 md:p-5 flex flex-col justify-between text-left hover:border-primary/40 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
              <card.icon className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
            </div>
            <div>
              <div className={cn('text-lg md:text-2xl font-bold tracking-tight tabular-nums', card.tone === 'success' ? 'text-success' : card.tone === 'destructive' ? 'text-destructive' : card.tone === 'warning' ? 'text-warning' : 'text-foreground')}>
                {card.value}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] md:text-[11px] text-muted-foreground">
                {card.delta !== undefined && card.delta !== null && (
                  <span className={cn('tabular-nums font-semibold', card.delta >= 0 ? 'text-success' : 'text-destructive')}>
                    {card.delta >= 0 ? '+' : ''}{Math.round(card.delta * 100)}%
                  </span>
                )}
                <span className="truncate">{card.caption}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Chart + posting feed ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6 shrink-0">
        <section className="xl:col-span-2 rounded-xl border border-border bg-card p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-medium text-foreground">Revenue vs Purchases · {range.label}</h2>
            <span className="text-[10px] text-muted-foreground">Per {range.granularity}</span>
          </div>
          <div className="h-64 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} width={40} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(v, name) => [formatCurrency(Number(v ?? 0)), name === 'revenue' ? 'Revenue' : 'Purchases']}
                />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="purchase" name="Purchases" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-foreground"><FileText className="h-4 w-4" /> Posting activity</h2>
            <button onClick={() => navigate(`/monitor/activity?${rangeToParams(range)}`)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <ul className="divide-y divide-border/50 max-h-72 overflow-y-auto scroll-thin">
            {feed.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-muted-foreground">No vouchers posted in this range.</li>
            ) : feed.map(f => (
              <li key={f.id}>
                <button onClick={() => navigate(`/monitor/activity?${rangeToParams(range)}`)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors">
                  <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-16 justify-center shrink-0">{f.module}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] font-semibold text-foreground">{f.no}</span>
                    <span className="block text-[10px] text-muted-foreground">{new Date(f.date).toLocaleDateString()} · {f.type}</span>
                  </span>
                  <span className="tabular-nums text-xs font-medium text-foreground">{formatCurrency(f.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ── Top lists + processors ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 flex-1 min-h-0">
        {/* Products by revenue */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">Products by revenue</h2>
            <button onClick={() => navigate(`/monitor/rankings?${rangeToParams(range)}`)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <ol className="divide-y divide-border/50">
            {topProducts.length === 0 ? <li className="px-4 py-8 text-center text-xs text-muted-foreground">No sales in this range.</li>
              : topProducts.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-6 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</span>
                  <span className="tabular-nums text-sm font-semibold text-success">{formatCurrency(p.revenue)}</span>
                </li>
              ))}
          </ol>
        </section>

        {/* Customers by A/R + Suppliers by purchase */}
        <section className="rounded-xl border border-border bg-card flex flex-col">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">Parties</h2>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">A/R · Purchases</span>
          </div>
          <div className="divide-y divide-border/50 flex-1">
            <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">A/R</div>
            {topCustomers.length === 0 ? <p className="px-4 py-3 text-xs text-muted-foreground">Nothing outstanding.</p>
              : topCustomers.map(c => (
                <button key={c.id} onClick={() => navigate(`/ledgers?id=${c.id}`)} className="flex w-full items-center gap-3 px-4 py-2 hover:bg-muted/40 text-left transition-colors">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.name}</span>
                  <span className="tabular-nums text-sm font-semibold text-destructive">{formatCurrency(c.balanceReceivable || 0)}</span>
                </button>
              ))}
            <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border/50">Suppliers · purchased</div>
            {topSuppliers.length === 0 ? <p className="px-4 py-3 text-xs text-muted-foreground">No purchases in this range.</p>
              : topSuppliers.map(s => (
                <div key={s.name} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.name}</span>
                  <span className="tabular-nums text-sm font-semibold text-foreground">{formatCurrency(s.amount)}</span>
                </div>
              ))}
          </div>
        </section>

        {/* Processors holding your stock */}
        <section className="rounded-xl border border-border bg-card flex flex-col min-h-0">
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">Processors holding stock</h2>
            <button onClick={() => navigate(`/monitor/wip?${rangeToParams(range)}`)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="overflow-y-auto scroll-thin flex-1 max-h-80">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Processor</th>
                  <th className="px-4 py-2 text-right font-medium">Holding</th>
                  <th className="px-4 py-2 text-right font-medium">A/P</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {holdingProcessors.map(p => (
                  <tr key={p.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => navigate('/monitor/wip')}>
                    <td className="px-4 py-2 font-medium text-foreground">{p.name}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums', p.holding > 5000 ? 'text-warning font-semibold' : 'text-foreground')}>{formatNumber(p.holding)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(p.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
