import { FileText, Layers, Package, PackageCheck, Pencil, Plus, Trash2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DeleteConfirmationModal } from "../components/DeleteConfirmationModal";
import { DatePicker } from '../components/ui/date-picker';
import { FormField } from '../components/form/FormField';
import { FormFooter } from '../components/form/FormFooter';
import { FormGrid } from '../components/form/FormGrid';
import { FormModal } from '../components/form/FormModal';
import { FormSection } from '../components/form/FormSection';
import { formInputClass } from '../components/form/formStyles';
import { QuickAddMaterial } from "../components/QuickAddModals";
import { SearchableSelect } from "../components/SearchableSelect";
import { isManufacturingEnabled, lotAverageCost, lotStockForProduct, buildableQty, consumeComponentsForManufacturing } from "../lib/business/ManufacturingService";
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";
import type { ProductComponent, ProductUsageType } from "../types/erp";

export function FinishedGoods() {
  const { products, materials, categories, sales, batches, finishedGoodsLots, manufacturingOrders, stateSchemaVersion, addProduct, updateModuleItem, removeModuleItem, produceForProduct } = useERPStore();
  const navigate = useNavigate();

  const v4 = isManufacturingEnabled({ stateSchemaVersion });
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
  const [producing, setProducing] = useState<any | null>(null);
  const [produceForm, setProduceForm] = useState({ qty: '', productionCost: '0', date: new Date().toISOString().slice(0, 10), remarks: '' });

  const { name, sku:_sku, sellingPrice, materialId, description } = formData;

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
    // A simple product stores only `materialId` and has no `components` list.
    // Seeding it from that material keeps the form (which is components-driven)
    // from opening empty and refusing to save an untouched product.
    const existingComponents: ProductComponent[] = (product.components ?? []).length > 0
      ? (product.components ?? []).map((c: ProductComponent) => ({ ...c }))
      : product.materialId
        ? [{ materialId: product.materialId, quantity: 1, sortOrder: 1 }]
        : [];
    setComponents(existingComponents);
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
      bomVersion: editingProduct ? (editingProduct.bomVersion ?? 1) + 1 : 1,
      stockModel: 'manufactured' as const,
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
      toast.error(`Cannot delete — this product is referenced by ${saleCount} sale record(s). Deactivate it instead if it is no longer sold.`);
      setDeleteModal({ isOpen: false, id: '', no: '' });
      return;
    }
    const orderCount = (manufacturingOrders || []).filter(o => o.productId === deleteModal.id).length;
    const lotCount = (finishedGoodsLots || []).filter(l => l.productId === deleteModal.id).length;
    if (orderCount > 0 || lotCount > 0) {
      toast.error(
        `Cannot delete — this product is referenced by ${orderCount} manufacturing order(s) and ${lotCount} finished-goods lot(s). ` +
        'Its production history must stay intact.',
      );
      setDeleteModal({ isOpen: false, id: '', no: '' });
      return;
    }
    removeModuleItem('products', deleteModal.id);
    toast.success('Product deleted successfully');
    setDeleteModal({ isOpen: false, id: '', no: '' });
  };

  const openProduce = (item: any) => {
    setProducing(item);
    setProduceForm({
      qty: String(item.buildable),
      productionCost: '0',
      date: new Date().toISOString().slice(0, 10),
      remarks: '',
    });
  };

  const produceQty = Math.round(Number(produceForm.qty));
  const produceQtyError = !producing
    ? ''
    : !Number.isFinite(produceQty) || produceQty <= 0
      ? 'Enter a whole number greater than zero.'
      : produceQty > producing.buildable
        ? `Cannot exceed ${formatNumber(producing.buildable)} PCS — parts are short for more.`
        : '';

  // Live unit-cost estimate for the chosen quantity (component costs at FIFO).
  const produceUnitCost = useMemo(() => {
    if (!producing || !Number.isFinite(produceQty) || produceQty <= 0) return null;
    const reqs = (producing.buildableLines || []).map((l: any) => ({
      materialId: l.materialId,
      pcs: l.quantityPerUnit * produceQty,
    }));
    if (reqs.length === 0) return null;
    try {
      const drawn = consumeComponentsForManufacturing(batches || [], reqs);
      return drawn.totalCost / produceQty;
    } catch {
      return null;
    }
  }, [producing, produceQty, batches]);

  const handleProduce = (e: React.FormEvent) => {
    e.preventDefault();
    if (!producing) return;
    if (produceQtyError) return;
    try {
      const result = produceForProduct({
        productId: producing.id,
        finishedQty: produceQty,
        date: produceForm.date,
        productionCost: Number(produceForm.productionCost) || 0,
        remarks: produceForm.remarks.trim() || undefined,
      });
      toast.success(`${producing.name}: ${formatNumber(result.finishedQty)} PCS produced — ${result.lotNo || 'lot'} posted.`);
      setProducing(null);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not produce.');
    }
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
    const built = v4 ? buildableQty(p, batches || []) : { buildable: 0, lines: [] };
    return {
      ...p,
      categoryName: cat?.name || '-',
      materialName: m?.name || 'Unknown',
      availableStock: v4
        ? lotStockForProduct(finishedGoodsLots || [], p.id)
        : (m?.processedStockPcs || 0),
      averageCost: v4 ? lotAverageCost(finishedGoodsLots || [], p.id) : 0,
      stockValue: v4
        ? lotStockForProduct(finishedGoodsLots || [], p.id) * lotAverageCost(finishedGoodsLots || [], p.id)
        : 0,
      bomLines: p.usageType === 'assembled' && (p.components?.length ?? 0) > 0
        ? p.components!.length
        : (p.materialId ? 1 : 0),
      bomVersion: p.bomVersion ?? 1,
      buildable: built.buildable,
      buildableLines: built.lines.map(line => ({
        ...line,
        materialName: materials.find(mat => mat.id === line.materialId)?.name || '?',
      })),
    };
  }), [products, materials, categories, finishedGoodsLots, v4, batches]);

  const canProduceAny = enrichedProducts.filter(p => (p.buildable || 0) > 0).length;
  const readyToMakeTotal = enrichedProducts.reduce((sum, p) => sum + (p.buildable || 0), 0);


  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Products</h2>
            <p className="text-sm text-muted-foreground mt-0.5">What's ready to make, and one tap turns parts into sellable stock.</p>
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
          <div className="text-xs text-muted-foreground">{v4 ? 'With finished-goods lots' : 'With processed stock'}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Finished Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-sky-500">{formatNumber(enrichedProducts.reduce((s, p) => s + (p.availableStock || 0), 0))}</div>
          <div className="text-xs text-muted-foreground">PCS ready to sell</div>
        </div>
        {v4 && (
          <div className="border-l border-border/60 pl-10">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ready to make</div>
            <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-emerald-500">{formatNumber(readyToMakeTotal)}</div>
            <div className="text-xs text-muted-foreground">{canProduceAny} {canProduceAny === 1 ? 'product' : 'products'} possible</div>
          </div>
        )}
        {v4 && (
          <div className="border-l border-border/60 pl-10">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Stock Value</div>
            <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatCurrency(enrichedProducts.reduce((s, p) => s + (p.stockValue || 0), 0))}</div>
            <div className="text-xs text-muted-foreground">At produced cost</div>
          </div>
        )}
      </section>

      {/* ── Product register — rows open the product detail page; Produce stays one tap ── */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,auto)] gap-2 border-b border-border/60 bg-muted/30 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
          <div>Product</div>
          <div>Category</div>
          <div className="text-right">On hand</div>
          <div className="text-right">Ready to make</div>
          <div className="text-right">Price</div>
          <div />
        </header>
        {enrichedProducts.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">No products yet — add one to start the factory floor.</div>
        )}
        <ul className="divide-y divide-border/50">
          {enrichedProducts.map(item => {
            const canMake = v4 && (item.buildable || 0) > 0;
            const zeroLines = v4 ? (item.buildableLines || []).filter((l: any) => l.lineBuildable === 0) : [];
            return (
              <li
                key={item.id}
                tabIndex={0}
                role="link"
                aria-label={`Open ${item.name}`}
                onClick={(e) => {
                  const t = e.target as HTMLElement;
                  if (t.closest('button, a, input, select, textarea, [role="combobox"]')) return;
                  navigate(`/products/${item.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/products/${item.id}`); }
                }}
                className="cursor-pointer border-l-2 border-l-transparent px-4 py-4 transition-colors hover:border-l-primary/60 hover:bg-muted/40 sm:px-5"
              >
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,auto)] lg:items-center lg:gap-2">
                  {/* Identity */}
                  <div className="col-span-2 min-w-0 lg:col-span-1">
                    <div className="font-medium leading-snug text-foreground">{item.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.sku || '—'} · BOM v{item.bomVersion} · {item.bomLines} line{item.bomLines === 1 ? '' : 's'}</div>
                  </div>
                  {/* Category */}
                  <div className="min-w-0 text-sm text-muted-foreground lg:self-center">{item.categoryName}</div>
                  {/* On hand */}
                  <div className="min-w-0 text-right lg:self-center">
                    <div className={item.availableStock > 0 ? 'font-bold tabular-nums text-success' : 'tabular-nums text-muted-foreground'}>
                      {formatNumber(item.availableStock)} <span className="text-[10px] font-semibold uppercase">PCS</span>
                    </div>
                    {v4 && item.availableStock > 0 && (
                      <div className="text-[10px] tabular-nums text-muted-foreground">{formatCurrency(item.stockValue)}</div>
                    )}
                  </div>
                  {/* Ready to make */}
                  {v4 && (
                    <div className="min-w-0 text-right lg:self-center">
                      {canMake ? (
                        <span className="text-lg font-bold tabular-nums text-emerald-500">{formatNumber(item.buildable)}</span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-semibold tabular-nums text-muted-foreground">0</span>
                          {zeroLines.length > 0 && (
                            <span className="text-[9px] leading-tight text-muted-foreground/70">
                              need {zeroLines.map((l: any) => `${l.materialName} (${l.available}/${l.quantityPerUnit})`).join(' · ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Price */}
                  <div className="min-w-0 text-right lg:self-center">
                    <div className="tabular-nums font-medium text-foreground">{formatCurrency(item.sellingPrice)}</div>
                    {v4 && item.averageCost > 0 && (
                      <div className="text-[10px] tabular-nums text-muted-foreground">{formatCurrency(item.averageCost)} / pc</div>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1.5 lg:col-span-1">
                    {v4 && (
                      <button
                        type="button"
                        onClick={() => openProduce(item)}
                        disabled={!canMake}
                        title={canMake ? `Produce ${formatNumber(item.buildable)} PCS of ${item.name}` : 'Parts are short — nothing can be made yet'}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        Produce
                      </button>
                    )}
                    <button onClick={() => openEditModal(item)} aria-label={`Edit ${item.name}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteModal({ isOpen: true, id: item.id, no: item.name })} aria-label={`Delete ${item.name}`} className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', no: '' })}
        onConfirm={handleDelete}
        title="Delete Product"
        recordNo={deleteModal.no}
        description="Are you sure you want to permanently delete this product? This cannot be undone."
      />

      {/* ── Produce modal: exactly one tap of judgment, nothing else ── */}
      <FormModal
        isOpen={!!producing}
        onClose={() => setProducing(null)}
        title={producing ? `Produce ${producing.name}` : 'Produce'}
        description="Parts go out of stock, finished-goods lots go in. One voucher posts it all."
        icon={<PackageCheck />}
        size="md"
        accent="from-emerald-500 to-green-700"
        footer={
          <FormFooter
            onCancel={() => setProducing(null)}
            formId="produce-form"
            submitLabel={produceQty > 0 ? `Produce ${formatNumber(produceQty)} PCS` : 'Produce'}
          />
        }
      >
        {producing && (
          <form id="produce-form" onSubmit={handleProduce} className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ready to make</div>
                <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(producing.buildable)} <span className="text-sm font-semibold text-muted-foreground">PCS</span></div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit cost</div>
                <div className="text-sm font-semibold tabular-nums text-foreground">{produceUnitCost != null ? formatCurrency(produceUnitCost) : '—'}</div>
                <div className="text-[10px] text-muted-foreground">at current part cost</div>
              </div>
            </div>

            <FormGrid cols={2}>
              <FormField id="produce-qty" label="Quantity to produce (PCS)" required hint={produceQtyError || `Max ${formatNumber(producing.buildable)} PCS at current parts stock`}>
                <input
                  id="produce-qty"
                  type="number"
                  min={1}
                  max={producing.buildable}
                  step={1}
                  required
                  autoFocus
                  value={produceForm.qty}
                  onChange={e => setProduceForm({ ...produceForm, qty: e.target.value })}
                  className={cn(formInputClass, produceQtyError && 'border-destructive focus:border-destructive')}
                />
              </FormField>
              <FormField id="produce-date" label="Date" required>
                <DatePicker id="produce-date" value={produceForm.date} onChange={value => setProduceForm({ ...produceForm, date: value })} className="h-[42px] w-full" />
              </FormField>
            </FormGrid>

            <FormField id="produce-cost" label="Conversion cost (optional)">
              <input
                id="produce-cost"
                type="number"
                min={0}
                step="0.01"
                value={produceForm.productionCost}
                onChange={e => setProduceForm({ ...produceForm, productionCost: e.target.value })}
                className={formInputClass}
                placeholder="0.00 — production labor & overhead"
              />
            </FormField>

            <FormField id="produce-remarks" label="Remarks">
              <textarea
                id="produce-remarks"
                rows={2}
                value={produceForm.remarks}
                onChange={e => setProduceForm({ ...produceForm, remarks: e.target.value })}
                className={formInputClass}
                placeholder="Anything worth noting on this run of parts"
              />
            </FormField>
          </form>
        )}
      </FormModal>

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
            formId="product-form"
            submitLabel={editingProduct ? 'Save Changes' : 'Save Product'}
          />
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="space-y-5">
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
