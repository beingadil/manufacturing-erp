import { Eye, Pencil } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '../ui/sheet';
import { Button } from '../ui/button';
import { materialCostSummary } from '../../lib/processing/batchCosts';
import {
  type BatchStageProgress,
  getMaterialBatchProgress,
  getSortedStages,
  visibleStagesForMaterial,
} from '../../lib/processing/stageProgress';
import type { RawMaterial } from '../../types/erp';
import { cn, formatCurrency, formatDocDate, formatNumber } from '../../lib/utils';
import { useERPStore } from '../../store/useERPStore';
import { useShallow } from 'zustand/react/shallow';

interface RawMaterialPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialId: string | null;
  /** Preview's Edit button hands the material back to the list's edit modal. */
  onEdit: (material: RawMaterial) => void;
}

const pathLabel = (m: RawMaterial) =>
  m.processingPath === 'single_stage' ? 'Single stage'
  : m.processingPath === 'custom_stages' ? 'Custom stages'
  : m.processingPath === 'ready_made' ? 'Ready-made'
  : 'Full chain';

/**
 * One honest line for where a batch's pcs physically sit right now — whoever
 * holds them, or what they are waiting for. The sheet links each batch to its
 * full trail; this line answers "the next one holding these" at a glance.
 */
const batchHolding = (prog: BatchStageProgress | undefined) => {
  if (!prog) return null;
  const raw = prog.rawPcs || 0;
  const wait = prog.availablePcs || 0;
  const wip = prog.inTransitPcs || 0;
  const fin = prog.finishedPcs || 0;
  if (fin > 0 && raw <= 0 && wait <= 0 && wip <= 0) return { text: 'Finished goods', tone: 'fin' as const };
  if (fin > 0) return { text: `Partly finished · ${formatNumber(fin)} PCS done`, tone: 'fin' as const };
  if (wip > 0) return { text: `Out with ${prog.currentStage?.name ?? 'a processor'}`, tone: 'wip' as const };
  if (wait > 0 && prog.nextStage) return { text: `Waiting for ${prog.nextStage.name}`, tone: 'wait' as const };
  if (raw > 0) return { text: 'Raw, undispatched', tone: 'raw' as const };
  return { text: 'Nothing left', tone: 'done' as const };
};

const toneClass: Record<string, string> = {
  fin: 'text-success',
  wip: 'text-amber-600',
  wait: 'text-sky-600',
  raw: 'text-muted-foreground',
  done: 'text-muted-foreground',
};

/**
 * Read-only quick preview of a raw material — the whole story at one glance:
 * every batch that bought it (which supplier, when), where its pieces
 * physically sit right now, and the totals that bind them together.
 * Opened from the register's Eye action; the sheet navigates to the full
 * detail page on demand.
 */
