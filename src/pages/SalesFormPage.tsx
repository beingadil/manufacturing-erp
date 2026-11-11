/**
 * Sale Entry — full-page form (routes /sales/new and /sales/edit/:id).
 *
 * One line = one product. In the manufacturing data contract every sale is
 * fulfilled from finished-goods lots produced by manufacturing orders; the
 * lot stock is shown per line and FIFO allocation runs when the invoice saves.
 * Un-migrated (pre-v4) data keeps the legacy material-stock behaviour.
 */
import { ArrowLeft, Check, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { QuickAddCustomer, QuickAddProduct } from '../components/QuickAddModals';
import { SearchableSelect } from '../components/SearchableSelect';
import { DatePicker } from '../components/ui/date-picker';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import {
  isManufacturingEnabled,
  lotAverageCost,
  lotStockForProduct,
} from '../lib/business/ManufacturingService';
import {
  breakdownForSale,
  isAssembled,
  runningLowAfterSale,
  shortfallMessage,
} from '../lib/business/ProductAssemblyService';
import { adaptiveAmountClass, cn, formatCurrency } from '../lib/utils';
import { SalesService } from '../services/SalesService';
import { useERPStore } from '../store/useERPStore';

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
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export default function SalesFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);
  const deepNew = searchParams.get('new') === '1';

  const { sales, products, materials, customers, batches, finishedGoodsLots, stateSchemaVersion } =
    useERPStore();
  const v4 = isManufacturingEnabled({ stateSchemaVersion });

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
  // In v4 `available` is the finished-goods lot stock BEFORE this line runs;
  // when the same product appears on two lines, the first line reserves its
  // quantity so the second line can never promise the same pieces twice.
  const lineView = useMemo(() => {
    const remaining = new Map<string, number>();
    const existing = isEdit && editId ? sales.find(s => s.id === editId) : undefined;
    return lines.map(l => {
      const p = products.find(prod => prod.id === l.productId) ?? null;
      const pcs = Number(l.pcs) || 0;
      const price = Number(l.price) || 0;
      const amount = pcs * price;
      let available = 0;
      let shortage = 0;
      let avgCost = 0;

      if (v4 && p) {
        if (!remaining.has(p.id)) {
          let base = lotStockForProduct(finishedGoodsLots ?? [], p.id);
          // An edit returns its own allocation before re-drawing, so the
          // quantity this sale already holds is available again.
          if (existing && existing.productId === p.id && existing.stockModelAtSale === 'manufactured') {
            base += (existing.lotAllocations ?? []).reduce((sum, a) => sum + a.pcs, 0);
          }
          remaining.set(p.id, round3(base));
        }
        available = remaining.get(p.id) ?? 0;
        avgCost = lotAverageCost(finishedGoodsLots ?? [], p.id);
        shortage = round3(Math.max(0, pcs - available));
        remaining.set(p.id, round3(Math.max(0, available - pcs)));
      }

      return { p, pcs, price, amount, available, avgCost, shortage };
    });
  }, [lines, products, v4, finishedGoodsLots, isEdit, editId, sales]);

  // ── Legacy stock guard for an assembled product (pre-v4 data only) ──
  const componentAvailability = useMemo(
    () =>
      v4
        ? []
        : materials.map(m => ({
            materialId: m.id,
            availablePcs: InventoryCalculationService.calculateSaleStock(m.id, batches),
            unitCost: InventoryCalculationService.getWeightedAverageCostPerPiece(m.id, batches),
          })),
    [materials, batches, v4],
  );

  const breakdown = useMemo(() => {
    if (v4) return null;
    const p = lineView[0]?.p;
    const pcs = Number(lines[0]?.pcs) || 0;
    if (!p || !isAssembled(p) || !(pcs > 0)) return null;
    return breakdownForSale(p, pcs, componentAvailability);
  }, [v4, lineView, lines, componentAvailability]);

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

  const lotShortfall = useMemo(() => {
    if (!v4) return null;
    const hit = lineView.find(v => v.shortage > 0);
    if (!hit?.p) return null;
    return `Not enough finished stock for ${hit.p.name}: need ${fmtNum(hit.pcs)} PCS but only ${fmtNum(hit.available)} are on hand. Manufacture more before selling it.`;
  }, [v4, lineView]);

  const currentProductId = lines[0]?.productId ?? '';
  const originalProductId = originalProductIdRef.current;
  const _productChanged = isEdit && originalProductId !== null && currentProductId !== originalProductId;

  const summary = useMemo(() => {
    const pcs = lineView.reduce((s, v) => s + v.pcs, 0);
    const amount = lineView.reduce((s, v) => s + v.amount, 0);
    const cogs = v4
      ? lineView.reduce((s, v) => s + v.avgCost * v.pcs, 0)
      : 0;
    return { pcs, amount, cogs, margin: amount - cogs };
  }, [lineView, v4]);

  const customer = customers.find(c => c.id === customerId);

  const legacyStockForProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return materials.find(m => m.id === product?.materialId)?.processedStockPcs || 0;
  };

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
    return Number(l.pcs) > 0;
  };
  const lineHasInput = (l: Line) => Boolean(l.productId || l.pcs.trim() || l.price.trim());

  const readyCount = lines.filter(lineIsReady).length;
  const incompleteCount = lines.filter(l => lineHasInput(l) && !lineIsReady(l)).length;
  const canSave =
    Boolean(customerId) && readyCount > 0 && incompleteCount === 0 && !shortfall && !lotShortfall;

  const handleSave = () => {
    if (incompleteCount > 0) {
      setFormError('Finish or remove every incomplete line before saving.');
      return;
    }
    if (!customerId || readyCount === 0) {
      setFormError('Choose a customer and complete at least one line before saving.');
      return;
    }
    if (lotShortfall) {
      setFormError(lotShortfall);
      return;
    }
    if (shortfall) {
      setFormError(`Not enough stock — ${shortfall}`);
      return;
    }
    setFormError(null);
    const readyLines = lines.filter(lineIsReady);
    try {
      if (isEdit && editId) {
        const l = readyLines[0];
        SalesService.update(editId, {
          productId: l.productId,
          customerId,
          pcsSold: Math.round(Number(l.pcs)),
          pricePerPiece: Number(l.price),
          date,
        });
        toast.success('Sale updated successfully.');
      } else if (v4) {
        // One invoice number, one sale row (and voucher) per line — every line
        // is saved, unlike the old form which silently kept only lines[0].
        SalesService.createGroup({
          customerId,
          date,
          lines: readyLines.map(l => ({
            productId: l.productId,
            pcsSold: Math.round(Number(l.pcs)),
            pricePerPiece: Number(l.price),
          })),
        });
        toast.success(
          `Sale saved — ${readyLines.length} line${readyLines.length === 1 ? '' : 's'}, stock and ledger updated.`,
        );
      } else {
        const l = readyLines[0];
        SalesService.create({
          productId: l.productId,
          customerId,
          pcsSold: Math.round(Number(l.pcs)),
          pricePerPiece: Number(l.price),
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
                {!isEdit && (
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-4 w-4" />
                    Add line
                  </button>
                )}
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
                          if (v4) {
                            return {
                              id: p.id,
                              label: p.name,
                              secondaryLabel: `In stock: ${fmtNum(lotStockForProduct(finishedGoodsLots ?? [], p.id))} PCS`,
                            };
                          }
                          if (isAssembled(p)) {
                            return { id: p.id, label: p.name, secondaryLabel: `Made from ${p.components?.length ?? 0} materials` };
                          }
                          return { id: p.id, label: p.name, secondaryLabel: `Available: ${legacyStockForProduct(p.id)} PCS` };
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
                      <p
                        className={cn(
                          'mt-1.5 text-right text-[10px] tabular-nums',
                          v4 && v.shortage > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground/70',
                        )}
                      >
                        {v4
                          ? v.shortage > 0
                            ? `Short ${fmtNum(v.shortage)} PCS`
                            : `${fmtNum(v.available)} in stock`
                          : `${v.pcs} PCS`}
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
                        disabled={lines.length === 1 || isEdit}
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

          {/* Manufacturing fulfilment (v4) */}
          {v4 && lineView.some(v => v.p) && (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border/60 px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">Finished-goods fulfilment</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Every line is sold from finished-goods lots built by manufacturing orders. The ledger uses
                  each lot's own cost; the figures below are an estimate until the invoice saves.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Product</th>
                    <th className="px-2 py-2 text-right font-semibold">Selling</th>
                    <th className="px-2 py-2 text-right font-semibold">In stock</th>
                    <th className="px-2 py-2 text-right font-semibold">Avg lot cost</th>
                    <th className="px-4 py-2 text-right font-semibold">Est. COGS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {lineView.filter(v => v.p && v.pcs > 0).map((v, i) => (
                    <tr key={`${v.p!.id}-${i}`}>
                      <td className="px-4 py-2 font-medium text-foreground">{v.p!.name}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(v.pcs)} PCS</td>
                      <td
                        className={cn(
                          'px-2 py-2 text-right tabular-nums',
                          v.shortage > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {fmtNum(v.available)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(v.avgCost)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-foreground">
                        {formatCurrency(v.avgCost * v.pcs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {v4 && lineView.some(v => v.shortage > 0) && (
                <p className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-xs font-medium text-destructive">
                  {lotShortfall}
                </p>
              )}
            </div>
          )}

          {/* Legacy assembled-product breakdown (pre-v4 data only) */}
          {!v4 && breakdown && (
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
              {v4 && (
                <>
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-xs text-muted-foreground">Est. COGS</dt>
                    <dd className="text-sm font-medium tabular-nums text-foreground">{formatCurrency(summary.cogs)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-xs text-muted-foreground">Est. margin</dt>
                    <dd
                      className={cn(
                        'text-sm font-medium tabular-nums',
                        summary.margin < 0 ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {formatCurrency(summary.margin)}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex items-baseline justify-between gap-4 py-3.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total</dt>
                <dd className={cn(adaptiveAmountClass(formatCurrency(summary.amount), 'md'), 'font-bold tabular-nums text-foreground')}>
                  {formatCurrency(summary.amount)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
              {v4
                ? 'Sales are fulfilled FIFO from finished-goods lots created by manufacturing orders. Raw materials are never sold directly.'
                : 'Selling deducts finished stock (single-material) or every component (assembled) immediately.'}
            </p>
          </div>
        </aside>
      </div>

      {/* ── Action bar ── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {incompleteCount > 0
              ? `${incompleteCount} incomplete line${incompleteCount === 1 ? '' : 's'} — finish ${incompleteCount === 1 ? 'it' : 'them'} or remove ${incompleteCount === 1 ? 'it' : 'them'}.`
              : readyCount === 0
                ? 'No complete lines yet.'
                : `${readyCount} line${readyCount === 1 ? '' : 's'} ready · ${formatCurrency(summary.amount)}`}
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

      {/* Inline product form (portaled) */}
      <QuickAddProduct
        isOpen={showProductForm}
        onSuccess={handleNewProduct}
        onClose={() => setShowProductForm(false)}
      />
    </div>
  );
}
