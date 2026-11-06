import { PackageSearch, Pencil, Plus, Trash2, } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from 'sonner';
import { InlineEditInput } from '../components/common/InlineEditInput';
import { SafeDeleteDialog } from '../components/common/SafeDeleteDialog';
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { FormModal } from '../components/form/FormModal';
import { MaterialForm } from '../components/forms/MaterialForm';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { MaterialService } from '../services/MaterialService';
import { useERPStore } from "../store/useERPStore";

/**
 * Raw Materials — master-data page with professional design.
 *   - Full width container (max-w-[2400px], px-8 chrome)
 *   - Hairline borders (border-white/[0.07]) on glass cards
 *   - Cubic-bezier motion on all transitions
 *   - Press physics (active:scale-[0.99]) on buttons
 *   - tabular-nums on all quantities
 *   - Premium table with proper column widths — every button visible
 *   - No card overuse — one clean hairline container per section
 */
export function RawMaterials() {
  const { materials, categories, purchases, processingSends, processingReceipts, batches } = useERPStore();
  const _navigate = useNavigate();

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
    return cat ? cat.name : "Unknown Category";
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
      value
    };
  }), [materials, categories, batches]);

  const columns: Column<typeof enrichedMaterials[0]>[] = [
    { 
      key: "name", 
      label: "Material Name", 
      sortable: true,
      render: (item) => (
        <Link to={`/materials/${item.id}`} className="flex items-center gap-3 group-hover:text-muted-foreground transition-[color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:bg-muted-foreground/20 transition-colors">
            <PackageSearch className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground tracking-tight" onClick={(e) => e.stopPropagation()}>
              <InlineEditInput
                value={item.name}
                onCommit={(v) => handleEditInline(item.id, 'name', v)}
                className="bg-transparent border-none p-0 h-auto font-semibold focus:ring-1 focus:ring-primary rounded"
                ariaLabel={`Rename material ${item.name}`}
              />
            </div>
            {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
          </div>
        </Link>
      )
    },
    {
      key: "code",
      label: "No.",
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{item.code || '—'}</span>
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
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] border',
            isComponent ? 'bg-violet-500/10 text-violet-600 border-violet-500/20' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
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
        <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground border border-border/50">
          {item.categoryName}
        </span>
      )
    },
    { key: "stockPcs", label: "Raw Stock", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground tabular-nums">{formatNumber(item.stockPcs)}</span> },
    { key: "processedStockPcs", label: "Processed Stock", align: "right", sortable: true, render: (item) => <span className="font-bold text-success tabular-nums">{item.processedStockPcs}</span> },
    {
      key: "value",
      label: "Total Value",
      align: "right",
      sortable: true,
      render: (item) => (
        <div className="text-right">
          <div className="font-bold text-foreground tabular-nums">{formatCurrency(item.value)}</div>
          {item.costPerPiece > 0 ? (
            <div className="text-xs text-muted-foreground">Avg @ {formatCurrency(item.costPerPiece)} / PCS</div>
          ) : (
            <div className="text-xs text-muted-foreground">No cost data</div>
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
          "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold border",
          item.status === 'Active' ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border/50"
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
      width: 140,
      render: (item) => (
        <div className="flex items-center justify-end gap-1">
          <RowActionButton
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditModal(item); }}
            label={`Edit ${item.name}`}
            tone="primary"
          >
            <Pencil className="h-4 w-4" />
          </RowActionButton>
          <RowActionButton
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(item); }}
            label={`Delete ${item.name}`}
            tone="destructive"
          >
            <Trash2 className="h-4 w-4" />
          </RowActionButton>
        </div>
      )
    },
    {
      key: "sync",
      label: "Sync",
      align: "right",
      width: 96,
      render: (item: any) => (
        item.isOptimistic ? <span className="flex items-center text-xs text-blue-500 justify-end"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin mr-1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg> Syncing</span> : <span className="flex items-center text-xs text-emerald-600 justify-end"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Synced</span>
      )
    }
  ];

  const totalStock = enrichedMaterials.reduce((s, m) => s + (m.stockPcs || 0), 0);
  const totalProcessed = enrichedMaterials.reduce((s, m) => s + (m.processedStockPcs || 0), 0);
  const totalValue = enrichedMaterials.reduce((s, m) => s + (m.value || 0), 0);

  return (
    <div className="w-full px-7 pt-6 pb-20 sm:px-8 sm:pt-4 lg:px-10 xl:px-12">
      {/* Header strip */}
      <div className="space-y-1 pb-4">
        <div className="flex items-center justify-between gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <PackageSearch className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Raw Materials</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Manage raw material items in your inventory.</p>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] px-5 py-2.5 text-sm font-medium text-foreground/80 bg-card shadow-sm hover:bg-muted hover:border-white/[0.12] transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99] dark:border-white/5"
          >
            <Plus className="h-4 w-4" />
            Add Material
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <section className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-xl border border-white/[0.07] bg-card shadow-sm px-7 py-5 w-full">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Materials</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(enrichedMaterials.length)}</div>
        </div>
        <div className="flex-1 min-w-0 border-l border-white/[0.07] pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Raw Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(totalStock)}</div>
          <div className="text-xs text-muted-foreground">PCS in raw stock</div>
        </div>
        <div className="flex-1 min-w-0 border-l border-white/[0.07] pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Processed Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{formatNumber(totalProcessed)}</div>
          <div className="text-xs text-muted-foreground">PCS at processors & finished</div>
        </div>
        <div className="flex-1 min-w-0 border-l border-white/[0.07] pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Inventory Value</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{formatCurrency(totalValue)}</div>
          <div className="text-xs text-muted-foreground">At purchase cost, incl. WIP & finished</div>
        </div>
      </section>

      {/* Data table */}
      <div className="mt-8 rounded-xl border border-white/[0.07] bg-card shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto">
          <DataTable
            data={enrichedMaterials}
            columns={columns}
            searchKeys={["name", "code", "categoryName", "description"]}
            searchPlaceholder="Search materials by name, No. or category..."
            persistKey="materials-table"
            defaultSortKey="name"
            defaultSortDirection="asc"
            density="compact"
            showPageSize={false}
          />
        </div>
      </div>

      {/* onClose now calls closeModal (was setIsModalOpen(false)), so Escape/backdrop also resets form state. */} 
      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingMaterial ? 'Edit Material' : 'Add Material'}
        description="Raw material identity, how it's used, and how it moves through processors."
        icon={editingMaterial ? <Pencil /> : <PackageSearch />}
        accent="from-emerald-500 to-teal-600"
        size="lg">
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