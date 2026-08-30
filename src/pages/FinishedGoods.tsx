import { Boxes, Package, Pencil, Plus, Trash2, } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { DeleteConfirmationModal } from "../components/DeleteConfirmationModal";
import { QuickAddMaterial } from "../components/QuickAddModals";
import { SearchableSelect } from "../components/SearchableSelect";
import { KpiCard } from '../components/ui/KpiCard';
import { formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";
import { PageModal } from "../components/ui/PageModal";

export function FinishedGoods() {
  const { products, materials, categories, sales, addProduct, updateModuleItem, removeModuleItem } = useERPStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; no: string }>({ isOpen: false, id: "", no: "" });

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setName(product.name);
    setMaterialId(product.materialId || "");
    setSellingPrice(product.sellingPrice != null ? String(product.sellingPrice) : "");
    setSku(product.sku || "");
    setDescription(product.description || "");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setName("");
    setMaterialId("");
    setSellingPrice("");
    setSku("");
    setDescription("");
  };

  // Category is inherited from the linked material — never entered separately.
  const linkedMaterial = materials.find(m => m.id === materialId);
  const categoryId = linkedMaterial?.categoryId || "";

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !materialId || !sellingPrice) return;

    addProduct({
      name,
      materialId,
      categoryId,
      sellingPrice: parseFloat(sellingPrice),
      sku: sku.trim() || undefined,
      description
    });

    toast.success('Product created successfully');
    closeModal();
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !name || !materialId || !sellingPrice) return;

    try {
      updateModuleItem('products', editingProduct.id, {
        name,
        materialId,
        categoryId,
        sellingPrice: parseFloat(sellingPrice),
        sku: sku.trim() || undefined,
        description
      });
      toast.success('Product updated successfully');
      closeModal();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update product');
    }
  };

  const handleDelete = () => {
    const saleCount = sales.filter(s => s.productId === deleteModal.id).length;
    if (saleCount > 0) {
      toast.error(`Cannot delete — this product is referenced by ${saleCount} sale record(s). Deactivate it instead if it is no longer sold.`);
      setDeleteModal({ isOpen: false, id: '', no: '' });
      return;
    }
    removeModuleItem('products', deleteModal.id);
    toast.success('Product deleted successfully');
    setDeleteModal({ isOpen: false, id: '', no: '' });
  };

  const enrichedProducts = useMemo(() => products.map(p => {
    const m = materials.find(mat => mat.id === p.materialId);
    const cat = categories.find(c => c.id === (m?.categoryId || p.categoryId));
    return {
      ...p,
      categoryName: cat?.name || '-',
      materialName: m?.name || 'Unknown',
      availableStock: m?.processedStockPcs || 0
    };
  }), [products, materials, categories]);

  const columns: Column<typeof enrichedProducts[0]>[] = [
    { key: "name", label: "Product Name", sortable: true, render: (item) => <span className="font-medium">{item.name}</span> },
    { key: "sku", label: "SKU", sortable: true, render: (item) => <span className="font-mono text-xs text-muted-foreground">{item.sku || '—'}</span> },
    { key: "categoryName", label: "Category", sortable: true },
    { key: "materialName", label: "Linked Material", sortable: true },
    { key: "sellingPrice", label: "Selling Price (PKR)", align: "right", sortable: true, render: (item) => <span className="font-medium">{formatCurrency(item.sellingPrice)}</span> },
    { key: "availableStock", label: "Available Stock (PCS)", align: "right", sortable: true, render: (item) => <span className="font-bold text-success">{item.availableStock}</span> },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (item) => (
        <div className="flex items-center justify-end gap-1">
          <RowActionButton
            onClick={() => openEditModal(item)}
            label={`Edit ${item.name}`}
            tone="primary"
          >
            <Pencil />
          </RowActionButton>
          <RowActionButton
            onClick={() => setDeleteModal({ isOpen: true, id: item.id, no: item.name })}
            label={`Delete ${item.name}`}
            tone="destructive"
          >
            <Trash2 />
          </RowActionButton>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Products</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Manage final products linked to raw materials.</p>
          </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total Products"
          value={formatNumber(enrichedProducts.length)}
          icon={<Package className="h-5 w-5" />}
          iconClassName="text-sky-500"
          size="sm"
        />
        <KpiCard
          label="Products In Stock"
          value={formatNumber(enrichedProducts.filter(p => (p.availableStock || 0) > 0).length)}
          icon={<Boxes className="h-5 w-5" />}
          iconClassName="text-blue-500"
          size="sm"
          description="Products with processed stock available"
        />
        <KpiCard
          label="Total Available Stock"
          value={formatNumber(enrichedProducts.reduce((s, p) => s + (p.availableStock || 0), 0))}
          icon={<Boxes className="h-5 w-5" />}
          iconClassName="text-sky-500"
          size="sm"
          description="PCS of finished goods ready to sell"
        />
      </div>

      <DataTable
        data={enrichedProducts}
        columns={columns}
        searchKeys={["name", "sku", "categoryName", "materialName"]}
        searchPlaceholder="Search products..."
        persistKey="products-table"
        defaultSortKey="name"
      />

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', no: '' })}
        onConfirm={handleDelete}
        title="Delete Product"
        recordNo={deleteModal.no}
        description="Are you sure you want to permanently delete this product? This cannot be undone."
      />

      <PageModal isOpen={isModalOpen && !isAddMaterialOpen} onClose={closeModal} title={editingProduct ? 'Edit Product' : 'Add Finished Product'}>
              <form onSubmit={editingProduct ? handleEdit : handleCreate} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <input type="text" required placeholder="Product Name" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="SKU (Optional)" value={sku} onChange={e => setSku(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
                <input type="number" step="0.01" required placeholder="Selling Price (PKR)" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              </div>

              <div>
                <SearchableSelect 
                  options={materials.map(m => ({ id: m.id, label: m.name }))}
                  value={materialId}
                  onChange={setMaterialId}
                  placeholder="Select Linked Material..."
                  onAdd={() => setIsAddMaterialOpen(true)}
                  required
                />
              </div>

              {linkedMaterial && (
                <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category (from material)</span>
                    <span className="font-medium text-foreground">{categories.find(c => c.id === linkedMaterial.categoryId)?.name || '—'}</span>
                  </div>
                </div>
              )}
              
              <input type="text" placeholder="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">{editingProduct ? 'Save Changes' : 'Save Product'}</button>
            </form>
            </PageModal>

      <QuickAddMaterial 
        isOpen={isAddMaterialOpen} 
        onClose={() => setIsAddMaterialOpen(false)} 
        onSuccess={(id) => setMaterialId(id)} 
      />
    </div>
  );
}
