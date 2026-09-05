import { Cloud, Layers, Package, Pencil, Plus, RefreshCw, Tags, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { InlineEditInput } from '../components/common/InlineEditInput';
import { SafeDeleteDialog } from '../components/common/SafeDeleteDialog';
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { KpiCard } from '../components/ui/KpiCard';
import { ModalOverlay } from '../components/ui/ModalOverlay';
import { formatNumber } from '../lib/utils';
import { CategoryService } from '../services/CategoryService';
import { useERPStore } from '../store/useERPStore';
import { MaterialCategory } from '../types/erp';

export default function Categories() {
  const { categories, materials, addCategory, updateCategory } = useERPStore();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MaterialCategory | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string; name: string; impactDetails: string[] }>({ isOpen: false, id: '', name: '', impactDetails: [] });

  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  // Escape closes the modal
  useEffect(() => {
    if (!isFormOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormOpen]);

  const handleDeleteClick = (category: MaterialCategory) => {
    const associatedMaterials = materials.filter(m => m.categoryId === category.id);
    const impactDetails: string[] = [];
    if (associatedMaterials.length > 0) {
      impactDetails.push(`${associatedMaterials.length} materials are currently assigned to this category.`);
    }

    setDeleteDialog({
      isOpen: true,
      id: category.id,
      name: category.name,
      impactDetails
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteDialog.id) return;

    try {
      CategoryService.delete(deleteDialog.id);
      toast.success('Category deleted successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete category');
    }
  };

  const handleEditInline = async (id: string, field: string, value: string) => {
    const category = categories.find(c => c.id === id);
    if (!category || category[field as keyof MaterialCategory] === value) return;

    try {
      CategoryService.update(id, { [field]: value });
      toast.success('Category updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update category');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      updateCategory(editingCategory.id, formData);
    } else {
      addCategory({ ...formData, status: 'Active' });
    }
    closeForm();
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
    setFormData({ name: '', description: '' });
  };

  const editCategory = (category: MaterialCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || ''
    });
    setIsFormOpen(true);
  };

  const enriched = useMemo(() => categories.map(c => ({
    ...c,
    materialsCount: materials.filter(m => m.categoryId === c.id).length
  })), [categories, materials]);

  const uncategorized = materials.filter(m => !m.categoryId || !categories.some(c => c.id === m.categoryId)).length;

  const columns: Column<typeof enriched[0]>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Tags className="h-4 w-4" />
          </div>
          <InlineEditInput
            value={item.name}
            onCommit={(v) => handleEditInline(item.id, 'name', v)}
            className="font-medium text-foreground bg-transparent border-none p-0 focus:ring-1 focus:ring-primary rounded"
            ariaLabel={`Rename category ${item.name}`}
          />
        </div>
      )
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      render: (item) => (
        <InlineEditInput
          value={item.description || ''}
          onCommit={(v) => handleEditInline(item.id, 'description', v)}
          className="text-muted-foreground bg-transparent border-none p-0 focus:ring-1 focus:ring-primary rounded w-full max-w-xs"
          placeholder="Add description..."
          ariaLabel={`Edit description for ${item.name}`}
        />
      )
    },
    {
      key: "materialsCount",
      label: "Materials",
      align: "center",
      sortable: true,
      render: (item) => (
        <span className="inline-flex items-center justify-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground tabular-nums">
          {item.materialsCount}
        </span>
      )
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (item) => (
        <div className="flex items-center justify-end gap-1">
          <RowActionButton
            onClick={() => editCategory(item)}
            label={`Edit ${item.name}`}
            tone="primary"
          >
            <Pencil />
          </RowActionButton>
          <RowActionButton
            onClick={() => handleDeleteClick(item)}
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
      label: "Sync Status",
      align: "right",
      render: (item: any) => (
        item.isOptimistic ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-500 ring-1 ring-blue-500/20">
            <RefreshCw className="h-3 w-3 animate-spin" /> Syncing
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success ring-1 ring-success/20">
            <Cloud className="h-3 w-3" /> Synced
          </span>
        )
      )
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <SafeDeleteDialog
        isOpen={deleteDialog.isOpen}
        itemName={deleteDialog.name}
        itemType="Category"
        impactDetails={deleteDialog.impactDetails}
        requiresAuth={deleteDialog.impactDetails.length > 0}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialog({ ...deleteDialog, isOpen: false })}
      />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
            <Tags className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Material Categories</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage raw material categories for inventory</p>
          </div>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Category
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total Categories"
          value={formatNumber(categories.length)}
          icon={<Tags className="h-5 w-5" />}
          iconClassName="text-indigo-500"
          size="sm"
        />
        <KpiCard
          label="Materials in System"
          value={formatNumber(materials.length)}
          icon={<Package className="h-5 w-5" />}
          iconClassName="text-blue-500"
          size="sm"
          description="Raw materials across all categories"
        />
        <KpiCard
          label="Uncategorized Materials"
          value={formatNumber(uncategorized)}
          icon={<Layers className="h-5 w-5" />}
          iconClassName={uncategorized > 0 ? 'text-warning' : 'text-success'}
          size="sm"
          description={uncategorized > 0 ? 'Assign these to a category' : 'All materials are categorized'}
        />
      </div>

      <DataTable
        data={enriched}
        columns={columns}
        searchKeys={["name", "description"]}
        searchPlaceholder="Search categories..."
        emptyStateMessage="No categories yet"
        emptyStateHint="Create your first category to start organizing raw materials."
        persistKey="categories-table"
        defaultSortKey="name"
      />

      {isFormOpen && (
        <ModalOverlay onClose={closeForm} closeOnBackdropClick overlayClassName="animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-violet-500/10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                  {editingCategory ? <Pencil className="h-4 w-4" /> : <Tags className="h-4 w-4" />}
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="text-muted-foreground/80 hover:text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Category Name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="e.g. Metals, Plastics, etc."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Description (Optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="Additional details about this category..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground/80 hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md"
                >
                  {editingCategory ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </ModalOverlay>
      )}
    </div>
  );
}
