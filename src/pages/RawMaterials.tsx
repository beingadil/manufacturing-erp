import React, { useState, useMemo } from "react";
import { useERPStore } from "../store/useERPStore";
import { cn } from "../lib/utils";
import { Plus, PackageSearch, X } from "lucide-react";
import { Link } from "react-router-dom";
import { DataTable, Column } from "../components/DataTable";

import { MaterialService } from '../services/MaterialService';
import { toast } from 'sonner';
import { SafeDeleteDialog } from '../components/common/SafeDeleteDialog';

export function RawMaterials() {
  const { materials, categories, purchases, processingSends, processingReceipts, batches, addRawMaterial, removeModuleItem } = useERPStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
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
      setIsModalOpen(false);
      setName("");
      setCategoryId("");
      setDescription("");
      setStatus("Active");
    } catch (error: any) {
      toast.error(error.message || 'Failed to create material');
    }
  };

  const getCategoryName = (id: string) => {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : "Unknown Category";
  };

  const enrichedMaterials = useMemo(() => materials.map(m => ({
    ...m,
    categoryName: getCategoryName(m.categoryId)
  })), [materials, categories]);

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
              <input 
                type="text" 
                defaultValue={item.name}
                className="bg-transparent border-none p-0 h-auto font-semibold focus:ring-1 focus:ring-primary rounded"
                onBlur={(e) => handleEditInline(item.id, 'name', e.target.value)}
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
        <div className="flex items-center justify-end space-x-2">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(item); }}
            className="text-muted-foreground/80 hover:text-destructive transition-colors p-1"
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
          </button>
        </div>
      )
    },
    {
      key: "sync",
      label: "Sync",
      align: "right",
      render: (item: any) => (
        item.isOptimistic ? <span className="flex items-center text-xs text-blue-500 justify-end"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin mr-1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg> Syncing...</span> : <span className="flex items-center text-xs text-green-500 justify-end"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> Synced</span>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Raw Materials</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage raw material items in your inventory.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Material
          </button>
        </div>
      </div>

      <DataTable
        data={enrichedMaterials}
        columns={columns}
        searchKeys={["name", "categoryName", "description"]}
        searchPlaceholder="Search materials by name or category..."
        persistKey="materials-table"
        defaultSortKey="name"
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Add Raw Material</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground/80 hover:text-muted-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 pb-64 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Material Name *</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder="e.g. Circle 6½ Inch" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Category *</label>
                <select required value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors bg-card">
                  <option value="" disabled>Select a category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors" placeholder="Optional notes" rows={2} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Status</label>
                <select required value={status} onChange={e => setStatus(e.target.value as 'Active' | 'Inactive')} className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors bg-card">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground/80 hover:bg-muted/40 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md">Save Material</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
