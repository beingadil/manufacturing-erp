/**
 * Sale Entry — full-page form (routes /sales/new and /sales/edit/:id).
 *
 * One line = one product. Selling deducts finished stock for a single-material
 * product, or every component in the recipe for an assembled product; the
 * breakdown is shown but never editable — the product record is the authority.
 */
import { ArrowLeft, Check, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { SearchableSelect } from '../components/SearchableSelect';
import { QuickAddCustomer, QuickAddProduct } from '../components/QuickAddModals';
import { DatePicker } from '../components/ui/date-picker';
import { adaptiveAmountClass, cn, formatCurrency } from '../lib/utils';
import { SalesService } from '../services/SalesService';
import { useERPStore } from '../store/useERPStore';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import {
  breakdownForSale,
  isAssembled,
  runningLowAfterSale,
  shortfallMessage,
} from '../lib/business/ProductAssemblyService';

type Line = {
  id: string;
  productId: string;
  /** Pieces to sell. */
  pcs: string;
  /** Selling price per piece in PKR. */
  price: string;
};

const newId = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (): Line => ({ id: newId(), productId: '', pcs: '', price: '' });

const control =
  'w-full min-w-0 rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const label = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70';
const headCell = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60';

const fmtNum = (n: number) => n.toLocaleString('en-PK');

export default function SalesFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);
  const deepNew = searchParams.get('new') === '1';

  const { sales, products, materials, customers, batches } = useERPStore();

  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const originalProductIdRef = useRef<string | null>(null);

  // ── Deep-linked for a new document (or reset for a clean one) ──
  useEffect(() => {
    if (deepNew && !editId) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepNew]);

  // ── Hydrate existing sale when editing ──
  useEffect(() => {
    if (!editId) return;
    const s = sales.find(x => x.id === editId);
    if (!s) return;
    setCustomerId(s.customerId);
    setDate(s.date);
    originalProductIdRef.current = s.productId;
    setLines([
      {
        id: newId(),
        productId: s.productId,
        pcs: String(s.pcsSold),
        price: String(s.pricePerPiece),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  function resetForm() {
    setCustomerId('');
    setDate(new Date().toISOString().split('T')[0]);
    setLines([emptyLine()]);
    setFormError(null);
    setShowCustomerForm(false);
    setShowProductForm(false);
    originalProductIdRef.current = null;
  }

  // ── Line-level derived values ──
  const lineView = useMemo(
    () =>
      lines.map(l => {
        const p = products.find(prod => prod.id === l.productId);
        const pcs = Number(l.pcs) || 0;
        const price = Number(l.price) || 0;
        const amount = pcs * price;
        return { p: p ?? null, pcs, price, amount };
      }),
    [lines, products],
  );

  // ── Stock guard for an assembled product: each sale consumes every part ──
  const componentAvailability = useMemo(
    () =>
      materials.map(m => ({
        materialId: m.id,
        availablePcs: InventoryCalculationService.calculateSaleStock(m.id, batches),
        unitCost: InventoryCalculationService.getWeightedAverageCostPerPiece(m.id, batches),
      })),
    [materials, batches],
  );

  const breakdown = useMemo(() => {
    const p = lineView[0]?.p;
    const pcs = Number(lines[0]?.pcs) || 0;
    if (!p || !isAssembled(p) || !(pcs > 0)) return null;
    return breakdownForSale(p, pcs, componentAvailability);
  }, [lineView, lines, componentAvailability]);

  const shortfall = breakdown
    ? shortfallMessage(
        breakdown,
        id => materials.find(m => m.id === id)?.name ?? 'Unknown material',
      )
    : null;
  const runningLow = useMemo(() => {
    if (!breakdown || shortfall) return [];
    return runningLowAfterSale(breakdown, 100);
  }, [breakdown, shortfall]);

  const currentProductId = lines[0]?.productId ?? '';
  const originalProductId = originalProductIdRef.current;
  const productChanged = isEdit && originalProductId !== null && currentProductId !== originalProductId;

  const summary = useMemo(() => {
    const pcs = lineView.reduce((s, v) => s + v.pcs, 0);
    const amount = lineView.reduce((s, v) => s + v.amount, 0);
    return { pcs, amount };
  }, [lineView]);

  const customer = customers.find(c => c.id === customerId);

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const handleProductChange = (index: number, id: string) =>
    setLine(index, { productId: id });

  /** After the inline product form saves: fill the first empty line, or add one. */
  const handleNewProduct = (id: string) => {
    const patch: Partial<Line> = { productId: id };
    const emptyIndex = lines.findIndex(l => !l.productId);
    if (emptyIndex >= 0) setLine(emptyIndex, patch);
    else setLines(prev => [...prev, { ...emptyLine(), ...patch }]);
    setShowProductForm(false);
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (index: number) =>
    setLines(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const lineIsReady = (l: Line) => {
    if (!l.productId || !(Number(l.price) > 0)) return false;
    const pcs = Number(l.pcs) > 0;
    return pcs;
  };

  const readyCount = lines.filter(lineIsReady).length;
  const canSave = Boolean(customerId) && readyCount > 0 && !shortfall;

  const handleSave = () => {
    if (!canSave) {
      setFormError(
        shortfall
          ? `Not enough stock — ${shortfall}`
          : 'Choose a customer and complete at least one line before saving.',
      );
      return;
    }
    setFormError(null);
    try {
      const l = lines[0];
      const pcs = Number(l.pcs) || 0;
      const price = Number(l.price) || 0;
      if (isEdit && editId) {
        SalesService.update(editId, {
          productId: l.productId,
          customerId,
          pcsSold: pcs,
          pricePerPiece: price,
          date,
        });
        toast.success('Sale updated successfully.');
      } else {
        SalesService.create({
          productId: l.productId,
          customerId,
          pcsSold: pcs,
          pricePerPiece: price,
          date,
        });
        toast.success('Sale saved — stock and ledger updated.');
      }
      resetForm();
      navigate('/sales', { replace: true });
    } catch (err: any) {
      setFormError(err?.message ?? 'Could not save the sale.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* ── Page header ── */}
      <header className="sticky top-16 z-20 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Sales</p>
            <h1 className="text-lg font-semibold leading-tight text-foreground">{isEdit ? 'Edit sale' : 'New sale'}</h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Total</span>
              <span className="text-base font-semibold tabular-nums text-foreground">{formatCurrency(summary.amount)}</span>
            </div>
            <span className="rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Draft
            </span>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="mx-auto grid max-w-7xl gap-5 py-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {/* Customer & date */}
          <section className="rounded-xl border border-border bg-card">
            <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end sm:p-5">
              <div className="min-w-0">
                <label htmlFor="sf-customer" className={label}>
                  Customer <span className="text-destructive">*</span>
                </label>
                <SearchableSelect
                  options={customers.map(c => ({ id: c.id, label: c.name, searchValue: c.phone }))}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="Select Customer…"
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="sf-date" className={label}>
                  Sale date <span className="text-destructive">*</span>
                </label>
                <DatePicker id="sf-date" value={date} onChange={setDate} className="h-[46px] w-full rounded-xl" />
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerForm(v => !v)}
                aria-expanded={showCustomerForm}
                className="inline-flex h-[46px] items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4" />
                Add customer
              </button>
            </div>
          </section>

          {showCustomerForm && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">New customer</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Same form as the Customers module — it saves here and is selected automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomerForm(false)}
                  className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close customer form"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5">
                <QuickAddCustomer
                  isOpen={showCustomerForm}
                  onSuccess={(id: string) => {
                    setCustomerId(id);
                    setShowCustomerForm(false);
                  }}
                  onClose={() => setShowCustomerForm(false)}
                />
              </div>
            </section>
          )}

          {/* Line items */}
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Line items</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {readyCount} of {lines.length} line{lines.length === 1 ? '' : 's'} complete
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProductForm(v => !v)}
                  aria-expanded={showProductForm}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" />
                  Add product
                </button>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" />
                  Add line
                </button>
              </div>
            </div>

            {/* Column headers — desktop only */}
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px_110px_36px] items-center gap-2 border-b border-border/60 bg-muted/30 px-5 py-2 lg:grid">
              <div className={headCell}>Product</div>
              <div className={cn(headCell, 'text-right')}>PCS</div>
              <div className={cn(headCell, 'text-right')}>Price / PCS</div>
              <div className={cn(headCell, 'text-right')}>Amount</div>
              <div />
            </div>

            <div className="divide-y divide-border/50">
              {lines.map((l, i) => {
                const v = lineView[i];
                return (
                  <div
                    key={l.id}
                    className="grid grid-cols-2 gap-3 px-4 py-4 transition-colors hover:bg-muted/20 sm:px-5 lg:grid-cols-[minmax(0,1fr)_120px_110px_110px_36px] lg:items-start lg:gap-2"
                  >
                    {/* Product */}
                    <div className="col-span-2 min-w-0 lg:col-span-1">
                      <label className={cn(label, 'lg:hidden')}>Product</label>
                      <SearchableSelect
                        options={products.map(p => {
                          if (isAssembled(p)) {
                            return { id: p.id, label: p.name, secondaryLabel: `Made from ${p.components?.length ?? 0} materials` };
                          }
                          const m = materials.find(mat => mat.id === p.materialId);
                          return { id: p.id, label: p.name, secondaryLabel: `Available: ${m?.processedStockPcs || 0} PCS` };
                        })}
                        value={l.productId}
                        onChange={val => handleProductChange(i, val)}
                        placeholder="Select product…"
                        required
                        onAdd={() => setShowProductForm(true)}
                      />
                    </div>

                    {/* PCS */}
                    <div className="min-w-0">
                      <label htmlFor={`sf-pcs-${i}`} className={cn(label, 'lg:hidden')}>
                        PCS
                      </label>
                      <div className="relative">
                        <input
                          id={`sf-pcs-${i}`}
                          inputMode="decimal"
                          type="number"
                          min={0}
                          step="1"
                          value={l.pcs}
                          onChange={e => setLine(i, { pcs: e.target.value })}
                          placeholder="0"
                          aria-label="Pieces to sell"
                          className={cn(control, 'pr-11 text-right tabular-nums')}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          PCS
                        </span>
                      </div>
                      <p className="mt-1.5 text-right text-[10px] tabular-nums text-muted-foreground/70">
                        {v.pcs} PCS
                      </p>
                    </div>

                    {/* Price per piece */}
                    <div className="min-w-0">
                      <label htmlFor={`sf-price-${i}`} className={cn(label, 'lg:hidden')}>
                        Price / PCS
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          Rs
                        </span>
                        <input
                          id={`sf-price-${i}`}
                          inputMode="decimal"
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.price}
                          onChange={e => setLine(i, { price: e.target.value })}
                          placeholder="0"
                          aria-label="Price per piece in PKR"
                          className={cn(control, 'pl-9 text-right tabular-nums')}
                        />
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="min-w-0 text-left lg:text-right">
                      <div className={cn(label, 'lg:hidden')}>Amount</div>
                      <div className="flex h-[46px] items-center text-sm font-semibold tabular-nums text-foreground lg:justify-end">
                        {formatCurrency(v.amount)}
                      </div>
                    </div>

                    {/* Remove */}
                    <div className="col-span-2 flex justify-end lg:col-span-1 lg:justify-center">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        disabled={lines.length === 1}
                        className="inline-flex h-[46px] w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Remove line ${i + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {formError && (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {formError}
            </div>
          )}

          {/* Assembled-product breakdown */}
          {breakdown && (
            <div className={`rounded-xl border px-4 py-3 ${shortfall ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/30'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">
                  Selling {breakdown.pcsSold} × {lineView[0]?.p?.name} uses
                </p>
                <span className="text-xs text-muted-foreground">Set on the product</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left font-medium">Material</th>
                    <th className="py-1 text-right font-medium">Per unit</th>
                    <th className="py-1 text-right font-medium">Will deduct</th>
                    <th className="py-1 text-right font-medium">In stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {breakdown.lines.map(line => {
                    const m = materials.find(x => x.id === line.materialId);
                    const isShort = line.shortageQty > 0;
                    return (
                      <tr key={line.materialId}>
                        <td className="py-1 font-medium text-foreground">
                          {m?.name ?? 'Unknown material'}
                          {m?.code && <span className="ml-2 font-mono text-xs text-muted-foreground">{m.code}</span>}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">{line.perUnitQty}</td>
                        <td className={`py-1 text-right tabular-nums font-medium ${isShort ? 'text-destructive' : ''}`}>
                          {line.requiredQty}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">{line.availablePcs}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Cost of these parts: {formatCurrency(breakdown.totalCost)}. All of them come off stock when this invoice is saved.
              </p>
              {runningLow.length > 0 && (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="low-stock-warning"
                  className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2"
                >
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Running low after this sale
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {runningLow.map(l => {
                      const m = materials.find(x => x.id === l.materialId);
                      return (
                        <li key={l.materialId} className="text-[11px] text-amber-700/90 dark:text-amber-400/90">
                          <span className="font-medium">{m?.name ?? 'Unknown material'}</span>
                          {m?.code && <span className="ml-1 font-mono">{m.code}</span>}
                          {' — '}
                          {l.remainingAfter} PCS left after {l.requiredQty} are used
                          {' (low-stock line is '}
                          {l.threshold}
                          {').'}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-400/80">
                    The sale will still go through. Consider a purchase order before you confirm this invoice.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Summary ── */}
        <aside className="h-fit xl:sticky xl:top-24">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Summary</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Draft</span>
            </div>
            <dl className="divide-y divide-border/50 px-4">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-muted-foreground">Customer</dt>
                <dd className="max-w-[170px] truncate text-sm font-medium text-foreground">{customer?.name ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-muted-foreground">Lines</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">
                  {lines.length} · {readyCount} complete
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-muted-foreground">PCS</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">{fmtNum(summary.pcs)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total</dt>
                <dd className={cn(adaptiveAmountClass(formatCurrency(summary.amount), 'md'), 'font-bold tabular-nums text-foreground')}>
                  {formatCurrency(summary.amount)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
              Selling deducts finished stock (single-material) or every component (assembled) immediately.
            </p>
          </div>
        </aside>
      </div>

      {/* ── Action bar ── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {readyCount === 0 ? 'No complete lines yet.' : `${readyCount} line${readyCount === 1 ? '' : 's'} ready · ${formatCurrency(summary.amount)}`}
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
              {isEdit ? 'Save changes' : 'Save sale'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
