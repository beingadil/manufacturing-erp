import { ArrowLeft, ArrowRight, BadgeCheck, Package, PackageCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { lotAverageCost, lotStockForProduct, buildableQty, consumeComponentsForManufacturing } from '../lib/business/ManufacturingService';
import { cn, formatCurrency, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';

/**
 * A single product — everything about it on one page: what it is, what it takes
 * to make it, every production run that ever made it, every FG lot it shipped,
 * and every sale that drew from those lots. The list page answers "what's
 * ready"; this page answers "where has it been".
 */
export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const productId = id ?? '';
  const navigate = useNavigate();
  const { products, materials, categories, finishedGoodsLots, manufacturingOrders, sales, batches, produceForProduct } = useERPStore();

  const [tab, setTab] = useState<'overview' | 'production' | 'lots' | 'sales'>('overview');
  const [produceOpen, setProduceOpen] = useState(false);
  const [produceForm, setProduceForm] = useState({ qty: '', productionCost: '0', date: new Date().toISOString().slice(0, 10), remarks: '' });

  const product = products.find(p => p.id === productId) as any;

  // ── Derived state ──
  const productLots = useMemo(
    () => (finishedGoodsLots || []).filter(l => l.productId === productId),
    [finishedGoodsLots, productId],
  );
  const lots = useMemo(
    () => [...productLots].sort((a, b) => a.date.localeCompare(b.date) || a.lotNo.localeCompare(b.lotNo)),
    [productLots],
  );
  const orderHistory = useMemo(
    () => [...(manufacturingOrders || []).filter(o => o.productId === productId)]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')),
    [manufacturingOrders, productId],
  );
  const productSales = useMemo(
    () => [...(sales || []).filter(s => s.productId === productId)]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.invoiceNo || '').localeCompare(b.invoiceNo || '')),
    [sales, productId],
  );
  const completedOrders = useMemo(() => orderHistory.filter(o => o.status === 'Completed'), [orderHistory]);

  const onHand = lotStockForProduct(finishedGoodsLots || [], productId);
  const readyToMake = product ? buildableQty(product, batches || []).buildable : 0;
  const avgCost = lotAverageCost(finishedGoodsLots || [], productId);
  const stockValue = onHand * avgCost;

  // BOM cost preview for the produce modal (live, dry-run)
  const preview = useMemo(() => {
    if (!product) return { pcs: 0, cost: 0, costPerPiece: 0, feasible: false, shortLines: [] as string[] };
    const pcs = Math.max(0, Math.floor(Number(produceForm.qty) || 0));
    if (pcs === 0) return { pcs: 0, cost: 0, costPerPiece: 0, feasible: false, shortLines: [] as string[] };
    const requirements = (product.components || []).map((c: any) => ({ materialId: c.materialId, pcs: (Number(c.quantity) || 0) * pcs }));
    // Dry run via a consume simulation on a cloned batch array
    const result = consumeComponentsForManufacturing(batches || [], requirements);
    const cost = result.draws.reduce((s: number, d: any) => s + d.cost, 0) + (Number(produceForm.productionCost) || 0);
    const shortLines = (result.shortage ? [String(result.shortage.materialId)] : []);
    return {
      pcs,
      cost,
      costPerPiece: pcs > 0 ? cost / pcs : 0,
      feasible: !result.shortage,
      shortLines,
    };
  }, [product, produceForm.qty, produceForm.productionCost, batches]);

  // ── Sales aggregates ──
  const salesRevenue = productSales.reduce((s, sa: any) => s + (sa.totalAmount || 0), 0);
  const salesCogs = productSales.reduce((s, sa) => s + (sa.cogsAmount || 0), 0);
  const grossProfit = salesRevenue - salesCogs;
  const marginPct = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0;

  const categoryName = (categories || []).find(c => c.id === product?.categoryId)?.name || 'Category';

  if (!product) {
    return (
      <div className="py-24 text-center">
        <Package className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Product not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">This product may have been deleted.</p>
        <Link to="/products" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to products
        </Link>
      </div>
    );
  }

  const produceQtyError = Number(produceForm.qty) > readyToMake
    ? `Only ${formatNumber(readyToMake)} PCS can be produced.`
    : (Number(produceForm.qty) > 0 && !Number.isInteger(Number(produceForm.qty)) ? 'Whole PCS only.' : '');

  const openProduce = () => {
    setProduceForm(f => ({ ...f, qty: String(readyToMake || '') }));
    setProduceOpen(true);
  };

  const handleProduce = (e: React.FormEvent) => {
    e.preventDefault();
    if (produceQtyError) return;
    try {
      const result = produceForProduct({
        productId: product.id,
        finishedQty: Number(produceForm.qty),
        date: produceForm.date,
        productionCost: Number(produceForm.productionCost) || 0,
        remarks: produceForm.remarks.trim() || undefined,
      });
      toast.success(`${product.name}: ${formatNumber(result.finishedQty)} PCS produced — ${result.lotNo || 'lot'} posted.`);
      setProduceOpen(false);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not produce.');
    }
  };

  const components = (product.components || []) as Array<{ materialId: string; quantity: number }>;
  const materialMap = new Map(materials.map((m: any) => [m.id, m]));
  const builtLines = components.map(c => {
    const m: any = materialMap.get(c.materialId);
    return { ...c, materialName: m?.name || 'Unknown', stockPcs: (m?.processedStockPcs || 0) + (m?.remainingPcs || 0), status: m?.status };
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <Link to="/products" className="mt-1 rounded-lg p-2 -ml-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{product.name}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success ring-1 ring-success/20">
              <BadgeCheck className="h-3.5 w-3.5" /> {product.status || 'Active'}
            </span>
            <button onClick={openProduce} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500">
              <PackageCheck className="h-3.5 w-3.5" /> Produce
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{categoryName} · {product.description || 'No description'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>No. {product.code || product.sku || '—'}</span>
            <span aria-hidden="true">·</span>
            <span>BOM v{product.bomVersion ?? 1} · {components.length} line{components.length === 1 ? '' : 's'}</span>
            <span aria-hidden="true">·</span>
            <span>{product.usageType === 'assembled' ? 'assembled' : 'simple'}</span>
          </div>
        </div>
      </div>

      {/* ── Summary strip ── */}
      <section className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
        <div className="min-w-[110px]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">FG on hand</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{formatNumber(onHand)}<span className="ml-1.5 text-sm font-medium text-success/70">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(stockValue)} at cost</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ready to make</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-emerald-500">{formatNumber(readyToMake)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">from parts on hand</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avg cost</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-info">{avgCost > 0 ? formatCurrency(avgCost) : '—'}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">per piece (produced)</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Price</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatCurrency(product.sellingPrice || 0)}</div>
          {avgCost > 0 && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              margin {(((product.sellingPrice - avgCost) / product.sellingPrice) * 100).toFixed(1)}%
            </div>
          )}
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Completed MOs</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(completedOrders.length)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatNumber(completedOrders.reduce((s, o) => s + (o.finishedQty || 0), 0))} PCS made</div>
        </div>
      </section>

      {/* ── Tabs ── */}
      <nav className="flex gap-1 rounded-xl border border-border/60 bg-muted/20 p-1 text-sm font-medium text-muted-foreground" role="tablist" aria-label="Product detail">
        {([['overview', 'Overview'], ['production', 'Production'], ['lots', 'Finished Lots'], ['sales', 'Sales']] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors',
              tab === key ? 'bg-card text-foreground shadow-sm' : 'hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid gap-5 md:grid-cols-5">
          {/* Components */}
          <section className="rounded-2xl border border-border bg-card md:col-span-3">
            <div className="border-b border-border/60 px-5 py-3">
              <h3 className="text-sm font-semibold text-foreground">What it takes</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Component list, with live availability — flips the Produce button on and off.</p>
            </div>
            <div className="p-4">
              {builtLines.length === 0 ? (
                <p className="text-xs text-muted-foreground">No components — legacy or single-material product.</p>
              ) : (
                <ul className="divide-y divide-border/50 text-sm">
                  {builtLines.map((l: any) => {
                    const need = (Number(l.quantity) || 1) * 1; // per unit requirement
                    const canCover = Math.floor((l.stockPcs || 0) / need);
                    const short = canCover === 0;
                    return (
                      <li key={l.materialId} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{l.materialName}</div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{l.usageType || 'material'} · {l.quantity}× per unit</div>
                        </div>
                        <div className={cn('shrink-0 tabular-nums text-sm', short ? 'font-semibold text-destructive' : 'text-foreground', short ? '' : 'font-medium')}>
                          <span className="text-lg font-bold">{formatNumber(l.stockPcs || 0)}</span>
                          <div className={cn('text-[10px]', short ? 'text-destructive/80' : 'text-muted-foreground')}>
                            covers {formatNumber(Math.max(0, canCover))} units
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
          {/* Economics */}
          <section className="rounded-2xl border border-border bg-card md:col-span-2">
            <div className="border-b border-border/60 px-5 py-3">
              <h3 className="text-sm font-semibold text-foreground">The math</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Cost per piece, margin, and what's left to make.</p>
            </div>
            <dl className="divide-y divide-border/50 text-sm">
              {[
                ['Avg cost / PCS', avgCost > 0 ? formatCurrency(avgCost) : '—'],
                ['Selling price', formatCurrency(product.sellingPrice || 0)],
                ['Gross margin', avgCost > 0 ? `${(((product.sellingPrice - avgCost) / (product.sellingPrice || 1)) * 100).toFixed(1)}%` : '—'],
                ['Produced so far', `${formatNumber(completedOrders.reduce((s, o) => s + (o.finishedQty || 0), 0))} PCS`],
                ['In finished lots', `${formatNumber(onHand)} PCS`],
                ['Ready to make now', `${formatNumber(readyToMake)} PCS`],
                ['MOs total', `${formatNumber(orderHistory.length)} (${formatNumber(completedOrders.length)} completed)`],
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-sm font-medium tabular-nums text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}

      {/* ── Production ── */}
      {tab === 'production' && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Manufacturing orders</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Open an order for its component draws, costs and stage trail.</p>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{orderHistory.length} orders</span>
          </div>
          {orderHistory.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-muted-foreground">No production runs yet — Produce one to populate this list.</div>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1.4fr)_100px_110px_100px_90px_40px] gap-2 border-b border-border/60 bg-muted/30 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
                <div>Order</div><div className="text-right">Finished</div><div className="text-right">Cost / pc</div><div className="text-right">Date</div><div className="text-right">Status</div><div />
              </div>
              <ul className="divide-y divide-border/50 text-sm">
                {orderHistory.map(o => (
                  <li key={o.id}>
                    <button
                      onClick={() => navigate(`/products/${product.id}/mo/${o.id}`)}
                      className="grid w-full grid-cols-2 gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 lg:grid-cols-[minmax(0,1.4fr)_100px_110px_100px_90px_40px] lg:items-center lg:gap-2 sm:px-5"
                    >
                      <div className="col-span-2 min-w-0 lg:col-span-1">
                        <div className="font-medium text-foreground">{o.orderNo}</div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">BOM v{product?.bomVersion ?? 1}</div>
                      </div>
                      <div className="text-right tabular-nums text-muted-foreground lg:self-center">{formatNumber(o.finishedQty ?? 0)} PCS</div>
                      <div className="text-right tabular-nums font-medium text-foreground lg:self-center">{o.costPerPiece ? formatCurrency(o.costPerPiece) : '—'}</div>
                      <div className="text-right text-xs text-muted-foreground lg:self-center">{o.date ? new Date(o.date).toLocaleDateString() : '—'}</div>
                      <div className="text-right lg:self-center">
                        <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1', o.status === 'Completed' ? 'bg-success/10 text-success ring-success/20' : 'bg-muted text-muted-foreground ring-border')}>{o.status}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/60 lg:justify-self-end" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ── Lots ── */}
      {tab === 'lots' && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Finished-goods lots</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Every batch of finished stock, oldest first — the FIFO queue the sales consume from.</p>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{lots.length} lots</span>
          </div>
          {lots.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-muted-foreground">No lots yet — Produce one to populate this list.</div>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_110px_100px_120px_90px_40px] gap-2 border-b border-border/60 bg-muted/30 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
                <div>Lot</div><div>Order</div><div className="text-right">Produced</div><div className="text-right">Cost / pc</div><div className="text-right">Value</div><div className="text-right">Status</div><div />
              </div>
              <ul className="divide-y divide-border/50 text-sm">
                {lots.map(l => (
                  <li key={l.id} className="grid grid-cols-2 gap-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_110px_100px_120px_90px_40px] lg:items-center lg:gap-2">
                    <div className="col-span-2 min-w-0 lg:col-span-1">
                      <div className="font-mono text-xs font-semibold text-foreground">{l.lotNo}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{l.date ? new Date(l.date).toLocaleDateString() : ''}</div>
                    </div>
                    <div className="col-span-2 lg:col-span-1 text-xs text-muted-foreground tabular-nums">{(manufacturingOrders || []).find(o => o.lotId === l.id)?.orderNo || 'MO'}</div>
                    <div className="text-right tabular-nums text-muted-foreground lg:self-center">{formatNumber(l.pcsProduced)} PCS</div>
                    <div className="text-right tabular-nums text-foreground lg:self-center">{formatCurrency(l.costPerPiece || 0)}</div>
                    <div className="text-right tabular-nums text-muted-foreground lg:self-center">{formatCurrency(l.totalCost || 0)}</div>
                    <div className="text-right lg:self-center">
                      <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1', l.status === 'Active' ? 'bg-success/10 text-success ring-success/20' : 'bg-muted text-muted-foreground ring-border')}>{l.status}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/60 lg:justify-self-end" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ── Sales ── */}
      {tab === 'sales' && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Sales of {product.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Where the finished stock actually goes — and what it earns.</p>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{productSales.length} sales</span>
          </div>
          {productSales.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-muted-foreground">Not sold yet — the first sale will appear here.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-border/60 bg-muted/20 px-5 py-4 sm:grid-cols-4">
                {[
                  ['Revenue', formatCurrency(salesRevenue)],
                  ['COGS', formatCurrency(salesCogs)],
                  ['Gross profit', formatCurrency(grossProfit)],
                  ['Margin', `${marginPct.toFixed(1)}%`],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-foreground">{v}</div>
                  </div>
                ))}
              </div>
              <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_110px_100px_120px_110px_120px] gap-2 border-b border-border/60 bg-muted/30 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
                <div>Invoice</div><div>Customer</div><div className="text-right">Pcs</div><div className="text-right">Price</div><div className="text-right">Revenue</div><div className="text-right">COGS</div><div className="text-right">Margin</div>
              </div>
              <ul className="divide-y divide-border/50 text-sm">
                {productSales.map((sa: any) => {
                  const gp = (sa.grossProfit ?? (sa.totalAmount - (sa.cogsAmount || 0)));
                  const margin = sa.totalAmount > 0 ? (gp / sa.totalAmount) * 100 : 0;
                  return (
                    <li key={sa.id} className="grid grid-cols-2 gap-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_110px_100px_120px_110px_120px] lg:items-center lg:gap-2">
                      <div className="col-span-2 min-w-0 lg:col-span-1">
                        <div className="font-mono text-xs font-semibold text-foreground">{sa.invoiceNo}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(sa.date).toLocaleDateString()}</div>
                      </div>
                      <div className="col-span-2 lg:col-span-1 text-xs text-muted-foreground tabular-nums">CUST</div>
                      <div className="text-right tabular-nums text-muted-foreground lg:self-center">{formatNumber(sa.pcsSold)} PCS</div>
                      <div className="text-right tabular-nums text-foreground lg:self-center">{formatCurrency(sa.pricePerPiece)}</div>
                      <div className="text-right tabular-nums font-medium text-foreground lg:self-center">{formatCurrency(sa.totalAmount)}</div>
                      <div className="text-right tabular-nums text-muted-foreground lg:self-center">{formatCurrency(sa.cogsAmount || 0)}</div>
                      <div className="text-right tabular-nums lg:self-center">
                        <span className={cn('font-semibold', gp >= 0 ? 'text-success' : 'text-destructive')}>{gp >= 0 ? '+' : ''}{formatCurrency(gp)}</span>
                        <div className="text-[10px] text-muted-foreground">{margin.toFixed(0)}%</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ── Produce modal ── */}
      {produceOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
            <div className="border-b border-border/60 px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">Produce {product.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(readyToMake)} PCS ready to make · live cost preview below</p>
            </div>
            <form onSubmit={handleProduce} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="qty" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pcs to produce</label>
                  <input id="qty" type="number" min={1} max={readyToMake} value={produceForm.qty} onChange={e => setProduceForm(f => ({ ...f, qty: e.target.value }))} autoFocus required className="w-full rounded-xl border border-border bg-background px-3 py-3 text-lg font-semibold tabular-nums outline-none focus:border-primary" />
                  {produceQtyError && <p className="mt-1 text-[10px] font-medium text-destructive">{produceQtyError}</p>}
                </div>
                <div>
                  <label htmlFor="productionCost" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conversion cost</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Rs</span>
                    <input id="productionCost" type="number" min={0} step="0.01" value={produceForm.productionCost} onChange={e => setProduceForm(f => ({ ...f, productionCost: e.target.value }))} className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-3 text-lg font-semibold tabular-nums outline-none focus:border-primary" />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="date" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</label>
                  <input id="date" type="date" value={produceForm.date} onChange={e => setProduceForm(f => ({ ...f, date: e.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm tabular-nums outline-none focus:border-primary" />
                </div>
                <div>
                  <label htmlFor="remarks" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remarks <span className="font-normal normal-case text-muted-foreground/60">(optional)</span></label>
                  <input id="remarks" type="text" value={produceForm.remarks} onChange={e => setProduceForm(f => ({ ...f, remarks: e.target.value }))} placeholder="optional note" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary" />
                </div>
              </div>
              {/* Live cost breakdown */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-xs">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost preview (live)</div>
                <div className="mt-2 flex justify-between tabular-nums"><span className="text-muted-foreground">Components drawn</span><span>{preview.pcs > 0 ? `${formatNumber(preview.pcs)} PCS` : '—'}</span></div>
                <div className="mt-1 flex justify-between tabular-nums"><span className="text-muted-foreground">Conversion cost</span><span>{formatCurrency(Number(produceForm.productionCost) || 0)}</span></div>
                <div className="mt-1 flex justify-between tabular-nums"><span className="text-muted-foreground">Total cost</span><span>{preview.pcs > 0 ? formatCurrency(preview.cost) : '—'}</span></div>
                <div className="mt-1 flex justify-between font-semibold tabular-nums"><span className="text-foreground">Cost per PCS</span><span className="text-foreground">{preview.pcs > 0 ? formatCurrency(preview.costPerPiece) : '—'}</span></div>
                {preview.shortLines.length > 0 && (
                  <p className="mt-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-[10px] font-medium text-destructive">Parts are short for this quantity.</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setProduceOpen(false)} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="submit" disabled={!!produceQtyError || !preview.feasible} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">Produce {produceForm.qty ? formatNumber(Number(produceForm.qty)) : ''} PCS</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
