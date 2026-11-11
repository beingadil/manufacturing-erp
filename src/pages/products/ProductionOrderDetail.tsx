import { ArrowLeft, CheckCircle2, Layers } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cn, formatCurrency, formatNumber } from '../../lib/utils';
import { useERPStore } from '../../store/useERPStore';
import type { ManufacturingOrderComponent } from '../../types/erp';

/**
 * A single manufacturing order — the most granular artifact in the chain.
 * Mirrors the material-detail pattern: header (order number, status), summary strip,
 * then the BOM draw and the lot produced. Nothing leaves this page.
 */
export default function ProductionOrderDetail() {
  const { id: productId, moId } = useParams<{ id: string; moId: string }>();
  const { manufacturingOrders, products, finishedGoodsLots, sales, materials } = useERPStore();

  const mo = (manufacturingOrders || []).find(o => o.id === moId) as any;
  const product = products.find(p => p.id === productId) as any;

  const lot = mo ? (finishedGoodsLots || []).find(l => l.id === mo.lotId) as any : null;
  const orderSales = lot
    ? (sales || []).filter(s => (s.lotAllocations || []).some((a: any) => a.lotId === lot.id))
    : [];

  // Component cost rollup — reconstruct from MOs snapshot if missing, else from consumptions
  const componentCosts: Array<{ materialId: string; quantity: number; cost: number; costPerPiece: number }> = useMemo(() => {
    if (!mo) return [];
    if (Array.isArray(mo.componentCosts) && mo.componentCosts.length > 0) {
      const map: Record<string, { materialId: string; cost: number; costPerPiece: number; pcs: number }> = {};
      for (const line of mo.componentCosts as Array<{ materialId: string; pcs: number; cost: number }>) {
        if (!map[line.materialId]) map[line.materialId] = { materialId: line.materialId, cost: 0, costPerPiece: 0, pcs: 0 };
        map[line.materialId].cost += line.cost;
        map[line.materialId].pcs += line.pcs;
      }
      const components: ManufacturingOrderComponent[] = Array.isArray(mo.components) ? mo.components : [];
      return Object.values(map).map(l => ({
        materialId: l.materialId,
        quantity: components.find(c => c.materialId === l.materialId)?.plannedQuantity || l.pcs,
        cost: l.cost,
        costPerPiece: l.costPerPiece || (l.cost / Math.max(1, l.pcs)),
      }));
    }
    const materialName = new Map((materials || []).map((m: any) => [m.id, m.name]));
    const nameCache = new Map<string, string>();
    return (mo.components as ManufacturingOrderComponent[] || []).map(c => ({
      materialId: c.materialId,
      quantity: c.plannedQuantity,
      cost: 0,
      costPerPiece: 0,
    })).map(line => ({
      ...line,
      name: nameCache.get(line.materialId) || materialName.get(line.materialId) || 'Material',
    })).map((line: any) => ({
      materialId: line.materialId,
      quantity: line.quantity,
      cost: 0,
      // Nothing persisted — show planned-only; live draws recorded at completion cover the gap.
      costPerPiece: 0,
    }));
  }, [mo, materials]);

  // Ledger — movements touch inventory (IN/OUT) + loss events
  const { totalMaterialCost, totalConversionCost, totalCost, costPerPiece, drawingsArea } = useMemo(() => {
    if (!mo) return { totalMaterialCost: 0, totalConversionCost: 0, totalCost: 0, costPerPiece: 0, drawingsArea: 0 };
    const material = mo.materialCost || 0;
    const conversion = mo.productionCost || 0;
    const total = mo.totalCost || material + conversion;
    const done = mo.finishedQty || 0;
    return {
      totalMaterialCost: material,
      totalConversionCost: conversion,
      totalCost: total,
      costPerPiece: done > 0 ? total / done : 0,
      drawingsArea: done > 0 && (mo.components?.length || 0) > 0 ? (mo.components?.length || 0) * done : 0,
    };
  }, [mo]);

  if (!mo) {
    return (
      <div className="py-24 text-center">
        <Layers className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Manufacturing order not found</h2>
        <Link to={productId ? `/products/${productId}` : '/products'} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>
    );
  }

  const usedM = new Map((materials || []).map((m: any) => [m.id, m]));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <Link to={productId ? `/products/${productId}` : '/products'} className="mt-1 rounded-lg p-2 -ml-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{mo.orderNo}</h2>
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1',
              mo.status === 'Completed'
                ? 'bg-success/10 text-success ring-success/20'
                : mo.status === 'In Progress'
                ? 'bg-info/10 text-info ring-info/20'
                : 'bg-muted text-muted-foreground ring-border',
            )}>{mo.status}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{product?.name || 'Unknown product'} · {mo.date ? new Date(mo.date).toLocaleDateString() : 'No date'} · BOM v{mo.bomVersion ?? product?.bomVersion ?? 1}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>No. {mo.orderNo}</span>
            <span aria-hidden="true">·</span>
            <span>{mo.status === 'Completed' ? 'Completed' : mo.status}</span>
            {mo.completedAt && <><span aria-hidden="true">·</span><span>stamped {new Date(mo.completedAt).toLocaleDateString()}</span></>}
          </div>
        </div>
      </div>

      {/* ── Summary strip ── */}
      <section className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
        <div className="min-w-[110px]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Planned</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(mo.plannedQty)}<span className="ml-1.5 text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">planned production</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Finished</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{formatNumber(mo.finishedQty || 0)}<span className="ml-1.5 text-sm font-medium text-success/70">PCS</span></div>
          {mo.status === 'Completed' && (
            <div className="mt-0.5 text-xs text-muted-foreground">{((((mo.finishedQty || 0) - mo.plannedQty) / mo.plannedQty) * 100).toFixed(1)}% vs plan</div>
          )}
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Material cost</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-info">{formatCurrency(totalMaterialCost)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatNumber(drawingsArea)} drawing-events</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Conversion cost</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatCurrency(totalConversionCost)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">labor + overhead for this run</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cost / PCS</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{costPerPiece > 0 ? formatCurrency(costPerPiece) : '—'}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(totalCost)} total</div>
        </div>
      </section>

      {/* ── Components table ── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">What this order drew</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Per-line cost rollup — the BOM frozen at order creation.</p>
        </div>
        {(mo.components?.length ?? 0) === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-muted-foreground">This order has no component breakdown (legacy BOM format).</div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.6fr)_120px_120px_140px_120px] gap-2 border-b border-border/60 bg-muted/30 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
              <div>Material</div><div className="text-right">Qty / pc</div><div className="text-right">Draw qty</div><div className="text-right">Cost</div><div className="text-right">Cost / pc</div>
            </div>
            <ul className="divide-y divide-border/50 text-sm">
              {(mo.components as ManufacturingOrderComponent[]).map((c, i) => {
                const m = usedM.get(c.materialId);
                const lineCost = componentCosts.find(l => l.materialId === c.materialId);
                const draw = (lineCost?.cost ?? 0) || 0;
                const perPiece = lineCost?.costPerPiece ?? 0;
                return (
                  <li key={c.materialId} className="grid grid-cols-2 gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.6fr)_120px_120px_140px_120px] lg:items-center lg:gap-2">
                    <div className="col-span-2 min-w-0 lg:col-span-1">
                      <div className="truncate font-medium text-foreground">{m?.name || 'Unknown material'}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{m?.processingPath ?? 'full_chain'} · {m?.status || 'Active'}</div>
                    </div>
                    <div className="text-right tabular-nums text-muted-foreground lg:self-center">{formatNumber(c.plannedQuantity || 0)}</div>
                    <div className="text-right tabular-nums font-medium text-foreground lg:self-center">{formatNumber(Math.round(c.plannedQuantity || 0))}</div>
                    <div className="text-right tabular-nums text-muted-foreground lg:self-center">{draw > 0 ? formatCurrency(draw) : '—'}</div>
                    <div className="text-right tabular-nums text-foreground lg:self-center">{perPiece > 0 ? formatCurrency(perPiece) : '—'}</div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-5 py-3 text-xs">
              <div className="text-muted-foreground">{componentCosts.length > 0
                ? 'Costs are locked at the moment of completion'
                : 'Costs derived from persisted draws — totals are authoritative'}</div>
              <div className="flex items-center gap-4 tabular-nums">
                <span>Material: <strong className="text-foreground">{formatCurrency(totalMaterialCost)}</strong></span>
                <span>Conversion: <strong className="text-foreground">{formatCurrency(totalConversionCost)}</strong></span>
                <span>Total: <strong className="text-foreground">{formatCurrency(totalCost)}</strong></span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Lot produced ── */}
      {lot && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Lot born of this order</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">The finished-goods lot this MO produced — the FIFO pass the sales draw from.</p>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            {[
              ['Lot', lot.lotNo],
              ['Produced', `${formatNumber(lot.pcsProduced)} PCS`],
              ['Remaining', `${formatNumber(lot.pcsRemaining)} PCS`],
              ['Cost / pc', formatCurrency(lot.costPerPiece)],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">{v as string}</div>
              </div>
            ))}
          </div>
          {orderSales.length > 0 && (
            <div className="border-t border-border/60 px-5 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sales drawing from this lot</div>
              <ul className="mt-2 space-y-1.5">
                {orderSales.map((s: any) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 text-xs">
                    <Link to="/sales" className="font-mono text-primary hover:underline">{s.invoiceNo}</Link>
                    <span className="tabular-nums text-muted-foreground">{formatNumber(s.pcsSold)} PCS · {formatCurrency(s.totalAmount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Voucher-like banner for Completed MOs — nothing to act on, just provenance ── */}
      {(mo.status === 'Completed' || mo.status === 'In Progress') && (
        <section className="flex items-start gap-4 rounded-2xl border border-border/60 bg-muted/20 px-5 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Completion posted to inventory and the ledger: components debited against the lot's cost,
            finished goods credited, conversion cost expensed. This page is read-only — the posting is immutable.
          </p>
        </section>
      )}
    </div>
  );
}
