import { Eye, PackageSearch, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from 'sonner';
import { InlineEditInput } from '../components/common/InlineEditInput';
import { RawMaterialPreview } from '../components/materials/RawMaterialPreview';
import { SafeDeleteDialog } from '../components/common/SafeDeleteDialog';
import { Dropdown } from '../components/Dropdown';
import { FormModal } from '../components/form/FormModal';
import { MaterialForm } from '../components/forms/MaterialForm';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { MaterialService } from '../services/MaterialService';
import { useERPStore } from "../store/useERPStore";

/**
 * Raw Materials — the plant's movement ledger.
 *
 * Deliberately NOT the shared DataTable: this page is a register, so every row
 * is a two-deck record (identity + movement) that reflows instead of scrolling
 * sideways. That keeps the page wide with the sidebar expanded, removes the
 * horizontal scrollbar, and lets each material show where its pieces actually
 * are (raw / at processor / finished).
 *
 * Typography follows the rest of the ERP: Montserrat (font-sans) everywhere,
 * `text-2xl font-bold tracking-tight` for the page and stat figures, `text-sm`
 * for body and rows, `text-xs` for meta, `text-[11px] uppercase tracking-wider`
 * for stat labels — the same vocabulary as Categories, Products and the shared
 * DataTable. No monospace digits and no letter-spaced micro-type: this page is
 * part of the software, not a landing page.
 */

type SortKey = 'name' | 'value' | 'stock';

export function RawMaterials() {
  const { materials, categories, purchases, processingSends, processingReceipts, batches } = useERPStore();

  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
    impactDetails: string[];
    isReferenced: boolean;
  }>({ isOpen: false, id: '', name: '', impactDetails: [], isReferenced: false });

  const handleDeleteClick = (material: any) => {
    const impactDetails: string[] = [];
    let isReferenced = false;

    const purchaseCount = purchases?.filter((p: any) => p.materialId === material.id).length || 0;
    const sendCount = processingSends?.filter((p: any) => p.materialId === material.id).length || 0;
    const receiptCount = processingReceipts?.filter((p: any) => p.materialId === material.id).length || 0;
    const batchCount = batches?.filter((b: any) => b.materialId === material.id).length || 0;

    if (purchaseCount > 0) impactDetails.push(`Referenced by ${purchaseCount} purchase order(s).`);
    if (sendCount > 0) impactDetails.push(`Referenced by ${sendCount} processing send(s).`);
    if (receiptCount > 0) impactDetails.push(`Referenced by ${receiptCount} processing receipt(s).`);
    if (batchCount > 0) impactDetails.push(`Referenced by ${batchCount} inventory batch(es).`);

    if (purchaseCount > 0 || sendCount > 0 || receiptCount > 0 || batchCount > 0) {
      isReferenced = true;
      impactDetails.push("Because of these references, the material cannot be deleted to preserve data integrity. It will be deactivated instead.");
    }

    if (material.stockPcs > 0 || material.processedStockPcs > 0) {
      impactDetails.push(`This material currently has raw stock (${material.stockPcs} PCS) or finished stock (${material.processedStockPcs} PCS).`);
    }

    setDeleteDialog({
      isOpen: true,
      id: material.id,
      name: material.name,
      impactDetails,
      isReferenced
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteDialog.id) return;

    try {
      if (deleteDialog.isReferenced) {
        MaterialService.update(deleteDialog.id, { status: 'Inactive' });
        toast.success('Material deactivated successfully to preserve referential integrity.');
      } else {
        MaterialService.delete(deleteDialog.id);
        toast.success('Material deleted successfully');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to process material');
    }
    setDeleteDialog(prev => ({ ...prev, isOpen: false }));
  };

  const handleEditInline = async (id: string, field: keyof any, value: string) => {
    const material = materials.find(m => m.id === id);
    if (!material || (material as any)[field] === value) return;

    try {
      MaterialService.update(id, { [field]: value });
      toast.success('Material updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update material');
    }
  };

  const openEditModal = (material: any) => {
    setEditingMaterial(material);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMaterial(null);
  };

  const getCategoryName = (id: string) => {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : "Unknown category";
  };

  const enrichedMaterials = useMemo(() => materials.map(m => {
    const stages = InventoryCalculationService.getMaterialStageValues(m.id, batches);
    const value = stages.raw.value + stages.atProcessor.value + stages.finished.value;
    const onHandPcs = stages.raw.pcs + stages.atProcessor.pcs + stages.finished.pcs;
    const costPerPiece = onHandPcs > 0 ? value / onHandPcs : 0;
    return {
      ...m,
      categoryName: getCategoryName(m.categoryId),
      costPerPiece,
      value,
      // Stage split drives the composition bar — the page shows WHERE the
      // pieces are, not just how many exist.
      rawPcs: stages.raw.pcs,
      atProcessorPcs: stages.atProcessor.pcs,
      finishedPcs: stages.finished.pcs,
      onHandPcs,
    };
  }), [materials, categories, batches]);

  const visibleMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? enrichedMaterials.filter(m =>
          [m.name, m.code, m.categoryName, m.description]
            .filter(Boolean)
            .some(field => String(field).toLowerCase().includes(q)))
      : enrichedMaterials;

    const sorted = [...filtered];
    if (sortKey === 'value') sorted.sort((a, b) => (b.value || 0) - (a.value || 0));
    else if (sortKey === 'stock') sorted.sort((a, b) => (b.onHandPcs || 0) - (a.onHandPcs || 0));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [enrichedMaterials, searchQuery, sortKey]);

  const totalStock = enrichedMaterials.reduce((s, m) => s + (m.stockPcs || 0), 0);
  const totalProcessed = enrichedMaterials.reduce((s, m) => s + (m.processedStockPcs || 0), 0);
  const totalValue = enrichedMaterials.reduce((s, m) => s + (m.value || 0), 0);
  const activeCount = enrichedMaterials.filter(m => m.status === 'Active').length;

  const stagePcs = enrichedMaterials.reduce(
    (acc, m) => ({
      raw: acc.raw + (m.rawPcs || 0),
      atProcessor: acc.atProcessor + (m.atProcessorPcs || 0),
      finished: acc.finished + (m.finishedPcs || 0),
    }),
    { raw: 0, atProcessor: 0, finished: 0 },
  );
  const stageTotal = stagePcs.raw + stagePcs.atProcessor + stagePcs.finished;
  /** Segment width as a percentage — 0 when nothing is booked, so no bar shows. */
  const bandShare = (pcs: number) => (stageTotal > 0 ? `${(pcs / stageTotal) * 100}%` : '0%');
  const rowShare = (pcs: number, total: number) => (total > 0 ? `${(pcs / total) * 100}%` : '0%');

  const statLabel = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';
  const statValue = 'mt-1 text-2xl font-bold tracking-tight tabular-nums';

  return (
    <div className="w-full min-w-0 space-y-6 pb-20">
      {/* Page header — same anatomy as every other master-data module */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <PackageSearch className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Raw Materials</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Stock is counted from purchase batches and processor receipts, never typed in by hand.
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add material
        </button>
      </div>

      {/* Stock summary — the shared stat-band pattern */}
      <section aria-label="Stock summary" className="rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
          <div>
            <div className={statLabel}>Materials</div>
            <div className={cn(statValue, 'text-foreground')}>{formatNumber(enrichedMaterials.length)}</div>
            <div className="text-xs text-muted-foreground">
              {formatNumber(activeCount)} active · {formatNumber(enrichedMaterials.length - activeCount)} inactive
            </div>
          </div>
          <div className="sm:border-l sm:border-border/60 sm:pl-10">
            <div className={statLabel}>Raw stock</div>
            <div className={cn(statValue, 'text-foreground')}>{formatNumber(totalStock)}</div>
            <div className="text-xs text-muted-foreground">PCS on the floor</div>
          </div>
          <div className="sm:border-l sm:border-border/60 sm:pl-10">
            <div className={statLabel}>At processors</div>
            <div className={cn(statValue, 'text-foreground')}>{formatNumber(totalProcessed)}</div>
            <div className="text-xs text-muted-foreground">PCS in processing &amp; finished</div>
          </div>
          <div className="sm:border-l sm:border-border/60 sm:pl-10">
            <div className={statLabel}>Inventory value</div>
            <div className={cn(statValue, 'text-success')}>{formatCurrency(totalValue)}</div>
            <div className="text-xs text-muted-foreground">At purchase cost, incl. WIP</div>
          </div>
        </div>

        {/* Where the pieces physically are — real stage data, not decoration */}
        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Raw <span className="tabular-nums text-foreground">{formatNumber(stagePcs.raw)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              At processor <span className="tabular-nums text-foreground">{formatNumber(stagePcs.atProcessor)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />
              Finished <span className="tabular-nums text-foreground">{formatNumber(stagePcs.finished)}</span>
            </span>
          </div>
          <div
            className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={stageTotal > 0
              ? `${stagePcs.raw} PCS raw, ${stagePcs.atProcessor} PCS at processor, ${stagePcs.finished} PCS finished`
              : 'No stock on hand yet'}
          >
            {stageTotal > 0 && (
              <>
                <div className="bg-emerald-500/90" style={{ width: bandShare(stagePcs.raw) }} />
                <div className="bg-amber-500/90" style={{ width: bandShare(stagePcs.atProcessor) }} />
                <div className="bg-sky-500/90" style={{ width: bandShare(stagePcs.finished) }} />
              </>
            )}
          </div>
          {stageTotal === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">No stock booked yet — record a purchase to start the trail.</p>
          )}
        </div>
      </section>

      {/* Register — bespoke rows, never width-capped, never side-scrolling */}
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Material register</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Rename a material inline, open its batch trail, or change how it moves through processors.
            </p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatNumber(enrichedMaterials.length)} records
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {/* Register toolbar */}
          <div className="flex flex-col gap-3 border-b border-border/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" aria-hidden="true" />
              <input
                type="text"
                aria-label="Search materials"
                placeholder="Search name, No. or category…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <label htmlFor="material-sort" className="sr-only">Sort materials</label>
              <Dropdown
                id="material-sort"
                size="sm"
                ariaLabel="Sort materials"
                value={sortKey}
                onChange={(next) => setSortKey(next as SortKey)}
                triggerClassName="w-44"
                options={[
                  { value: 'name', label: 'Name A–Z' },
                  { value: 'value', label: 'Highest value' },
                  { value: 'stock', label: 'Most stock' },
                ]}
              />
              <span className="hidden items-center rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground sm:inline-flex">
                {formatNumber(visibleMaterials.length)} / {formatNumber(enrichedMaterials.length)}
              </span>
            </div>
          </div>

          {/* Column key (desktop only — the rows explain themselves when stacked) */}
          <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.15fr)_minmax(0,0.7fr)_auto] gap-6 border-b border-border/50 bg-muted/30 px-6 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Material</span>
            <span>Movement</span>
            <span className="text-right">Value</span>
            <span className="text-right">Actions</span>
          </div>

          {visibleMaterials.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                {enrichedMaterials.length === 0 ? 'No materials yet' : 'Nothing matches that search'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {enrichedMaterials.length === 0
                  ? 'Add the first raw material to start the stock trail.'
                  : 'Try a shorter term, or clear the search to see every material.'}
              </p>
              {enrichedMaterials.length === 0 ? (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
                >
                  <Plus className="h-4 w-4" /> Add material
                </button>
              ) : (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {visibleMaterials.map(item => (
                <li
                  key={item.id}
                  onClick={e => {
                    // The row is the way into a material's batch trail. Only
                    // real controls (rename field, category link, edit and
                    // delete) keep their own click; everything else — the
                    // numbers, the stage bar, the empty space — opens the
                    // material's detail page.
                    const target = e.target as HTMLElement;
                    if (target.closest('a, button, input, select, textarea, [role="combobox"]')) return;
                    navigate(`/materials/${item.id}`);
                  }}
                  className="group cursor-pointer transition-colors duration-150 hover:bg-muted/40"
                >
                  <div className="grid grid-cols-1 items-center gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.15fr)_minmax(0,0.7fr)_auto] lg:gap-6">
                    {/* Identity — name (inline editable), No., category, usage as plain text */}
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', item.status === 'Active' ? 'bg-emerald-500' : 'bg-muted-foreground/40')}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-2.5" onClick={e => e.stopPropagation()}>
                          <InlineEditInput
                            value={item.name}
                            onCommit={(v) => handleEditInline(item.id, 'name', v)}
                            className="min-w-0 rounded border-none bg-transparent p-0 text-sm font-semibold text-foreground focus:ring-1 focus:ring-primary"
                            ariaLabel={`Rename material ${item.name}`}
                          />
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {item.code ? `No. ${item.code}` : 'No. —'}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <Link
                            to={`/materials/${item.id}`}
                            className="truncate underline-offset-4 transition-colors hover:text-foreground hover:underline"
                          >
                            {item.categoryName}
                          </Link>
                          <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                          <span>{item.usageType === 'component' ? 'part of a product' : 'sold on its own'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Movement — per-material stage split, then the total */}
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Raw <span className="tabular-nums text-foreground">{formatNumber(item.rawPcs || 0)}</span></span>
                        <span>Processing <span className="tabular-nums text-foreground">{formatNumber(item.atProcessorPcs || 0)}</span></span>
                        <span>Finished <span className="tabular-nums text-foreground">{formatNumber(item.finishedPcs || 0)}</span></span>
                      </div>
                      <div className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        {(item.onHandPcs || 0) > 0 ? (
                          <>
                            <div className="bg-emerald-500/90" style={{ width: rowShare(item.rawPcs || 0, item.onHandPcs || 0) }} />
                            <div className="bg-amber-500/90" style={{ width: rowShare(item.atProcessorPcs || 0, item.onHandPcs || 0) }} />
                            <div className="bg-sky-500/90" style={{ width: rowShare(item.finishedPcs || 0, item.onHandPcs || 0) }} />
                          </>
                        ) : null}
                      </div>
                      <div className="mt-1.5 text-sm font-semibold tabular-nums text-foreground">
                        {formatNumber(item.onHandPcs || 0)}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">PCS on hand</span>
                      </div>
                    </div>

                    {/* Value */}
                    <div className="text-left lg:text-right">
                      <div className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(item.value)}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {item.costPerPiece > 0 ? `${formatCurrency(item.costPerPiece)} / PCS` : 'no cost yet'}
                      </div>
                    </div>

                    {/* Status + actions */}
                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-medium',
                        item.status === 'Active' ? 'text-emerald-600' : 'text-muted-foreground',
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', item.status === 'Active' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} aria-hidden="true" />
                        {item.status}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPreviewId(item.id)}
                          aria-label={`Preview ${item.name}`}
                          title={`Preview ${item.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          aria-label={`Edit ${item.name}`}
                          title={`Edit ${item.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(item)}
                          aria-label={`Delete ${item.name}`}
                          title={`Delete ${item.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <RawMaterialPreview
        open={previewId !== null}
        onOpenChange={(open) => { if (!open) setPreviewId(null); }}
        materialId={previewId}
        onEdit={(m) => {
          setPreviewId(null);
          openEditModal(m);
        }}
      />

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingMaterial ? 'Edit Material' : 'Add Material'}
        description="Raw material identity, how it's used, and how it moves through processors."
        icon={editingMaterial ? <Pencil /> : <PackageSearch />}
        accent="from-emerald-500 to-teal-600"
        size="xl">
        <MaterialForm material={editingMaterial} onSaved={closeModal} onCancel={closeModal} />
      </FormModal>

      <SafeDeleteDialog
        isOpen={deleteDialog.isOpen}
        itemName={deleteDialog.name}
        itemType="Material"
        actionType={deleteDialog.isReferenced ? 'Deactivate' : 'Delete'}
        impactDetails={deleteDialog.impactDetails}
        requiresAuth={deleteDialog.impactDetails.length > 0}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
      />
    </div>
  );
}
