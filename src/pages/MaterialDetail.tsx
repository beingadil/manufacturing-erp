import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUp,
  Clock,
  Package,
  PackageCheck,
  ShoppingCart,
  Truck,
  Users,
  Pencil,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BatchRegister, batchPathLabel } from '../components/materials/BatchRegister';
import { Dropdown } from '../components/Dropdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { FormFooter } from '../components/form/FormFooter';
import { FormModal } from '../components/form/FormModal';
import { MaterialForm } from '../components/forms/MaterialForm';
import { InventoryCalculationService, stageAvailableEntries } from '../lib/business/InventoryCalculationService';
import { materialCostSummary } from '../lib/processing/batchCosts';
import { getMaterialBatchProgress, getSortedStages } from '../lib/processing/stageProgress';
import { cn, formatCurrency, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';

export function MaterialDetail() {
  const [editOpen, setEditOpen] = useState(false);
  const { id } = useParams<{ id: string }>();
  const {
    materials, categories, batches, processingSends, purchases,
    products, sales, inventoryMovements,
    suppliers, processors, processingStages, customers, processingReceipts,
  } = useERPStore();

  const [movementModuleFilter, setMovementModuleFilter] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<'' | 'IN' | 'OUT'>('');
  const [movementQuery, setMovementQuery] = useState('');
  const [movementVisible, setMovementVisible] = useState(200);
  const [activeTab, setActiveTab] = useState('batches');

  const material = materials.find(m => m.id === id);
  const category = categories.find(c => c.id === material?.categoryId);
  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);

  const materialBatches = useMemo(() => {
    return (batches || []).filter(b => b.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [batches, id]);

  const materialMovements = useMemo(() => {
    return (inventoryMovements || []).filter(m => m.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inventoryMovements, id]);

  const materialSends = useMemo(() => {
    return processingSends.filter(s => s.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [processingSends, id]);

  const materialProducts = useMemo(() => {
    return products.filter(p => p.materialId === id);
  }, [products, id]);

  const productIds = materialProducts.map(p => p.id);

  const materialSales = useMemo(() => {
    return sales.filter(s => productIds.includes(s.productId)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, productIds.join('|')]);

  // Purchase summary (headline)
  const purchaseSummary = useMemo(() => ({
    pcs: materialBatches.reduce((s, b) => s + (b.initialPcs || 0), 0),
    amount: materialBatches.reduce((s, b) => s + (b.amount || 0), 0),
    lots: materialBatches.length,
    suppliers: new Set(materialBatches.map(b => b.supplierId).filter(Boolean)).size,
  }), [materialBatches]);

  // Per-stage chain breakdown (every stage that this material moves through)
  const chainRows = useMemo(() => {
    const rows: Array<{
      stage: typeof sortedStages[number];
      sent: number;
      returned: number;
      losses: number;
      holding: number;
      dispatchCount: number;
      available: number;
    }> = [];
    const stagePcsAvailable = new Map<string, number>();
    for (const b of materialBatches) {
      for (const e of stageAvailableEntries(b)) {
        stagePcsAvailable.set(e.stageId, (stagePcsAvailable.get(e.stageId) || 0) + e.pcs);
      }
    }
    for (const stage of sortedStages) {
      const stageSends = materialSends.filter(s => s.stageId === stage.id);
      const sent = stageSends.reduce((s, x) => s + (x.pcsSent || 0), 0);
      const returned = stageSends.reduce((s, x) => s + (x.pcsReceived || 0), 0);
      const losses = stageSends.reduce((s, x) => s + (x.lossQuantity || 0), 0);
      const holding = Math.max(0, sent - returned - losses);
      const dispatchCount = stageSends.length;
      const available = stagePcsAvailable.get(stage.id) || 0;
      // Only show rows relevant to this material's path
      const pathOk = (
        (material?.processingPath === 'ready_made' && stage.sequence === 1) ||
        (material?.processingPath === 'single_stage' && stage.id === material?.fixedStageId) ||
        (material?.processingPath === 'custom_stages' && (material?.allowedStageIds || []).includes(stage.id)) ||
        !material?.processingPath || material.processingPath === 'full_chain'
      );
      if (!pathOk && sent === 0 && available === 0) continue;
      rows.push({ stage, sent, returned, losses, holding, dispatchCount, available });
    }
    return rows;
  }, [sortedStages, materialSends, materialBatches, material]);

  // ── Derived quantities (single source: batches + history) ─────────────────
  const stageValues = useMemo(
    () => (material ? InventoryCalculationService.getMaterialStageValues(material.id, batches || []) : null),
    [material, batches]
  );

  const materialCost = useMemo(() => {
    if (!material || materialBatches.length === 0) return null;
    return materialCostSummary(materialBatches, processingSends, processingStages, processingReceipts);
  }, [materialBatches, processingSends, processingStages, processingReceipts]);

  const batchProgress = useMemo(
    () => (material ? getMaterialBatchProgress(material.id, batches || [], sortedStages) : []),
    [material, batches, sortedStages]
  );

  // Stage-position roll-up: where the material's pcs physically sit right now.
  const positions = useMemo(() => {
    const pos = {
      raw: 0, inTransit: 0, available: 0, finished: 0,
      availableFromStage: null as string | null,
    };
    for (const p of batchProgress) {
      pos.raw += p.rawPcs;
      pos.inTransit += p.inTransitPcs;
      pos.available += p.availablePcs;
      pos.finished += p.finishedPcs;
    }
    const srcNames = new Set<string>();
    for (const p of batchProgress) {
      for (const e of stageAvailableEntries(p.batch)) {
        if (e.pcs <= 0) continue;
        const src = sortedStages.find(s => s.id === e.stageId);
        if (src) srcNames.add(src.name);
      }
    }
    if (srcNames.size > 0) pos.availableFromStage = [...srcNames].join(' + ');
    return pos;
  }, [batchProgress, sortedStages]);

  // Per-stage WIP from the movement history (same basis as the dashboard).
  const stageWip = useMemo(() => sortedStages
    .filter(s => !s.isFinalStage)
    .map(stage => ({
      stage,
      pcs: InventoryCalculationService.getStageWIP(stage.id, processingSends || [], processingReceipts || [], id),
    })), [sortedStages, processingSends, processingReceipts, id]);

  const cogsBySaleId = useMemo(
    () => (material ? InventoryCalculationService.getFIFOCOGSForSales(material.id, materialSales, batches || []) : new Map<string, number>()),
    [material, materialSales, batches],
  );

  // Loss / yield analytics across the whole chain.
  const totals = useMemo(() => {
    const sent = materialSends.reduce((s, x) => s + (x.pcsSent || 0), 0);
    const loss = materialSends.reduce((s, x) => s + (x.lossQuantity || 0), 0);
    const received = materialSends.reduce((s, x) => s + (x.pcsReceived || 0), 0);
    const purchaseValue = materialBatches.reduce((s, b) => s + (b.amount || 0), 0);
    const processingCost = processingReceipts
      .filter(r => r.materialId === material?.id)
      .reduce((s, r) => s + (r.billAmount || 0), 0);
    const salesValue = materialSales.reduce((s, x) => s + (x.totalAmount || 0), 0);
    const cogs = materialSales.reduce((s, x) => s + (cogsBySaleId.get(x.id) ?? 0), 0);
    return {
      sent, loss, received,
      yieldPct: sent > 0 ? Math.round(((received) / sent) * 100) : null,
      lossPct: sent > 0 ? Math.round((loss / sent) * 1000) / 10 : null,
      purchaseValue, processingCost, salesValue, cogs,
      grossMargin: salesValue - cogs,
      processingCostPerPiece: received > 0 ? processingCost / received : (sent > 0 ? processingCost / sent : 0),
    };
  }, [materialSends, materialBatches, materialSales, batches, material, processingReceipts, cogsBySaleId]);

  if (!material) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Package className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Material Not Found</h2>
        <Link to="/materials" className="text-sm font-medium text-muted-foreground hover:text-foreground underline">
          Return to Materials
        </Link>
      </div>
    );
  }

  const getSupplierName = (supplierId: string) => suppliers.find(s => s.id === supplierId)?.name || 'Unknown';
  const getProcessorName = (processorId: string) => processors.find(p => p.id === processorId)?.name || 'Unknown';
  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name || 'Unknown';
  const getCustomerName = (customerId: string) => customers.find(c => c.id === customerId)?.name || 'Unknown';

  const saleProfitOf = (sale: { id: string; totalAmount: number }) =>
    sale.totalAmount - (cogsBySaleId.get(sale.id) ?? 0);

  const pathChip = (p?: string) => batchPathLabel(p);

  // ── Batch register rows (consumed by BatchRegister) ──────────────────────
  const registerRows = useMemo(() => materialBatches.map(b => {
    const purchase = purchases.find(x => x.id === b.purchaseId);
    const prog = batchProgress.find(p => p.batch.id === b.id);
    const costPcs = InventoryCalculationService.getBatchCostPerPiece(b);
    const onHand = (prog?.rawPcs || 0) + (b.atProcessorPcs || 0) + (prog?.availablePcs || 0) + (prog?.finishedPcs || 0);
    const supplierName = purchase
      ? getSupplierName(purchase.supplierId)
      : (b.supplierId ? getSupplierName(b.supplierId) : 'Unknown supplier');
    return {
      id: b.id,
      batchNo: b.batchNo,
      purchaseNo: purchase?.purchaseNo || '',
      supplierName,
      date: b.date,
      pathLabel: pathChip(b.processingPath ?? material?.processingPath),
      rawPcs: prog?.rawPcs ?? 0,
      availPcs: prog?.availablePcs ?? 0,
      wipPcs: b.atProcessorPcs || 0,
      finishedPcs: prog?.finishedPcs ?? 0,
      onHandPcs: onHand,
      valueOnHand: onHand * costPcs,
      costPerPiece: costPcs,
      depleted: onHand <= 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [materialBatches, batchProgress, purchases, batches, id, material]);

  const movementModules = useMemo(
    () => [...new Set(materialMovements.map(m => m.module).filter(Boolean))] as string[],
    [materialMovements],
  );

  const filteredMovements = useMemo(() => {
    const q = movementQuery.trim().toLowerCase();
    return materialMovements.filter(m => {
      if (movementModuleFilter && m.module !== movementModuleFilter) return false;
      if (movementTypeFilter && m.transactionType !== movementTypeFilter) return false;
      if (q && ![m.referenceNo, m.module].filter(Boolean).some(f => String(f).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [materialMovements, movementModuleFilter, movementTypeFilter, movementQuery]);
  const movementRows = filteredMovements.slice(0, movementVisible);

  const trackedPcs = positions.raw + positions.inTransit + positions.available + positions.finished;
  const trackedValue = (stageValues?.raw.value ?? 0) + (stageValues?.atProcessor.value ?? 0) + (stageValues?.finished.value ?? 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <Link to="/materials" className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{material.name}</h2>
            <span className={cn(
              "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
              material.status === 'Active' ? "bg-success/10 text-success ring-1 ring-success/20" : "bg-muted text-muted-foreground ring-1 ring-muted-foreground/20"
            )}>
              {material.status}
            </span>
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit material
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{category?.name || 'Uncategorized'} • {material.description || 'No description'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>No. {material.code || '—'}</span>
            <span aria-hidden="true">·</span>
            <span>{pathChip(material.processingPath)}</span>
            <span aria-hidden="true">·</span>
            <span>{material.usageType === 'component' ? 'part of a product' : 'sold on its own'}</span>
            {material.unit && <><span aria-hidden="true">·</span><span>unit {material.unit}</span></>}
            {material.minStockLevel !== undefined && <><span aria-hidden="true">·</span><span>min {formatNumber(material.minStockLevel)}</span></>}
            {material.currentStock !== undefined && <><span aria-hidden="true">·</span><span>declared current {formatNumber(material.currentStock)}</span></>}
          </div>
        </div>
      </div>

      {/* ── Summary strip (always visible) ── */}
      <section className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
        <div className="min-w-[110px]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Raw Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(stageValues?.raw.pcs ?? 0)}<span className="ml-1.5 text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(stageValues?.raw.value ?? 0)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">At Processor (WIP)</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-amber-500">{formatNumber(stageValues?.atProcessor.pcs ?? 0)}<span className="ml-1.5 text-sm font-medium text-amber-500/70">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(stageValues?.atProcessor.value ?? 0)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Finished Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{formatNumber(stageValues?.finished.pcs ?? 0)}<span className="ml-1.5 text-sm font-medium text-success/70">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(stageValues?.finished.value ?? 0)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Processing cost / piece</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-info">{formatCurrency(totals.processingCostPerPiece)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(totals.processingCost)} spent on processing</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tracked total</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(trackedPcs)}<span className="ml-1.5 text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(trackedValue)} across all stages</div>
        </div>
      </section>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList aria-label="Material sections" className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
          <TabsTrigger value="batches" className="justify-center">Batches <span className="ml-1.5 tabular-nums text-muted-foreground">{materialBatches.length}</span></TabsTrigger>
          <TabsTrigger value="overview" className="justify-center">Overview</TabsTrigger>
          <TabsTrigger value="processing" className="justify-center">Processing <span className="ml-1.5 tabular-nums text-muted-foreground">{materialSends.length}</span></TabsTrigger>
          <TabsTrigger value="movements" className="justify-center">Movements <span className="ml-1.5 tabular-nums text-muted-foreground">{materialMovements.length}</span></TabsTrigger>
          <TabsTrigger value="sales" className="justify-center">Sales <span className="ml-1.5 tabular-nums text-muted-foreground">{materialSales.length}</span></TabsTrigger>
        </TabsList>

        {/* ── Batches — the register (default) ── */}
        <TabsContent value="batches" className="mt-5">
          <BatchRegister materialId={id!} rows={registerRows} />
        </TabsContent>

        {/* ── Overview — where the pieces sit + stage cost ── */}
        <TabsContent value="overview" className="mt-5 space-y-5">
          {/* ── Purchase snapshot (headline figures) ── */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Purchased</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1"><ShoppingCart className="h-3.5 w-3.5" /> Total purchased</div>
                <div className="text-xl font-bold tabular-nums text-foreground">{formatNumber(purchaseSummary.pcs)} <span className="text-[11px] font-medium text-muted-foreground">PCS</span></div>
                <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(purchaseSummary.amount)} · {purchaseSummary.lots} {purchaseSummary.lots === 1 ? 'lot' : 'lots'}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1"><Users className="h-3.5 w-3.5" /> Suppliers</div>
                <div className="text-xl font-bold tabular-nums text-foreground">{formatNumber(purchaseSummary.suppliers)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Distinct suppliers in this material</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1"><Truck className="h-3.5 w-3.5" /> Dispatched</div>
                <div className="text-xl font-bold tabular-nums text-foreground">{formatNumber(totals.sent)} <span className="text-[11px] font-medium text-muted-foreground">PCS</span></div>
                <div className="mt-0.5 text-xs text-muted-foreground">Total pcs sent to processors</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1"><PackageCheck className="h-3.5 w-3.5" /> Returned</div>
                <div className="text-xl font-bold tabular-nums text-foreground">{formatNumber(totals.received)} <span className="text-[11px] font-medium text-muted-foreground">PCS</span></div>
                <div className="mt-0.5 text-xs text-muted-foreground">{totals.yieldPct != null ? `Return yield ${totals.yieldPct}%` : 'Received back from processors'}</div>
              </div>
            </div>
          </section>

          {/* ── Per-stage chain: where the pieces actually are ── */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Chain — where this material is</h3>
            <p className="mb-3 text-xs text-muted-foreground">Every stage this material passes through — delivered, held, returned, ready for the next one.</p>
            <div className="overflow-x-auto rounded-xl border border-border bg-muted/20">
              <table className="w-full min-w-[40rem] text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/60 border-b border-border/60">
                  <tr>
                    <th className="px-5 py-3 font-medium">Stage / Processor</th>
                    <th className="px-5 py-3 font-medium text-right">Delivered</th>
                    <th className="px-5 py-3 font-medium text-right">Holding</th>
                    <th className="px-5 py-3 font-medium text-right">Returned</th>
                    <th className="px-5 py-3 font-medium text-right">Awaiting next</th>
                    <th className="px-5 py-3 font-medium text-right">Dispatches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {chainRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Nothing has been dispatched yet.</td></tr>
                  ) : chainRows.map(({ stage, sent, returned, losses, holding, dispatchCount, available }) => (
                    <tr key={stage.id} className="hover:bg-muted/80 transition-colors">
                      <td className="px-5 py-3 text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
                          <span className="font-medium">{stage.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-foreground">{formatNumber(sent)}<span className="text-[10px] text-muted-foreground ml-1">PCS</span></td>
                      <td className="px-5 py-3 text-right tabular-nums text-amber-600 font-medium">{formatNumber(holding)}<span className="text-[10px] text-muted-foreground ml-1">PCS</span></td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(returned)}<span className="text-[10px] text-muted-foreground ml-1">PCS</span></td>
                      <td className="px-5 py-3 text-right tabular-nums text-success font-medium">{formatNumber(available)}<span className="text-[10px] text-muted-foreground ml-1">PCS</span></td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(dispatchCount)}</td>
                    </tr>
                  ))}
                </tbody>
                {chainRows.length > 0 && (
                  <tfoot className="border-t border-border/60 bg-muted/40">
                    <tr>
                      <th className="px-5 py-3 font-medium text-foreground">Total</th>
                      <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(chainRows.reduce((s, r) => s + r.sent, 0))}</th>
                      <th className="px-5 py-3 text-right font-bold text-amber-600 tabular-nums">{formatNumber(chainRows.reduce((s, r) => s + r.holding, 0))}</th>
                      <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(chainRows.reduce((s, r) => s + r.returned, 0))}</th>
                      <th className="px-5 py-3 text-right font-medium text-success tabular-nums">{formatNumber(chainRows.reduce((s, r) => s + r.available, 0))}</th>
                      <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(chainRows.reduce((s, r) => s + r.dispatchCount, 0))}</th>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* ── Unprocessed — what never reached a processor ── */}
          {(() => {
            const notProcessed = positions.raw;
            if (notProcessed <= 0) return null;
            return (
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Package className="h-4 w-4" /> Not processed yet</h3>
                <div className="rounded-xl border border-border/60 bg-muted/20 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Still in raw stock</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatNumber(notProcessed)} <span className="text-sm font-medium text-muted-foreground">PCS</span></div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Ready — awaiting dispatch to the first stage</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Value</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(stageValues?.raw.value ?? 0)}</div>
                  </div>
                </div>
              </section>
            );
          })()}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Where the pieces are right now</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Total tracked: {formatNumber(trackedPcs)} PCS
              · Dispatched {formatNumber(totals.sent)} · Received back {formatNumber(totals.received)}
              {totals.yieldPct != null && <> · Return yield {totals.yieldPct}%</>}
              {totals.lossPct != null && totals.loss > 0 && <> · <span className="text-destructive font-medium">Loss {formatNumber(totals.loss)} PCS ({totals.lossPct}%)</span></>}
            </p>
            {stageWip.some(s => s.pcs > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {stageWip.filter(s => s.pcs > 0).map(({ stage, pcs }) => (
                  <span key={stage.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    {stage.name}: <span className="font-semibold">{formatNumber(pcs)} PCS</span> in transit
                  </span>
                ))}
              </div>
            )}
          </section>

          {materialCost && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Clock className="h-4 w-4" /> Per-stage processing cost</h3>
              <div className="overflow-x-auto rounded-xl border border-border bg-muted/20">
                <table className="w-full min-w-[36rem] text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/60 border-b border-border/60">
                    <tr>
                      <th className="px-5 py-3 font-medium">Stage</th>
                      <th className="px-5 py-3 font-medium text-right">Dispatched</th>
                      <th className="px-5 py-3 font-medium text-right">Sent</th>
                      <th className="px-5 py-3 font-medium text-right">Received</th>
                      <th className="px-5 py-3 font-medium text-right">Bill amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {materialCost.lines.length > 0 ? (
                      materialCost.lines.map(l => (
                        <tr key={l.name} className="hover:bg-muted/80 transition-colors">
                          <td className="px-5 py-3 text-foreground">{l.name}</td>
                          <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(l.dispatches)}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(l.sent)}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(l.received)}</td>
                          <td className="px-5 py-3 text-right font-bold text-foreground tabular-nums">{formatCurrency(l.billed)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No processing cost recorded</td>
                      </tr>
                    )}
                  </tbody>
                  {materialCost.lines.length > 0 && (
                    <tfoot className="border-t border-border/60 bg-muted/40">
                      <tr>
                        <th className="px-5 py-3 font-medium text-foreground">Total</th>
                        <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(materialCost.lines.reduce((s, l) => s + l.dispatches, 0))}</th>
                        <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(materialCost.lines.reduce((s, l) => s + l.sent, 0))}</th>
                        <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(materialCost.lines.reduce((s, l) => s + l.received, 0))}</th>
                        <th className="px-5 py-3 text-right font-bold text-foreground tabular-nums">{formatCurrency(materialCost.processingCost)}</th>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          )}
        </TabsContent>

        {/* ── Processing history ── */}
        <TabsContent value="processing" className="mt-5">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Truck className="h-4 w-4" /> Processing history</h3>
            {materialSends.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">No processing history yet.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full whitespace-nowrap text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/40 sticky top-0 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-3 font-medium">Ref</th>
                      <th className="px-4 py-3 font-medium">Processor</th>
                      <th className="px-4 py-3 font-medium">Stage</th>
                      <th className="px-4 py-3 font-medium">Batch</th>
                      <th className="px-4 py-3 font-medium text-right">Sent</th>
                      <th className="px-4 py-3 font-medium text-right">Recv</th>
                      <th className="px-4 py-3 font-medium text-right">Loss</th>
                      <th className="px-4 py-3 font-medium text-right">Pending</th>
                      <th className="px-4 py-3 font-medium text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {materialSends.map(s => {
                      const stage = sortedStages.find(st => st.id === s.stageId);
                      const batch = (batches || []).find(b => b.id === s.batchId);
                      const pending = (s.pcsSent || 0) - (s.pcsReceived || 0) - (s.lossQuantity || 0);
                      const rateMethod = stage?.rateMethod || 'per_piece';
                      const estCost = rateMethod === 'per_kg'
                        ? (s.pcsReceived || 0) * (batch?.weightPerPiece || 0) * (s.ratePerPiece || 0)
                        : (s.pcsReceived || 0) * (s.ratePerPiece || 0);
                      return (
                        <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{s.dispatchNo}</td>
                          <td className="px-4 py-3 text-muted-foreground">{getProcessorName(s.processorId)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{stage?.name ?? '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{batch?.batchNo || '—'}</td>
                          <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatNumber(s.pcsSent)}</td>
                          <td className="px-4 py-3 text-right text-success tabular-nums">{formatNumber(s.pcsReceived)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {(s.lossQuantity || 0) > 0
                              ? <span className="text-destructive font-medium">{formatNumber(s.lossQuantity || 0)}</span>
                              : <AlertTriangle className="inline h-3 w-3 text-muted-foreground/25" aria-hidden="true" />}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {pending > 0
                              ? <span className="text-warning font-bold">{formatNumber(pending)}</span>
                              : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{estCost > 0 ? formatCurrency(estCost) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Movement ledger ── */}
        <TabsContent value="movements" className="mt-5">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><ArrowRightLeft className="h-4 w-4" /> Movement ledger</h3>
            <div className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-3">
              <Dropdown
                size="sm"
                ariaLabel="Filter by module"
                value={movementModuleFilter}
                onChange={(next) => { setMovementModuleFilter(next); setMovementVisible(200); }}
                triggerClassName="w-44"
                options={[
                  { value: '', label: 'All modules' },
                  ...movementModules.map(mod => ({ value: mod, label: mod })),
                ]}
              />
              <Dropdown
                size="sm"
                ariaLabel="Filter by type"
                value={movementTypeFilter}
                onChange={(next) => { setMovementTypeFilter(next as '' | 'IN' | 'OUT'); setMovementVisible(200); }}
                triggerClassName="w-32"
                options={[
                  { value: '', label: 'IN & OUT' },
                  { value: 'IN', label: 'IN' },
                  { value: 'OUT', label: 'OUT' },
                ]}
              />
              <input
                type="text"
                value={movementQuery}
                onChange={e => { setMovementQuery(e.target.value); setMovementVisible(200); }}
                placeholder="Search ref or module…"
                aria-label="Search movements"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 text-xs text-foreground placeholder:text-muted-foreground/70"
              />
              {(movementModuleFilter || movementTypeFilter || movementQuery) && (
                <button
                  onClick={() => { setMovementModuleFilter(''); setMovementTypeFilter(''); setMovementQuery(''); setMovementVisible(200); }}
                  className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted/40"
                >
                  Clear
                </button>
              )}
            </div>
            {filteredMovements.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
                {materialMovements.length === 0 ? 'No movements recorded yet.' : 'No movements match that filter.'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-border mt-3">
                  <table className="w-full whitespace-nowrap text-sm text-left">
                    <thead className="text-xs text-muted-foreground bg-muted/40 sticky top-0 border-b border-border/50">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Ref</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium text-right">Qty</th>
                        <th className="px-4 py-3 font-medium text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {movementRows.map(m => (
                        <tr key={m.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground tabular-nums">{format(new Date(m.date), 'MMM d, yyyy')}</td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            <div>{m.referenceNo}</div>
                            <div className="text-xs text-muted-foreground font-normal">{m.module}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                              m.transactionType === 'IN' ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                            )}>
                              {m.transactionType === 'IN' ? <ArrowDown className="w-3 h-3 mr-1" /> : <ArrowUp className="w-3 h-3 mr-1" />}
                              {m.transactionType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(m.quantity)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(m.runningBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredMovements.length > movementRows.length && (
                  <div className="border-t border-border/50 px-4 py-3 text-center">
                    <button
                      onClick={() => setMovementVisible(v => v + 200)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Show {Math.min(200, filteredMovements.length - movementRows.length)} more of {filteredMovements.length} movements
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </TabsContent>

        {/* ── Sales ── */}
        <TabsContent value="sales" className="mt-5">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Wallet className="h-4 w-4" /> Sales history</h3>
            {materialSales.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">No sales recorded for this material yet.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full whitespace-nowrap text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/40 sticky top-0 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Invoice</th>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium text-right">Qty</th>
                      <th className="px-4 py-3 font-medium text-right">Revenue</th>
                      <th className="px-4 py-3 font-medium text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {materialSales.map(s => (
                      <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">{format(new Date(s.date), 'MMM d, yyyy')}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{s.invoiceNo}</td>
                        <td className="px-4 py-3 text-muted-foreground">{getCustomerName(s.customerId)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{getProductName(s.productId)}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(s.pcsSold)}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(s.totalAmount)}</td>
                        <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", saleProfitOf(s) >= 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(saleProfitOf(s))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <FormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Material"
        description="Raw material identity, how it's used, and how it moves through processors."
        icon={<Pencil />}
        accent="from-emerald-500 to-teal-600"
        size="xl"
        footer={
          <FormFooter onCancel={() => setEditOpen(false)} formId="material-detail-form" submitLabel="Save Changes" />
        }>
        <MaterialForm
          material={material}
          onSaved={() => setEditOpen(false)}
          onCancel={() => setEditOpen(false)}
          formId="material-detail-form"
          showFooter={false}
        />
      </FormModal>
    </div>
  );
}
