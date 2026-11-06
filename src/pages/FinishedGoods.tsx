import { FileText, Layers, Package, Pencil, Plus, Trash2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { DeleteConfirmationModal } from "../components/DeleteConfirmationModal";
import { FormField } from '../components/form/FormField';
import { FormFooter } from '../components/form/FormFooter';
import { FormGrid } from '../components/form/FormGrid';
import { FormModal } from '../components/form/FormModal';
import { FormSection } from '../components/form/FormSection';
import { formInputClass } from '../components/form/formStyles';
import { QuickAddMaterial } from "../components/QuickAddModals";
import { SearchableSelect } from "../components/SearchableSelect";
import { formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";
import type { ProductComponent, ProductUsageType } from "../types/erp";

export function FinishedGoods() {
  const { products, materials, categories, sales, addProduct, updateModuleItem, removeModuleItem } = useERPStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    sku: string;
    sellingPrice: string;
    usageType: ProductUsageType;
    materialId: string;
    description: string;
  }>({
    name: '',
    sku: '',
    sellingPrice: '',
    usageType: 'simple',
    materialId: '',
    description: '',
  });
  const [components, setComponents] = useState<ProductComponent[]>([]);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; no: string }>({ isOpen: false, id: '', no: '' });

  const { name, sku:_sku, sellingPrice, usageType, materialId, description } = formData;

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku || '',
      sellingPrice: product.sellingPrice != null ? String(product.sellingPrice) : '',
      usageType: product.usageType === 'assembled' ? 'assembled' : 'simple',
      materialId: product.materialId || '',
      description: product.description || '',
    });
    setComponents((product.components ?? []).map((c: ProductComponent) => ({ ...c })));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData({
      name: '',
      sku: '',
      sellingPrice: '',
      usageType: 'simple',
      materialId: '',
      description: '',
    });
    setComponents([]);
  };

  // Category is inherited from the linked material — never entered separately.
  const linkedMaterial = materials.find(m => m.id === materialId);
  const _categoryId = linkedMaterial?.categoryId || '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sellingPrice) {
      return toast.error('Product Name and Selling Price are required.');
    }
    if (components.length === 0) {
      return toast.error('Pick at least one material this product takes.');
    }
    const isAssembled = components.length > 1;
    const catFromLinked = isAssembled
      ? ''
      : categories.find(c => c.id === materials.find(m => m.id === components[0].materialId)?.categoryId)?.id || '';

    const payload = {
      name: name.trim(),
      materialId: isAssembled ? undefined : components[0].materialId,
      usageType: (isAssembled ? 'assembled' : 'simple') as ProductUsageType,
      components: isAssembled ? components : undefined,
      categoryId: catFromLinked,
      sellingPrice: parseFloat(sellingPrice),
      sku: editingProduct?.sku || undefined,
      description,
    };

    try {
      if (editingProduct) {
        updateModuleItem('products', editingProduct.id, payload);
        toast.success('Product updated successfully');
      } else {
        addProduct(payload);
        toast.success('Product created successfully');
      }
      closeModal();
    } catch (error: any) {
      return toast.error(error.message || 'Failed to save product');
    }
  };


  const handleDelete = () => {
    const saleCount = sales.filter(s => s.productId === deleteModal.id).length;
    if (saleCount > 0) {
      toast.error('Cannot delete — this product is referenced by ${saleCount} sale record(s). Deactivate it instead if it is no longer sold.');
      setDeleteModal({ isOpen: false, id: '', no: '' });
      return;
    }
    removeModuleItem('products', deleteModal.id);
    toast.success('Product deleted successfully');
    setDeleteModal({ isOpen: false, id: '', no: '' });
  };

  const _componentMaterials = materials.filter(m => m.usageType === 'component' && m.status !== 'Inactive');
  const _sellableMaterials = materials.filter(m => m.usageType !== 'component' && m.status !== 'Inactive');

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

  const _isAssembled = usageType === 'assembled';

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

      <section className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Products</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(enrichedProducts.length)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">In Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(enrichedProducts.filter(p => (p.availableStock || 0) > 0).length)}</div>
          <div className="text-xs text-muted-foreground">With processed stock</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Available Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-sky-500">{formatNumber(enrichedProducts.reduce((s, p) => s + (p.availableStock || 0), 0))}</div>
          <div className="text-xs text-muted-foreground">PCS ready to sell</div>
        </div>
      </section>

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

      <FormModal
        isOpen={isModalOpen && !isAddMaterialOpen}
        onClose={closeModal}
        title={editingProduct ? 'Edit Product' : 'Add Finished Product'}
        description="Manage final products linked to raw materials."
        icon={editingProduct ? <Pencil /> : <Package />}
        size="lg"
        accent="from-sky-500 to-blue-600"
        footer={
          <FormFooter
            onCancel={closeModal}
            submitLabel={editingProduct ? 'Save Changes' : 'Save Product'}
          />
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <FormSection icon={<Package />} eyebrow="Product Identity" first>
            <FormGrid cols={2}>
              <FormField id="product-name" label="Product Name" required>
                <input
                  id="product-name"
                  name="product-name"
                  type="text"
                  required
                  autoComplete="off"
                  value={name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className={formInputClass}
                  placeholder="e.g. Steel Jug 8 Litre"
                />
              </FormField>
              <FormField id="product-price" label="Selling Price (PKR)" required>
                <input
                  id="product-price"
                  name="product-price"
                  type="number"
                  step="0.01"
                  required
                  autoComplete="off"
                  value={sellingPrice}
                  onChange={e => setFormData({ ...formData, sellingPrice: e.target.value })}
                  className={formInputClass}
                  placeholder="e.g. 1850"
                />
              </FormField>
            </FormGrid>
          </FormSection>


          <FormSection icon={<Layers />} eyebrow="Materials">
            <FormField id="product-materials" label="Materials in this product" required>
              <SearchableSelect
                options={materials
                  .filter(m => m.status !== 'Inactive')
                  .filter(m => !components.some(c => c.materialId === m.id))
                  .map(m => ({ id: m.id, label: m.name, secondaryLabel: m.usageType === 'component' ? `${m.code || ''} · part` : m.code }))}
                value=""
                onChange={addComponent}
                placeholder="Add a material..."
                onAdd={() => setIsAddMaterialOpen(true)}
              />
            </FormField>

            {components.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-foreground/70">
                One entry makes a simple product linked to that material. Add several to assemble a product from multiple materials — the list below takes them in the order you add them.
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

            {(() => {
              const catFromLinked = components.length === 1
                ? categories.find(c => c.id === materials.find(m => m.id === components[0]?.materialId)?.categoryId)?.name
                : undefined;
              return catFromLinked ? (
                <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category (from material)</span>
                    <span className="font-medium text-foreground">{catFromLinked}</span>
                  </div>
                </div>
              ) : null;
            })()}
          </FormSection>

          <FormSection icon={<FileText />} eyebrow="Details">
            <FormGrid cols={2}>
              <FormField id="product-description" label="Description (Optional)" className="sm:col-span-2">
                <textarea
                  id="product-description"
                  name="product-description"
                  placeholder="Description (Optional)"
                  value={description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  autoComplete="off"
                  className={formInputClass}
                  rows={2}
                />
              </FormField>
            </FormGrid>
          </FormSection>
        </form>
      </FormModal>

      <QuickAddMaterial
        isOpen={isAddMaterialOpen}
        onClose={() => setIsAddMaterialOpen(false)}
        onSuccess={(id: string) => setFormData({ ...formData, materialId: id })}
      />
    </div>
  );
}