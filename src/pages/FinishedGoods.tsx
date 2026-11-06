import { Boxes, Package, Pencil, Plus, Trash2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { DeleteConfirmationModal } from "../components/DeleteConfirmationModal";
import { QuickAddMaterial } from "../components/QuickAddModals";
import { SearchableSelect } from "../components/SearchableSelect";
import { KpiCard } from '../components/ui/KpiCard';
import { PageModal } from "../components/ui/PageModal";
import { fieldGroupClass, inputClass, labelClass } from '../components/ui/formStyles';
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";
import type { ProductComponent } from "../types/erp";

export function FinishedGoods() {
  const { products, materials, categories, sales, addProduct, updateModuleItem, removeModuleItem } = useERPStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [name, setName] = useState("");
  // A product can be made from one material or several. One material saves as
  // a simple linked product (sold from its finished stock); several save as an
  // assembled product whose sale deducts every material listed below.
  const [components, setComponents] = useState<ProductComponent[]>([]);
  const [sellingPrice, setSellingPrice] = useState("");
  const [description, setDescription] = useState("");
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; no: string }>({ isOpen: false, id: "", no: "" });

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setName(product.name);
    // Simple products (one linked material) load into the same list as
    // assembled ones — the form no longer distinguishes the two.
    const existing = (product.components ?? []).map((c: ProductComponent) => ({ ...c }));
    setComponents(existing.length > 0 ? existing : product.materialId ? [{ materialId: product.materialId, quantity: 1, sortOrder: 1 }] : []);
    setSellingPrice(product.sellingPrice != null ? String(product.sellingPrice) : "");
    setDescription(product.description || "");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setName("");
    setComponents([]);
    setSellingPrice("");
    setDescription("");
  };

  // Category is inherited from the first selected material — never entered separately.
  const primaryMaterial = materials.find(m => m.id === components[0]?.materialId);
  const categoryId = primaryMaterial?.categoryId || "";

  // One material → a normal linked product (sold from that material's finished
  // stock). Two or more → an assembled product; each sale deducts every
  // material in the list by its qty per unit.
  const buildPayload = () => {
    const multi = components.length > 1;
    return {
      name,
      materialId: multi ? undefined : components[0]?.materialId,
      usageType: (multi ? 'assembled' : 'simple') as 'simple' | 'assembled',
      components: multi ? components : undefined,
      categoryId,
      sellingPrice: parseFloat(sellingPrice),
      description,
    };
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sellingPrice) return;
    if (components.length === 0) return toast.error('Pick at least one material this product is made from.');

    try {
      addProduct(buildPayload());
    } catch (error: any) {
      return toast.error(error.message || 'Failed to create product');
    }

    toast.success('Product created successfully');
    closeModal();
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !name || !sellingPrice) return;
    if (components.length === 0) return toast.error('Pick at least one material this product is made from.');

    try {
      updateModuleItem('products', editingProduct.id, buildPayload());
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

  const addComponent = (materialId: string) => {
    if (!materialId) return;
    if (components.some(c => c.materialId === materialId)) {
      toast.error('That material is already in the list.');
      return;
    }
    setComponents(prev => [...prev, { materialId, quantity: 1, sortOrder: prev.length + 1 }]);
  };

  const setComponentQty = (materialId: string, quantity: number) => {
    setComponents(prev => prev.map(c => (c.materialId === materialId ? { ...c, quantity } : c)));
  };

  const removeComponent = (materialId: string) => {
    setComponents(prev => prev.filter(c => c.materialId !== materialId).map((c, i) => ({ ...c, sortOrder: i + 1 })));
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
    { key: "materialName", label: "Made From", sortable: true,
      render: (item) => {
        const assembled = item.usageType === 'assembled' && (item.components?.length ?? 0) > 0;
        if (!assembled) {
          return <span>{item.materialName}</span>;
        }
        const names = item.components!.map(c =>
          materials.find(m => m.id === c.materialId)?.name ?? '?',
        );
        return (
          <span className="text-xs text-foreground">
            {names.join(' + ')}
          </span>
        );
      },
    },
    { key: "sellingPrice", label: "Selling Price (PKR)", align: "right", sortable: true, render: (item) => <span className="font-medium">{formatCurrency(item.sellingPrice)}</span> },
    { key: "availableStock", label: "Available Stock (PCS)", align: "right", sortable: true,
      render: (item) => {
        // An assembled product holds no stock of its own — it is made from the
        // stock of its components, so a single number here would be a fiction.
        if (item.usageType === 'assembled' && (item.components?.length ?? 0) > 0) {
          return <span className="text-xs text-muted-foreground">Made on sale</span>;
        }
        return <span className="font-bold text-success">{item.availableStock}</span>;
      },
    },
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

      <PageModal isOpen={isModalOpen && !isAddMaterialOpen} onClose={closeModal} title={editingProduct ? 'Edit Product' : 'Add Finished Product'} maxWidth="max-w-3xl">
        <form onSubmit={editingProduct ? handleEdit : handleCreate} className="space-y-5">
          <div className={fieldGroupClass}>
            <div className="space-y-1.5">
              <label htmlFor="product-name" className={labelClass}>Product Name</label>
              <input id="product-name" name="product-name" type="text" required placeholder="e.g. Steel Jug 8 Litre" value={name} onChange={e => setName(e.target.value)} autoComplete="off" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="product-price" className={labelClass}>Selling Price</label>
              <input id="product-price" name="product-price" type="number" step="0.01" min="0" required placeholder="e.g. 1850" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className={cn(inputClass, 'tabular-nums')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="product-component" className={labelClass}>Made from these materials *</label>
            <SearchableSelect
              options={materials
                .filter(m => !components.some(c => c.materialId === m.id))
                .map(m => ({
                  id: m.id,
                  label: m.name,
                  secondaryLabel: [m.code, m.status === 'Inactive' ? 'Inactive' : null].filter(Boolean).join(' · ') || undefined,
                }))}
              value=""
              onChange={addComponent}
              placeholder="Add Material..."
              onAdd={() => setIsAddMaterialOpen(true)}
              required={components.length === 0}
            />

            {components.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                Add at least one material. Pick several with quantities to make an assembled product — each sale then deducts every material listed.
              </p>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Material</th>
                        <th className="px-3 py-2 text-right font-medium">Qty per unit</th>
                        <th className="px-3 py-2 text-right font-medium" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {components.map(c => {
                        const m = materials.find(x => x.id === c.materialId);
                        return (
                          <tr key={c.materialId}>
                            <td className="px-3 py-2">
                              <span className="font-medium text-foreground">{m?.name ?? '(deleted material)'}</span>
                              {m?.code && <span className="ml-2 font-mono text-xs text-muted-foreground">{m.code}</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.000001"
                                aria-label={`Quantity of ${m?.name ?? c.materialId} per product`}
                                value={c.quantity}
                                onChange={e => setComponentQty(c.materialId, parseFloat(e.target.value) || 0)}
                                className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeComponent(c.materialId)}
                                aria-label={`Remove ${m?.name ?? c.materialId}`}
                                className="text-muted-foreground/80 hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            {components.length > 1 && (
              <p className="text-xs text-muted-foreground">
                More than one material listed — this product will save as assembled. Each sale deducts the qty per unit of every material above.
              </p>
            )}
          </div>

          {primaryMaterial && (
            <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category (from material)</span>
                <span className="font-medium text-foreground">{categories.find(c => c.id === categoryId)?.name || '—'}</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="product-description" className={labelClass}>Description (optional)</label>
            <input id="product-description" name="product-description" type="text" placeholder="Sizes, finish, anything the shop reads aloud" value={description} onChange={e => setDescription(e.target.value)} autoComplete="off" className={inputClass} />
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary p-3 text-sm font-semibold text-primary-foreground transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.99]">{editingProduct ? 'Save Changes' : 'Save Product'}</button>
        </form>
      </PageModal>

      <QuickAddMaterial
        isOpen={isAddMaterialOpen}
        onClose={() => setIsAddMaterialOpen(false)}
        onSuccess={(id) => addComponent(id)}
      />
    </div>
  );
}
