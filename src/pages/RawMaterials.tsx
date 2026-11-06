import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from 'sonner';
import { InlineEditInput } from '../components/common/InlineEditInput';
import { SafeDeleteDialog } from '../components/common/SafeDeleteDialog';
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { SearchableSelect } from "../components/SearchableSelect";
import { PageModal } from "../components/ui/PageModal";
import { fieldGroupClass, hintClass, inputClass, labelClass, selectClass, textareaClass } from '../components/ui/formStyles';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { findMaterialCodeConflict } from '../lib/business/ProductAssemblyService';
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { MaterialService } from '../services/MaterialService';
import { useERPStore } from "../store/useERPStore";
import type { MaterialUsageType, ProcessingPath } from '../types/erp';

export function RawMaterials() {
  const { materials, categories, purchases, processingSends, processingReceipts, batches } = useERPStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
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

    // Check references
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

  const [name, setName] = useState("");
  // The "No." a person reads out with the name — "Circle 12½ Inch, No. 4 No".
  // Free text: it is a designation the shop already uses, not a system code.
  const [code, setCode] = useState("");
  // Sellable on its own, or a part consumed by a product made of several
  // materials (a steel dhakkan on a steel jug, a handle).
  const [usageType, setUsageType] = useState<MaterialUsageType>('sellable');
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<'Active' | 'Inactive'>("Active");
  const { processingStages } = useERPStore();
  const sortedStagesForForm = useMemo(() =>
    [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence),
    [processingStages]
  );
  const [processingPath, setProcessingPath] = useState<ProcessingPath>('full_chain');
  const [fixedStageId, setFixedStageId] = useState('');
  const [allowedStageIds, setAllowedStageIds] = useState<string[]>([]);

  // Category prefill: a category with a defaultProcessingPath seeds the selector.
  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    const catDefault = categories.find(c => c.id === id)?.defaultProcessingPath;
    if (catDefault) setProcessingPath(catDefault);
  };

  const openEditModal = (material: any) => {
    setEditingMaterial(material);
    setName(material.name);
    setCode(material.code || '');
    // Older materials have no usageType; they behave exactly as before.
    setUsageType(material.usageType === 'component' ? 'component' : 'sellable');
    setCategoryId(material.categoryId);
    setDescription(material.description || '');
    setStatus(material.status === 'Inactive' ? 'Inactive' : 'Active');
    setProcessingPath(material.processingPath ?? 'full_chain');
    setFixedStageId(material.fixedStageId || '');
    setAllowedStageIds(material.allowedStageIds || []);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMaterial(null);
    setName("");
    setCode("");
    setUsageType('sellable');
    setCategoryId("");
    setDescription("");
    setStatus("Active");
    setProcessingPath('full_chain');
    setFixedStageId('');
    setAllowedStageIds([]);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) return;
    if (processingPath === 'single_stage' && !fixedStageId) return;
    if (processingPath === 'custom_stages' && allowedStageIds.length === 0) return;

    const clash = findMaterialCodeConflict(materials, code);
    if (clash) {
      toast.error(`No. "${code.trim()}" is already used by "${clash}". Pick a different one.`);
      return;
    }

    try {
      MaterialService.create({
        name,
        code: code.trim() || undefined,
        usageType,
        categoryId,
        description,
        status,
        processingPath,
        fixedStageId: processingPath === 'single_stage' ? fixedStageId : undefined,
        allowedStageIds: processingPath === 'custom_stages' ? allowedStageIds : undefined
      });
      toast.success('Material created successfully');
      closeModal();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create material');
    }
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial || !name.trim() || !categoryId) return;
    if (processingPath === 'single_stage' && !fixedStageId) return;
    if (processingPath === 'custom_stages' && allowedStageIds.length === 0) return;

    const clash = findMaterialCodeConflict(materials, code, editingMaterial.id);
    if (clash) {
      toast.error(`No. "${code.trim()}" is already used by "${clash}". Pick a different one.`);
      return;
    }

    try {
      MaterialService.update(editingMaterial.id, {
        name,
        code: code.trim() || undefined,
        usageType,
        categoryId,
        description,
        status,
        processingPath,
        fixedStageId: processingPath === 'single_stage' ? fixedStageId : undefined,
        allowedStageIds: processingPath === 'custom_stages' ? allowedStageIds : undefined
      });
      toast.success('Material updated successfully');
      closeModal();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update material');
    }
  };

  const getCategoryName = (id: string) => {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : "Unknown Category";
  };

  const enrichedMaterials = useMemo(() => materials.map(m => {
    const stages = InventoryCalculationService.getMaterialStageValues(m.id, batches);
    // Stock value of EVERYTHING this material has on hand at ACTUAL purchase
    // cost. raw + atProcessor (pipeline incl. waiting-for-next-stage) + finished
    // are disjoint buckets by construction, so the sum never double-counts and
    // a ready-made (finished) purchase is valued like any other stock.
    const value = stages.raw.value + stages.atProcessor.value + stages.finished.value;
    // Average purchase rate for display (weighted across every batch on hand)
    const onHandPcs = stages.raw.pcs + stages.atProcessor.pcs + stages.finished.pcs;
    const costPerPiece = onHandPcs > 0 ? value / onHandPcs : 0;
    return {
      ...m,
      categoryName: getCategoryName(m.categoryId),
      costPerPiece,
      value
    };
  }), [materials, categories, batches]);

  const columns: Column<typeof enrichedMaterials[0]>[] = [
    {
      key: "name",
      label: "Material",
      sortable: true,
      render: (item) => (
        <Link to={`/materials/${item.id}`} className="group-hover:text-muted-foreground transition-colors">
          <div className="max-w-[280px]">
            <div className="font-semibold text-foreground" onClick={(e) => e.stopPropagation()}>
              <InlineEditInput
                value={item.name}
                onCommit={(v) => handleEditInline(item.id, 'name', v)}
                className="bg-transparent border-none p-0 h-auto font-semibold focus:ring-1 focus:ring-primary rounded"
                ariaLabel={`Rename material ${item.name}`}
              />
            </div>
            {item.description && <div className="truncate text-xs text-muted-foreground">{item.description}</div>}
          </div>
        </Link>
      )
    },
    {
      key: "code",
      label: "No.",
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs text-muted-foreground">{item.code || '—'}</span>
      ),
    },
    {
      key: "usageType",
      label: "Used as",
      sortable: true,
      render: (item) => {
        const isComponent = item.usageType === 'component';
        return (
          <span className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            isComponent ? 'bg-violet-500/10 text-violet-600' : 'bg-emerald-500/10 text-emerald-600',
          )}>
            {isComponent ? 'Part of a product' : 'Product on its own'}
          </span>
        );
      },
    },
    {
      key: "categoryName",
      label: "Category",
      sortable: true,
      render: (item) => (
        <span className={hintClass}>{item.categoryName}</span>
      )
    },
    {
      key: "stockPcs",
      label: "Raw (PCS)",
      align: "right",
      sortable: true,
      render: (item) => <span className="font-semibold text-foreground tabular-nums">{formatNumber(item.stockPcs)}</span>
    },
    {
      key: "processedStockPcs",
      label: "Finished (PCS)",
      align: "right",
      sortable: true,
      render: (item) => <span className="font-semibold text-success tabular-nums">{formatNumber(item.processedStockPcs)}</span>
    },
    {
      key: "value",
      label: "Stock value",
      align: "right",
      sortable: true,
      render: (item) => (
        <div className="text-right tabular-nums">
          <div className="font-semibold text-foreground">{formatCurrency(item.value)}</div>
          {item.costPerPiece > 0 ? (
            <div className={hintClass}>{formatCurrency(item.costPerPiece)} / pc avg</div>
          ) : (
            <div className={hintClass}>No purchases yet</div>
          )}
        </div>
      )
    },
    { 
      key: "status", 
      label: "Status", 
      align: "center", 
      sortable: true,
      render: (item) => (
        <span className={cn(
          "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
          item.status === 'Active' ? "bg-success/10 text-success ring-1 ring-success/20" : "bg-muted text-muted-foreground ring-1 ring-muted-foreground/20"
        )}>
          {item.status}
        </span>
      )
    }
    ,
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (item) => (
        <div className="flex items-center justify-end gap-1">
          <RowActionButton
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditModal(item); }}
            label={`Edit ${item.name}`}
            tone="primary"
          >
            <Pencil />
          </RowActionButton>
          <RowActionButton
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(item); }}
            label={`Delete ${item.name}`}
            tone="destructive"
          >
            <Trash2 />
          </RowActionButton>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Raw Materials</h1>
          <p className="mt-1 text-sm text-muted-foreground">Click a material to see each purchase as its own batch — stock and value come straight from purchase records.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Material
        </button>
      </div>

      <section className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Materials</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(enrichedMaterials.length)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Raw stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {formatNumber(enrichedMaterials.reduce((s, m) => s + (m.stockPcs || 0), 0))}
            <span className="ml-1.5 text-xs font-medium text-muted-foreground">PCS</span>
          </div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Finished stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">
            {formatNumber(enrichedMaterials.reduce((s, m) => s + (m.processedStockPcs || 0), 0))}
            <span className="ml-1.5 text-xs font-medium text-muted-foreground">PCS</span>
          </div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Stock value</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {formatCurrency(enrichedMaterials.reduce((s, m) => s + (m.value || 0), 0))}
          </div>
          <div className={hintClass}>Raw, at processor and finished — at purchase cost</div>
        </div>
      </section>

      {materials.filter((m: any) => m.isOptimistic).length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {materials.filter((m: any) => m.isOptimistic).length} {materials.filter((m: any) => m.isOptimistic).length === 1 ? 'change' : 'changes'} syncing…
        </p>
      )}

      <DataTable
        data={enrichedMaterials}
        columns={columns}
        searchKeys={["name", "code", "categoryName", "description"]}
        searchPlaceholder="Search materials by name, No. or category..."
        persistKey="materials-table"
        defaultSortKey="name"
      />

      <PageModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingMaterial ? 'Edit Material' : 'Add Material'} maxWidth="max-w-3xl">
        <form onSubmit={editingMaterial ? handleEdit : handleCreate} className="space-y-6">
          <div className={fieldGroupClass}>
            <div className="space-y-2">
              <label htmlFor="material-name" className={labelClass}>Material Name *</label>
              <input id="material-name" name="material-name" type="text" required value={name} onChange={e => setName(e.target.value)} autoComplete="off" className={inputClass} placeholder="e.g. Circle 12½ Inch" />
            </div>
            <div className="space-y-2">
              <label htmlFor="material-code" className={labelClass}>No.</label>
              <input id="material-code" name="material-code" type="text" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" className={inputClass} placeholder="e.g. 4 No" />
              <p className={hintClass}>Shown next to the name everywhere, and searchable.</p>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className={labelClass}>This material is used as…</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { v: 'sellable', t: 'A product on its own', d: 'Processing makes it saleable; the Products form links it directly.' },
                { v: 'component', t: 'A part of another product', d: 'A steel dhakkan on a steel jug, a handle. Shaped for assembled products.' },
              ] as const).map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => {
                    setUsageType(o.v);
                    if (o.v === 'component') setProcessingPath('ready_made');
                    else setProcessingPath('full_chain');
                    setFixedStageId('');
                    setAllowedStageIds([]);
                  }}
                  aria-pressed={usageType === o.v}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${usageType === o.v ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
                >
                  <span className={`block text-sm font-medium ${usageType === o.v ? 'text-primary' : 'text-foreground'}`}>{o.t}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{o.d}</span>
                </button>
              ))}
            </div>
            <p className={hintClass}>
              Part materials can still be linked to a product here — this marker only shapes the parts list of assembled products.
            </p>
          </fieldset>
          <div className="space-y-2">
            <label htmlFor="material-category" className={labelClass}>Category *</label>
            <SearchableSelect
              options={categories.map(c => ({ id: c.id, label: c.name }))}
              value={categoryId}
              onChange={handleCategoryChange}
              placeholder="Select Category..."
              required
            />
          </div>
          {usageType !== 'component' && (<>
          <div className="space-y-2">
            <label htmlFor="material-path" className={labelClass}>Processing Path *</label>
            <SearchableSelect
              options={[
                { id: 'full_chain', label: `Through all processors (${sortedStagesForForm.length || 5} stages)` },
                { id: 'single_stage', label: 'One processor only — becomes final product' },
                { id: 'custom_stages', label: 'Selected processors only — pick stages below' },
                { id: 'ready_made', label: 'Ready-made — no processing, straight to stock' },
              ]}
              value={processingPath}
              onChange={(v) => setProcessingPath(v as ProcessingPath)}
              placeholder="Select processing path..."
              required
            />
            <p className={hintClass}>
              {processingPath === 'full_chain' && 'Material goes through every processor in sequence before becoming a final product.'}
              {processingPath === 'single_stage' && 'Material is sent to exactly one processor below; what comes back is the final product.'}
              {processingPath === 'custom_stages' && 'Tick the processors this material passes through (in chain order). What comes back from the LAST ticked processor is the final product.'}
              {processingPath === 'ready_made' && 'Purchased already finished (e.g. lids, handles) — enters sellable stock directly, never dispatched.'}
            </p>
          </div>
          {processingPath === 'custom_stages' && (
            <div className="space-y-2">
              <label className={labelClass}>Selected Processors *</label>
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                {sortedStagesForForm.map(s => (
                  <label key={s.id} className="flex items-center gap-3 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowedStageIds.includes(s.id)}
                      onChange={(e) => setAllowedStageIds(prev =>
                        e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                      )}
                      className="accent-primary"
                    />
                    <span className="text-foreground">{s.sequence}. {s.name}{s.isFinalStage ? ' (Final)' : ''}</span>
                  </label>
                ))}
                {sortedStagesForForm.length === 0 && (
                  <p className={hintClass}>No processor stages configured yet.</p>
                )}
              </div>
              <p className={hintClass}>
                Sends always follow the chain order among the selected processors; the last selected one produces the final product.
              </p>
            </div>
          )}
          {processingPath === 'single_stage' && (
            <div className="space-y-2">
              <label htmlFor="material-fixed-stage" className={labelClass}>The One Processor *</label>
              <select
                id="material-fixed-stage"
                required
                value={fixedStageId}
                onChange={e => setFixedStageId(e.target.value)}
                className={selectClass}
              >
                <option value="">Select the processor stage...</option>
                {sortedStagesForForm.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.isFinalStage ? ' (Final)' : ''}</option>
                ))}
              </select>
            </div>
          )}
          </>)}
          <div className="space-y-2">
            <label htmlFor="material-description" className={labelClass}>Description</label>
            <textarea id="material-description" name="material-description" value={description} onChange={e => setDescription(e.target.value)} className={textareaClass} placeholder="Optional notes" rows={2} />
          </div>
          <div className="space-y-2">
            <label htmlFor="material-status" className={labelClass}>Status</label>
            <SearchableSelect
              options={[
                { id: 'Active', label: 'Active' },
                { id: 'Inactive', label: 'Inactive' },
              ]}
              value={status}
              onChange={(v) => setStatus(v as 'Active' | 'Inactive')}
              placeholder="Select status..."
            />
          </div>
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={closeModal} className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground/80 hover:bg-muted/40 transition-colors">Cancel</button>
            <button type="submit" className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md">{editingMaterial ? 'Save Changes' : 'Save Material'}</button>
          </div>
        </form>
      </PageModal>
    </div>
  );
}