export function RawMaterialPreview({ open, onOpenChange, materialId, onEdit }: RawMaterialPreviewProps) {
  const navigate = useNavigate();
  const { materials, categories, batches, processingSends, processingReceipts, inventoryMovements, processingStages, purchases, suppliers } = useERPStore(useShallow(s => ({ materials: s.materials, categories: s.categories, batches: s.batches, processingSends: s.processingSends, processingReceipts: s.processingReceipts, inventoryMovements: s.inventoryMovements, processingStages: s.processingStages, purchases: s.purchases, suppliers: s.suppliers })));

  const material = materials.find(m => m.id === materialId) ?? null;
  const id = material?.id ?? null;

  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);
  const stepperStages = useMemo(
    () => (material ? visibleStagesForMaterial(sortedStages, material) : []),
    [sortedStages, material],
  );

  const materialBatches = useMemo(
    () => (batches || [])
      .filter(b => b.materialId === id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [batches, id],
  );

  const batchProgress = useMemo(
    () => (material ? getMaterialBatchProgress(material.id, batches || [], stepperStages.length > 0 ? stepperStages : sortedStages, material) : []),
    [material, batches, stepperStages, sortedStages],
  );
  const progByBatch = useMemo(() => new Map(batchProgress.map(p => [p.batch.id, p])), [batchProgress]);

  const materialCost = useMemo(
    () => (materialBatches.length > 0
      ? materialCostSummary(materialBatches, processingSends, sortedStages, processingReceipts)
      : null),
    [materialBatches, processingSends, sortedStages, processingReceipts],
  );

  const recentMovements = useMemo(
    () => (inventoryMovements || []).filter(m => m.materialId === id).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3),
    [inventoryMovements, id],
  );

  const supplierNameFor = (batch: (typeof materialBatches)[number]) => {
    const purchase = purchases?.find(p => p.id === batch.purchaseId);
    const supplierId = purchase?.supplierId ?? batch.supplierId;
    return suppliers?.find(s => s.id === supplierId)?.name ?? 'Unknown supplier';
  };

  /** The one honest answer: how many pieces exist per bucket, summed over ALL batches — and what it all cost. */
  const totals = useMemo(() => {
    let purchased = 0, raw = 0, waiting = 0, wip = 0, fin = 0, value = 0;
    const supplierIds = new Set<string>();
    for (const b of materialBatches) {
      purchased += b.initialPcs || 0;
      const prog = progByBatch.get(b.id);
      raw += prog?.rawPcs ?? 0;
      waiting += prog?.availablePcs ?? 0;
      wip += prog?.inTransitPcs ?? 0;
      fin += prog?.finishedPcs ?? 0;
      value += purchases?.find(p => p.id === b.purchaseId)?.amount ?? 0;
      if (b.supplierId) supplierIds.add(b.supplierId);
    }
    return {
      purchased,
      raw,
      waiting,
      wip,
      fin,
      onHand: raw + waiting + wip + fin,
      value,
      batchesCount: materialBatches.length,
      supplierCount: supplierIds.size,
    };
  }, [materialBatches, progByBatch, purchases]);

  const categoryName = material ? categories.find(c => c.id === material.categoryId)?.name ?? 'Uncategorized' : '';

  const openDetail = () => {
    if (!id) return;
    onOpenChange(false);
    navigate(`/materials/${id}`);
  };

  const handleEdit = () => {
    if (!material) return;
    onOpenChange(false);
    onEdit(material);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="scroll-thin w-3/4 overflow-y-auto sm:max-w-2xl" side="right">
        <SheetHeader>
          <SheetTitle className="pr-6">
            {material ? material.name : 'Material preview'}
            {material && material.code ? (
              <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">No. {material.code}</span>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {material
              ? `${categoryName} · ${material.usageType === 'component' ? 'part of a product' : 'sold on its own'} · ${pathLabel(material)}`
              : 'No material selected'}
          </SheetDescription>
        </SheetHeader>

        {!material ? (
          <p className="mt-6 text-sm text-muted-foreground">Material not found.</p>
        ) : (
          <div className="mt-5 space-y-5">
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
                material.status === 'Active'
                  ? 'bg-success/10 text-success ring-1 ring-success/20'
                  : 'bg-muted text-muted-foreground ring-1 ring-muted-foreground/20',
              )}
            >
              {material.status}
            </span>

            {/* ── The totals — every batch folded in ─────────────────────── */}
            <section aria-label="Totals">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                All batches — totals
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  { label: 'Purchased', pcs: totals.purchased, tone: 'text-foreground' },
                  { label: 'Raw', pcs: totals.raw, tone: 'text-foreground' },
                  { label: 'Waiting', pcs: totals.waiting, tone: 'text-sky-600' },
                  { label: 'WIP', pcs: totals.wip, tone: 'text-amber-600' },
                  { label: 'Finished', pcs: totals.fin, tone: 'text-success' },
                  { label: 'On hand', pcs: totals.onHand, tone: 'text-foreground' },
                ].map(cell => (
                  <div key={cell.label} className="rounded-xl border border-border bg-muted/30 p-2.5">
                    <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{cell.label}</div>
                    <div className={cn('mt-1 text-lg font-bold tabular-nums leading-none', cell.tone)}>{formatNumber(cell.pcs)}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {totals.batchesCount} {totals.batchesCount === 1 ? 'batch' : 'batches'} from {totals.supplierCount} {totals.supplierCount === 1 ? 'supplier' : 'suppliers'}
                {' · '}purchase cost <span className="font-semibold text-foreground">{formatCurrency(totals.value)}</span>
                {materialCost ? <>{' · '}processing cost <span className="font-semibold text-foreground">{formatCurrency(materialCost.processingCost)}</span></> : null}
              </p>
            </section>

            {/* ── Every batch — one flat table ───────────────────────────── */}
            <section aria-label="Batches">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Every batch — newest first
              </p>
              {materialBatches.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No batches purchased yet.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-[11px] leading-tight tabular-nums">
                    <thead className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50">
                      <tr>
                        <th className="px-2 py-2 text-left">Batch · Supplier</th>
                        <th className="px-2 py-2 text-right">Pcs</th>
                        <th className="px-2 py-2 text-right">Raw</th>
                        <th className="px-2 py-2 text-right">Waiting</th>
                        <th className="px-2 py-2 text-right">WIP</th>
                        <th className="px-2 py-2 text-right">Finished</th>
                        <th className="px-2 py-2 text-right">On hand</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {materialBatches.map(b => {
                        const prog = progByBatch.get(b.id);
                        const raw = prog?.rawPcs ?? 0;
                        const wait = prog?.availablePcs ?? 0;
                        const wip = prog?.inTransitPcs ?? 0;
                        const fin = prog?.finishedPcs ?? 0;
                        const holding = batchHolding(prog);
                        return (
                          <tr key={b.id} className="hover:bg-muted/60 transition-colors">
                            <td className="px-2 py-2">
                              <button
                                onClick={() => {
                                  onOpenChange(false);
                                  navigate(`/materials/${b.materialId}/purchases/${b.id}`);
                                }}
                                className="block max-w-[190px] truncate text-left font-semibold text-foreground hover:text-primary"
                                title={supplierNameFor(b)}
                              >
                                {b.batchNo}
                              </button>
                              <span className="block max-w-[190px] truncate text-[9px] font-normal text-muted-foreground">
                                {formatDocDate(b.date)} · {supplierNameFor(b)}
                              </span>
                              {holding && (
                                <span className={cn('mt-0.5 block text-[9px] font-semibold', toneClass[holding.tone])}>
                                  {holding.text}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right">{formatNumber(b.initialPcs || 0)}</td>
                            <td className="px-2 py-2 text-right">{raw > 0 ? formatNumber(raw) : '—'}</td>
                            <td className="px-2 py-2 text-right text-sky-600">{wait > 0 ? formatNumber(wait) : '—'}</td>
                            <td className="px-2 py-2 text-right text-amber-600">{wip > 0 ? formatNumber(wip) : '—'}</td>
                            <td className="px-2 py-2 text-right text-success">{fin > 0 ? formatNumber(fin) : '—'}</td>
                            <td className="px-2 py-2 text-right font-semibold">{formatNumber(raw + wait + wip + fin)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t border-border/60 bg-muted/40 font-semibold">
                      <tr>
                        <td className="px-2 py-2 text-foreground">TOTAL{' '}<span className="font-normal text-[9px] text-muted-foreground">{materialBatches.length} {materialBatches.length === 1 ? 'batch' : 'batches'}</span></td>
                        <td className="px-2 py-2 text-right">{formatNumber(totals.purchased)}</td>
                        <td className="px-2 py-2 text-right">{formatNumber(totals.raw)}</td>
                        <td className="px-2 py-2 text-right text-sky-600">{formatNumber(totals.waiting)}</td>
                        <td className="px-2 py-2 text-right text-amber-600">{formatNumber(totals.wip)}</td>
                        <td className="px-2 py-2 text-right text-success">{formatNumber(totals.fin)}</td>
                        <td className="px-2 py-2 text-right">{formatNumber(totals.onHand)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            {/* ── Latest movements (kept slim) ─────────────────────────────── */}
            <section aria-label="Recent movements">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Latest movements</p>
              {recentMovements.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No movements recorded yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border/50 rounded-xl border border-border">
                  {recentMovements.map(m => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-foreground">{m.referenceNo}</span>
                        <span className="ml-2 text-muted-foreground">{m.module}</span>
                      </span>
                      <span className={cn('tabular-nums', m.transactionType === 'IN' ? 'text-success' : 'text-destructive')}>
                        {m.transactionType === 'IN' ? '+' : '−'}{formatNumber(m.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <SheetFooter className="mt-6 gap-2 sm:justify-start">
          <Button onClick={openDetail} disabled={!material} className="flex-1">
            <Eye className="h-4 w-4" /> Open full detail
          </Button>
          <Button variant="secondary" onClick={handleEdit} disabled={!material} className="flex-1">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
