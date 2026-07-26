import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Tags, Edit } from 'lucide-react';
import { useERPStore } from '../store/useERPStore';
import { MaterialCategory } from '../types/erp';
import { DataTable, Column } from "../components/DataTable";

import { CategoryService } from '../services/CategoryService';
import { toast } from 'sonner';
import { SafeDeleteDialog } from '../components/common/SafeDeleteDialog';
import { Cloud, RefreshCw } from 'lucide-react';

export default function Categories() {
  const { categories, materials, addCategory, updateCategory, removeModuleItem } = useERPStore();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MaterialCategory | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string; name: string; impactDetails: string[] }>({ isOpen: false, id: '', name: '', impactDetails: [] });


  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  const handleDeleteClick = (category: MaterialCategory) => {
    const associatedMaterials = materials.filter(m => m.categoryId === category.id);
    const impactDetails = [];
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

  const columns: Column<MaterialCategory>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (item) => (
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-500/10 p-2 rounded-lg">
            <Tags className="w-5 h-5 text-primary" />
          </div>
          <input
            type="text"
            className="font-medium text-foreground bg-transparent border-none p-0 focus:ring-1 focus:ring-primary rounded"
            defaultValue={item.name}
            onBlur={(e) => handleEditInline(item.id, 'name', e.target.value)}
          />
        </div>
      )
    },
    { key: "description", label: "Description", sortable: true, render: (item) => (
      <input
        type="text"
        className="text-muted-foreground bg-transparent border-none p-0 focus:ring-1 focus:ring-primary rounded w-full"
        defaultValue={item.description || ''}
        placeholder="Add description..."
        onBlur={(e) => handleEditInline(item.id, 'description', e.target.value)}
      />
    ) },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (item) => (
        <div className="flex items-center justify-end space-x-2">
          <button
            onClick={() => handleDeleteClick(item)}
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
        label: "Sync Status",
        align: "right",
        render: (item: any) => (
          item.isOptimistic ? <span className="flex items-center text-xs text-blue-500 justify-end"><RefreshCw className="w-3 h-3 animate-spin mr-1"/> Syncing...</span> : <span className="flex items-center text-xs text-green-500 justify-end"><Cloud className="w-3 h-3 mr-1"/> Synced</span>
        )
      }
  ];

  return (
    <div className="space-y-6 pb-10">
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
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Material Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage raw material categories for inventory</p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>New Category</span>
        </button>
      </div>

      <DataTable
        data={categories}
        columns={columns}
        searchKeys={["name", "description"]}
        searchPlaceholder="Search categories..."
        persistKey="categories-table"
        defaultSortKey="name"
      />

      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-xl shadow-xl max-w-md w-full p-6"
          >
            <h2 className="text-xl font-semibold mb-4">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. Metals, Plastics, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Additional details about this category..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-muted-foreground hover:bg-muted/40 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  {editingCategory ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
