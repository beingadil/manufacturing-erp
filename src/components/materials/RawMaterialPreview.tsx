import { Eye, Pencil } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StageProgressStepper } from '../processing/StageProgressStepper';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../ui/sheet';
import { Button } from '../ui/button';
import { InventoryCalculationService } from '../../lib/business/InventoryCalculationService';
import { materialCostSummary } from '../../lib/processing/batchCosts';
import {
  getMaterialBatchProgress,
  getSortedStages,
  visibleStagesForMaterial,
} from '../../lib/processing/stageProgress';
import type { RawMaterial } from '../../types/erp';
import { cn, formatCurrency, formatNumber } from '../../lib/utils';
import { useERPStore } from '../../store/useERPStore';

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
 * Read-only quick preview of a raw material — stock split, recent batches and
 * where they sit in the chain. Opened from the register's Eye action; the
 * sheet navigates to the full detail page on demand.
 */
export function RawMaterialPreview({ open, onOpenChange, materialId, onEdit }: RawMaterialPreviewProps) {
  const navigate = useNavigate();
  const {
    materials,
    categories,
    batches,
    processingSends,
    processingReceipts,
    inventoryMovements,
    processingStages,
    purchases,
    suppliers,
  } = useERPStore();

  const material = materials.find(m => m.id === materialId) ?? null;
  const id = material?.id ?? null;

  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);
  const stepperStages = useMemo(
    () => (material ? visibleStagesForMaterial(sortedStages, material) : []),
    [sortedStages, material],
  );

  const stageValues = useMemo(
    () => (material ? InventoryCalculationService.getMaterialStageValues(material.id, batches || []) : null),
    [material, batches],
  );

  const materialBatches = useMemo(
    () => (batches || [])
      .filter(b => b.materialId === id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [batches, id],
  );

  const batchProgress = useMemo(
    () => (material ? getMaterialBatchProgress(material.id, batches || [], stepperStages.length > 0 ? stepperStages : sortedStages) : []),
    [material, batches, stepperStages, sortedStages],
  );

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
      <SheetContent className="scroll-thin w-3/4 overflow-y-auto sm:max-w-md" side="right">
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

            {/* Where the pieces are */}
            <section aria-label="Stock by stage">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Stock by stage</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: 'Raw', pcs: stageValues?.raw.pcs ?? 0, value: stageValues?.raw.value ?? 0, tone: 'text-foreground' },
                  { label: 'At processor', pcs: stageValues?.atProcessor.pcs ?? 0, value: stageValues?.atProcessor.value ?? 0, tone: 'text-amber-500' },
                  { label: 'Finished', pcs: stageValues?.finished.pcs ?? 0, value: stageValues?.finished.value ?? 0, tone: 'text-success' },
                ].map(cell => (
                  <div key={cell.label} className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{cell.label}</div>
                    <div className={cn('mt-1 text-xl font-bold tabular-nums', cell.tone)}>{formatNumber(cell.pcs)}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{formatCurrency(cell.value)}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {materialCost
                  ? `Purchase value ${formatCurrency(materialCost.purchaseCost)} · Processing cost ${formatCurrency(materialCost.processingCost)}`
                  : 'No purchase value yet — record a purchase to start the trail.'}
              </p>
            </section>

            {/* Recent batches */}
            <section aria-label="Recent batches">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Recent batches{materialBatches.length > 0 ? ` · newest first` : ''}
              </p>
              {materialBatches.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No batches purchased yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {materialBatches.slice(0, 5).map(b => {
                    const prog = batchProgress.find(p => p.batch.id === b.id);
                    return (
                      <li key={b.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            onClick={() => {
                              onOpenChange(false);
                              navigate(`/materials/${b.materialId}/purchases/${b.id}`);
                            }}
                            className="text-left text-sm font-semibold text-foreground hover:text-primary"
                            title={supplierNameFor(b)}
                          >
                            {b.batchNo}
                          </button>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(b.date).toLocaleDateString()} · {supplierNameFor(b)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                          {prog && prog.rawPcs > 0 && <span>Raw <b className="text-foreground">{formatNumber(prog.rawPcs)}</b></span>}
                          {prog && prog.availablePcs > 0 && <span>Avail <b className="text-foreground">{formatNumber(prog.availablePcs)}</b></span>}
                          {prog && prog.inTransitPcs > 0 && <span>WIP <b className="text-amber-600">{formatNumber(prog.inTransitPcs)}</b></span>}
                          {prog && prog.finishedPcs > 0 && <span>Finished <b className="text-success">{formatNumber(prog.finishedPcs)}</b></span>}
                        </div>
                        {stepperStages.length > 0 && prog && (
                          <div className="mt-2">
                            <StageProgressStepper
                              stages={stepperStages}
                              completedStageIds={prog.completedStages.map(s => s.id)}
                              currentStageId={prog.currentStage?.id}
                              nextStageId={prog.nextStage?.id}
                              compact
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Recent movements */}
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
