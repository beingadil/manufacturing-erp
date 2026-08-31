import { Layers, PackageSearch, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from 'sonner';
import { InlineEditInput } from '../components/common/InlineEditInput';
import { SafeDeleteDialog } from '../components/common/SafeDeleteDialog';
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { KpiCard } from '../components/ui/KpiCard';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { MaterialService } from '../services/MaterialService';
import { useERPStore } from "../store/useERPStore";
import { PageModal } from "../components/ui/PageModal";

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
    const impactDetails = [];
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
      impactDetails.push(`This material currently has stock (${material.stockPcs} PCS) or work-in-progress (${material.processedStockPcs} PCS).`);
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
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<'Active' | 'Inactive'>("Active");

  const openEditModal = (material: any) => {
    setEditingMaterial(material);
    setName(material.name);
    setCategoryId(material.categoryId);
    setDescription(material.description || '');
    setStatus(material.status === 'Inactive' ? 'Inactive' : 'Active');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMaterial(null);
    setName("");
    setCategoryId("");
    setDescription("");
    setStatus("Active");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) return;

    try {
      MaterialService.create({
        name,
        categoryId,
        description,
        status
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

    try {
      MaterialService.update(editingMaterial.id, {
        name,
        categoryId,
        description,
        status
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
    // Raw stock value at ACTUAL purchase cost: Σ remainingPcs × batch purchase rate
    const value = stages.raw.value;
    // Average purchase rate for display (weighted across the raw batches on hand)
    const costPerPiece = stages.raw.pcs > 0 ? stages.raw.value / stages.raw.pcs : 0;
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
        <Link to={`/materials/${item.id}`} className="flex items-center gap-3 group-hover:text-muted-foreground transition-colors">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-muted-foreground/20 transition-colors">
            <PackageSearch className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-foreground" onClick={(e) => e.stopPropagation()}>
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
      key: "categoryName", 
      label: "Category", 
      sortable: true,
      render: (item) => (
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {item.categoryName}
        </span>
      )
    },
    { key: "stockPcs", label: "Raw Stock (PCS)", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{item.stockPcs}</span> },
    { key: "processedStockPcs", label: "Processed Stock (PCS)", align: "right", sortable: true, render: (item) => <span className="font-bold text-success">{item.processedStockPcs}</span> },
    {
      key: "value",
      label: "Total Value (PKR)",
      align: "right",
      sortable: true,
      render: (item) => (
        <div className="text-right">
          <div className="font-bold text-foreground">{formatCurrency(item.value)}</div>
          {item.costPerPiece > 0 ? (
            <div className="text-xs text-muted-foreground">Avg purchase rate @ {formatCurrency(item.costPerPiece)} / PCS</div>
          ) : (
            <div className="text-xs text-muted-foreground">No cost data (no purchases yet)</div>
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
    {
      key: "sync",
      label: "Sync",
      align: "right",
      render: (item: any) => (
        item.isOptimistic ? <span className="flex items-center text-xs text-blue-500 justify-end"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin mr-1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg> Syncing</span> : <span className="flex items-center text-xs text-green-500 justify-end"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Synced</span>
      )
    }
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <PackageSearch className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Raw Materials</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Manage raw material items in your inventory.</p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Material
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total Materials"
          value={formatNumber(enrichedMaterials.length)}
          icon={<PackageSearch className="h-5 w-5" />}
          iconClassName="text-emerald-500"
          size="sm"
        />
        <KpiCard
          label="Total Raw Stock"
          value={formatNumber(enrichedMaterials.reduce((s, m) => s + (m.stockPcs || 0), 0))}
          icon={<Layers className="h-5 w-5" />}
          iconClassName="text-teal-500"
          size="sm"
          description="PCS in raw stock across all materials"
        />
        <KpiCard
          label="Total Inventory Value"
          value={formatCurrency(enrichedMaterials.reduce((s, m) => s + (m.value || 0), 0))}
          icon={<Wallet className="h-5 w-5" />}
          iconClassName="text-emerald-500"
          accent="text-success"
          size="sm"
          description="Raw stock valued at actual purchase cost (per batch)"
        />
      </div>

      <DataTable
        data={enrichedMaterials}
        columns={columns}
        searchKeys={["name", "categoryName", "description"]}
        searchPlaceholder="Search materials by name or category..."
        persistKey="materials-table"
        defaultSortKey="name"
      />

      <PageModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingMaterial ? 'Edit Material' : 'Add Material'}>
        <form onSubmit={editingMaterial ? handleEdit : handleCreate} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="material-name" className="text-sm font-semibold text-foreground">Material Name *</label>
            <input id="material-name" name="material-name" type="text" required value={name} onChange={e => setName(e.target.value)} autoComplete="off" className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder="e.g. Circle 6½ Inch" />
          </div>
          <div className="space-y-2">
            <label htmlFor="material-category" className="text-sm font-semibold text-foreground">Category *</label>
            <select id="material-category" name="material-category" required value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors bg-card">
              <option value="" disabled>Select a category</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="material-description" className="text-sm font-semibold text-foreground">Description</label>
            <textarea id="material-description" name="material-description" value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder="Optional notes" rows={2} />
          </div>
          <div className="space-y-2">
            <label htmlFor="material-status" className="text-sm font-semibold text-foreground">Status</label>
            <select id="material-status" name="material-status" required value={status} onChange={e => setStatus(e.target.value as 'Active' | 'Inactive')} className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors bg-card">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
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
