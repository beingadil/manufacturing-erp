/**
 * Sale Entry — full-page form (routes /sales/new and /sales/edit/:id).
 */
import { ArrowLeft, Check, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { SearchableSelect } from '../components/SearchableSelect';
import { DatePicker } from '../components/ui/date-picker';
import { FormField } from '../components/form/FormField';
import { FormGrid } from '../components/form/FormGrid';
import { FormSection } from '../components/form/FormSection';
import { formInputClass, formFieldLabelClass } from '../components/form/formStyles';
import { adaptiveAmountClass, cn, formatCurrency } from '../lib/utils';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { isAssembled } from '../lib/business/ProductAssemblyService';
import { SalesService } from '../services/SalesService';
import { useERPStore } from '../store/useERPStore';

export default function SalesFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);
  const deepNew = searchParams.get('new') === '1';

  const { sales, products, materials, customers } = useERPStore();

  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pcsSold, setPcsSold] = useState('');
  const [pricePerPiece, setPricePerPiece] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);

  useEffect(() => {
    if (!editId) return;
    const sale = sales.find(s => s.id === editId);
    if (!sale) return;
    setCustomerId(sale.customerId);
    setProductId(sale.productId);
    setDate(sale.date);
    setPcsSold(String(sale.pcsSold));
    setPricePerPiece(String(sale.pricePerPiece));
  }, [editId, sales]);

  useEffect(() => {
    if (deepNew) {
      setCustomerId('');
      setProductId('');
      setPcsSold('');
      setPricePerPiece('');
    }
  }, [deepNew]);

  const selectedProduct = useMemo(() => products.find(p => p.id === productId), [products, productId]);
  const linkedMaterial = useMemo(() => {
    if (!selectedProduct || isAssembled(selectedProduct)) return null;
    return materials.find(m => m.id === selectedProduct.materialId) ?? null;
  }, [selectedProduct, materials]);

  const availableStock = useMemo(() => {
    if (!linkedMaterial) return 0;
    return InventoryCalculationService.calculateSaleStock(linkedMaterial.id, useERPStore.getState().batches);
  }, [linkedMaterial]);

  const totalAmount = useMemo(() => {
    const pcs = Number(pcsSold) || 0;
    const price = Number(pricePerPiece) || 0;
    return pcs * price;
  }, [pcsSold, pricePerPiece]);

  const canSave = Boolean(customerId && productId && Number(pcsSold) > 0 && Number(pricePerPiece) > 0);

  const handleSave = () => {
    setFormError(null);
    if (!canSave) {
      setFormError('Customer, product, quantity and price are required.');
      return;
    }
    const payload = {
      customerId,
      productId,
      date,
      pcsSold: Number(pcsSold),
      pricePerPiece: Number(pricePerPiece),
    };
    try {
      if (isEdit && editId) {
        SalesService.update(editId, payload);
      } else {
        SalesService.create(payload);
      }
      toast.success(isEdit ? 'Sale updated.' : 'Sale saved.');
      navigate('/sales');
    } catch (e: any) {
      setFormError(e?.message || 'Failed to save sale.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/sales')}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-muted/40 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Sales
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isEdit ? 'Edit Sale' : 'New Sale'}
        </h1>
        <div className="w-[120px]" />
      </div>

      {formError && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      )}

      <div className="space-y-4">
      <FormSection icon={<Plus className="h-3.5 w-3.5" />} eyebrow="Sale details" description="Customer, product and quantity." first>
        <FormGrid cols={2}>
          <FormField id="sale-customer" label="Customer" required>
            <SearchableSelect
              options={customers.map(c => ({ id: c.id, label: c.name }))}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Select Customer..."
              required
            />
          </FormField>
          <FormField id="sale-product" label="Product" required>
            <SearchableSelect
              options={products.map(p => {
                if (isAssembled(p)) {
                  return { id: p.id, label: p.name, secondaryLabel: `Made from ${p.components?.length ?? 0} materials` };
                }
                const m = materials.find(mat => mat.id === p.materialId);
                return { id: p.id, label: p.name, secondaryLabel: `Available: ${m?.processedStockPcs || 0} PCS` };
              })}
              value={productId}
              onChange={setProductId}
              placeholder="Select Product..."
              required
            />
          </FormField>
        </FormGrid>
        <FormGrid cols={3}>
          <FormField id="sale-pcs" label="PCS to Sell" required hint={linkedMaterial ? `Available: ${availableStock} PCS of ${linkedMaterial.name}` : undefined}>
            <input id="sale-pcs" type="number" min="1" required value={pcsSold} onChange={e => setPcsSold(e.target.value)} className={formInputClass} placeholder="Quantity" />
          </FormField>
          <FormField id="sale-price" label="Price Per Piece" required>
            <input id="sale-price" type="number" step="0.01" min="0" required value={pricePerPiece} onChange={e => setPricePerPiece(e.target.value)} className={formInputClass} placeholder="Rate" />
          </FormField>
          <FormField id="sale-date" label="Date" required>
            <DatePicker id="sale-date" value={date} onChange={setDate} />
          </FormField>
        </FormGrid>
      </FormSection>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className={cn('font-semibold tabular-nums', adaptiveAmountClass(totalAmount, 'md'))}>
          {formatCurrency(totalAmount)}
        </span>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {canSave ? `${formatCurrency(totalAmount)}` : 'Fill all required fields.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/sales')}
              className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {isEdit ? 'Update sale' : 'Save sale'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}