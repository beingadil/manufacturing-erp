/**
 * Manufacturing — manufacturing orders + finished-goods lots.
 *
 * An order freezes its BOM when created. Components stay in stock until the
 * order completes; completion consumes the full planned component quantity,
 * posts one balanced journal voucher and creates a finished-goods lot. A short
 * output absorbs the same cost into fewer good units, so no separate WIP is
 * left in the ledger.
 */
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Coins,
  Factory,
  Layers,
  PackageCheck,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Column, DataTable, RowActionButton } from '../components/DataTable';
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { FormField } from '../components/form/FormField';
import { FormFooter } from '../components/form/FormFooter';
import { FormGrid } from '../components/form/FormGrid';
import { FormModal } from '../components/form/FormModal';
import { FormSection } from '../components/form/FormSection';
import { formInputClass } from '../components/form/formStyles';
import { SearchableSelect } from '../components/SearchableSelect';
import { DatePicker } from '../components/ui/date-picker';
import { previewProcessingCostReclassification } from '../lib/accounting/processingCostReclassification';
import {
  consumeComponentsForManufacturing,
  isManufacturingEnabled,
  snapshotBom,
} from '../lib/business/ManufacturingService';
import { formatCurrency, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';
import type { ManufacturingOrder, ManufacturingOrderStatus } from '../types/erp';

const fmtDate = (value?: string) => {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusStyle: Record<ManufacturingOrderStatus, string> = {
  Planned: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'In Progress': 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Cancelled: 'border-border bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: ManufacturingOrderStatus }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusStyle[status]}`}>
      {status}
    </span>
  );
}

type OrderForm = {
  productId: string;
  date: string;
  plannedQty: string;
  productionCost: string;
  remarks: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export function Manufacturing() {
  const {
    products,
    materials,
    batches,
    manufacturingOrders,
    finishedGoodsLots,
    processingReceipts,
    processorBills,
    processingCostReclassification,
    stateSchemaVersion,
    addManufacturingOrder,
    updateManufacturingOrder,
    startManufacturingOrder,
    completeManufacturingOrder,
    cancelManufacturingOrder,
    deleteManufacturingOrder,
    reclassifyProcessingCosts,
  } = useERPStore();

  const enabled = isManufacturingEnabled({ stateSchemaVersion });
  const [activeTab, setActiveTab] = useState<'orders' | 'lots'>('orders');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ManufacturingOrder | null>(null);
  const [completingOrder, setCompletingOrder] = useState<ManufacturingOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManufacturingOrder | null>(null);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);

  const reclassification = useMemo(
    () =>
      previewProcessingCostReclassification({
        stateSchemaVersion,
        batches,
        processingReceipts,
        processorBills,
        materials,
        processingCostReclassification,
      }),
    [
      stateSchemaVersion,
      batches,
      processingReceipts,
      processorBills,
      materials,
      processingCostReclassification,
    ],
  );

  const [form, setForm] = useState<OrderForm>({
    productId: '',
    date: today(),
    plannedQty: '',
    productionCost: '0',
    remarks: '',
  });
  const [completeForm, setCompleteForm] = useState({
    finishedQty: '',
    productionCost: '0',
    date: today(),
    remarks: '',
  });

  const productName = (id: string) => products.find(p => p.id === id)?.name ?? 'Unknown product';

  const stockByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const batch of batches || []) {
      if (batch.status !== 'Active') continue;
      const available = Math.max(0, batch.remainingPcs || 0) + Math.max(0, batch.processedPcs || 0);
      map.set(batch.materialId, (map.get(batch.materialId) || 0) + available);
    }
    return map;
  }, [batches]);

  const formComponents = useMemo(() => {
    const product = products.find(p => p.id === form.productId);
    const qty = Math.round(Number(form.plannedQty));
    if (!product || !(qty > 0)) return [];
    try {
      return snapshotBom(product, qty);
    } catch {
      return [];
    }
  }, [products, form.productId, form.plannedQty]);

  const formPreview = useMemo(() => {
    if (formComponents.length === 0) return null;
    const drawn = consumeComponentsForManufacturing(
      batches || [],
      formComponents.map(c => ({ materialId: c.materialId, pcs: c.plannedQuantity })),
    );
    // Per-material drawn cost — the SAME arithmetic the completion posts, so
    // the column always sums to the header total and covers ready-made /
    // processed buckets (which carry no remainingPcs for the raw-bucket
    // average to see).
    const costByMaterial = new Map<string, number>();
    for (const draw of drawn.draws) {
      costByMaterial.set(draw.materialId, (costByMaterial.get(draw.materialId) || 0) + draw.cost);
    }
    return {
      totalCost: drawn.totalCost,
      shortage: drawn.shortage,
      costByMaterial,
    };
  }, [formComponents, batches]);

  const completePreview = useMemo(() => {
    if (!completingOrder) return null;
    const drawn = consumeComponentsForManufacturing(
      batches || [],
      completingOrder.components.map(c => ({ materialId: c.materialId, pcs: c.plannedQuantity })),
    );
    const finishedQty = Math.round(Number(completeForm.finishedQty)) || 0;
    const productionCost = Math.max(0, Number(completeForm.productionCost) || 0);
    const totalCost = drawn.totalCost + productionCost;
    return {
      ...drawn,
      totalCost,
      costPerPiece: finishedQty > 0 ? totalCost / finishedQty : 0,
      absorption:
        completedShortfall(completingOrder.plannedQty, finishedQty) > 0
          ? completedShortfall(completingOrder.plannedQty, finishedQty)
          : 0,
    };
  }, [completingOrder, batches, completeForm.finishedQty, completeForm.productionCost]);

  function completedShortfall(planned: number, finished: number) {
    return Math.max(0, planned - finished);
  }

  const enrichedOrders = useMemo(
    () =>
      (manufacturingOrders || [])
        .map(order => {
          const lot = (finishedGoodsLots || []).find(l => l.id === order.lotId);
          return {
            ...order,
            productName: productName(order.productId),
            lotNo: lot?.lotNo ?? '—',
            remaining: lot?.pcsRemaining ?? 0,
          };
        })
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')),
    [manufacturingOrders, finishedGoodsLots, products],
  );

  const enrichedLots = useMemo(
    () =>
      (finishedGoodsLots || [])
        .map(lot => {
          const order = (manufacturingOrders || []).find(o => o.id === lot.manufacturingOrderId);
          return {
            ...lot,
            productName: productName(lot.productId),
            orderNo: order?.orderNo ?? '—',
            valueRemaining: lot.pcsRemaining * lot.costPerPiece,
          };
        })
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.lotNo.localeCompare(b.lotNo)),
    [finishedGoodsLots, manufacturingOrders, products],
  );

  const stats = useMemo(() => {
    const orders = manufacturingOrders || [];
    const lots = finishedGoodsLots || [];
    const activeLots = lots.filter(l => l.status === 'Active');
    return {
      planned: orders.filter(o => o.status === 'Planned').length,
      inProgress: orders.filter(o => o.status === 'In Progress').length,
      completed: orders.filter(o => o.status === 'Completed').length,
      fgPcs: activeLots.reduce((sum, l) => sum + (l.pcsRemaining || 0), 0),
      fgValue: activeLots.reduce((sum, l) => sum + (l.pcsRemaining || 0) * l.costPerPiece, 0),
    };
  }, [manufacturingOrders, finishedGoodsLots]);

  const openCreate = () => {
    setEditingOrder(null);
    setForm({ productId: '', date: today(), plannedQty: '', productionCost: '0', remarks: '' });
    setIsOrderModalOpen(true);
  };

  const openEdit = (order: ManufacturingOrder) => {
    setEditingOrder(order);
    setForm({
      productId: order.productId,
      date: order.date,
      plannedQty: String(order.plannedQty),
      productionCost: String(order.productionCost ?? 0),
      remarks: order.remarks ?? '',
    });
    setIsOrderModalOpen(true);
  };

  const closeOrderModal = () => {
    setIsOrderModalOpen(false);
    setEditingOrder(null);
  };

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const plannedQty = Math.round(Number(form.plannedQty));
    if (!editingOrder && !form.productId) {
      toast.error('Choose the product to manufacture.');
      return;
    }
    if (!(plannedQty > 0)) {
      toast.error('Planned quantity must be greater than zero.');
      return;
    }
    try {
      if (editingOrder) {
        updateManufacturingOrder(editingOrder.id, {
          date: form.date,
          plannedQty,
          productionCost: Math.max(0, Number(form.productionCost) || 0),
          remarks: form.remarks,
        });
        toast.success('Manufacturing order updated.');
      } else {
        const id = addManufacturingOrder({
          productId: form.productId,
          date: form.date,
          plannedQty,
          productionCost: Math.max(0, Number(form.productionCost) || 0),
          remarks: form.remarks,
        });
        const created = useERPStore.getState().manufacturingOrders.find(o => o.id === id);
        toast.success(`Manufacturing order ${created?.orderNo ?? ''} created.`);
      }
      closeOrderModal();
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not save the manufacturing order.');
    }
  };

  const openComplete = (order: ManufacturingOrder) => {
    setCompletingOrder(order);
    setCompleteForm({
      finishedQty: String(order.plannedQty),
      productionCost: String(order.productionCost ?? 0),
      date: today(),
      remarks: order.remarks ?? '',
    });
  };

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingOrder) return;
    const finishedQty = Math.round(Number(completeForm.finishedQty));
    if (!(finishedQty > 0)) {
      toast.error('Finished quantity must be greater than zero.');
      return;
    }
    try {
      completeManufacturingOrder(completingOrder.id, {
        finishedQty,
        productionCost: Math.max(0, Number(completeForm.productionCost) || 0),
        date: completeForm.date,
        remarks: completeForm.remarks,
      });
      toast.success(`${completingOrder.orderNo} completed — finished-goods lot created.`);
      setCompletingOrder(null);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not complete the manufacturing order.');
    }
  };

  const handleStart = (order: ManufacturingOrder) => {
    try {
      startManufacturingOrder(order.id);
      toast.success(`${order.orderNo} started. Components remain reserved until completion.`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not start the manufacturing order.');
    }
  };

  const handleCancel = (order: ManufacturingOrder) => {
    try {
      cancelManufacturingOrder(order.id);
      toast.success(`${order.orderNo} cancelled.`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not cancel the manufacturing order.');
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    try {
      deleteManufacturingOrder(deleteTarget.id);
      toast.success(`${deleteTarget.orderNo} deleted.`);
      setDeleteTarget(null);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not delete the manufacturing order.');
    }
  };

  const handleReclassify = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = reclassifyProcessingCosts();
      toast.success(
        `Capitalised ${formatCurrency(result.amount)} of historical processing cost — voucher ${result.voucherNo}.`,
      );
      setReclassifyOpen(false);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not capitalise historical processing cost.');
    }
  };

  const orderColumns: Column<(typeof enrichedOrders)[number]>[] = [
    {
      key: 'orderNo',
      label: 'MO No.',
      sortable: true,
      render: item => <span className="font-mono text-xs font-medium text-foreground">{item.orderNo}</span>,
    },
    { key: 'date', label: 'Date', sortable: true, render: item => <span className="text-xs text-muted-foreground">{fmtDate(item.date)}</span> },
    { key: 'productName', label: 'Product', sortable: true, render: item => <span className="font-medium">{item.productName}</span> },
    { key: 'status', label: 'Status', render: item => <StatusPill status={item.status} /> },
    {
      key: 'plannedQty',
      label: 'Planned',
      align: 'right',
      sortable: true,
      render: item => <span className="tabular-nums">{formatNumber(item.plannedQty)}</span>,
    },
    {
      key: 'finishedQty',
      label: 'Finished',
      align: 'right',
      render: item => (
        <span className="tabular-nums">
          {item.finishedQty != null ? formatNumber(item.finishedQty) : '—'}
          {item.finishedQty != null && item.finishedQty < item.plannedQty && (
            <span className="ml-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              −{formatNumber(item.plannedQty - item.finishedQty)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'costPerPiece',
      label: 'Unit cost',
      align: 'right',
      render: item => (
        <span className="tabular-nums text-muted-foreground">
          {item.costPerPiece != null ? formatCurrency(item.costPerPiece) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: item => (
        <div className="flex items-center justify-end gap-1">
          {item.status === 'Planned' && (
            <>
              <RowActionButton onClick={() => openEdit(item)} label={`Edit ${item.orderNo}`} tone="primary">
                <Pencil />
              </RowActionButton>
              <RowActionButton onClick={() => handleStart(item)} label={`Start ${item.orderNo}`} tone="primary">
                <Play />
              </RowActionButton>
            </>
          )}
          {(item.status === 'Planned' || item.status === 'In Progress') && (
            <RowActionButton onClick={() => openComplete(item)} label={`Complete ${item.orderNo}`} tone="primary">
              <CheckCircle2 />
            </RowActionButton>
          )}
          {(item.status === 'Planned' || item.status === 'In Progress') && (
            <RowActionButton onClick={() => handleCancel(item)} label={`Cancel ${item.orderNo}`} tone="destructive">
              <Ban />
            </RowActionButton>
          )}
          {item.status !== 'Completed' && (
            <RowActionButton onClick={() => setDeleteTarget(item)} label={`Delete ${item.orderNo}`} tone="destructive">
              <Trash2 />
            </RowActionButton>
          )}
        </div>
      ),
    },
  ];

  const lotColumns: Column<(typeof enrichedLots)[number]>[] = [
    {
      key: 'lotNo',
      label: 'Lot No.',
      sortable: true,
      render: item => <span className="font-mono text-xs font-medium text-foreground">{item.lotNo}</span>,
    },
    { key: 'date', label: 'Date', sortable: true, render: item => <span className="text-xs text-muted-foreground">{fmtDate(item.date)}</span> },
    { key: 'productName', label: 'Product', sortable: true, render: item => <span className="font-medium">{item.productName}</span> },
    { key: 'orderNo', label: 'MO No.', render: item => <span className="font-mono text-xs text-muted-foreground">{item.orderNo}</span> },
    {
      key: 'pcsProduced',
      label: 'Produced',
      align: 'right',
      sortable: true,
      render: item => <span className="tabular-nums">{formatNumber(item.pcsProduced)}</span>,
    },
    {
      key: 'pcsRemaining',
      label: 'Remaining',
      align: 'right',
      sortable: true,
      render: item => (
        <span className={item.pcsRemaining > 0 ? 'font-semibold tabular-nums text-emerald-600 dark:text-emerald-400' : 'tabular-nums text-muted-foreground'}>
          {formatNumber(item.pcsRemaining)}
        </span>
      ),
    },
    {
      key: 'costPerPiece',
      label: 'Cost / PCS',
      align: 'right',
      sortable: true,
      render: item => <span className="tabular-nums text-muted-foreground">{formatCurrency(item.costPerPiece)}</span>,
    },
    {
      key: 'valueRemaining',
      label: 'Value left',
      align: 'right',
      sortable: true,
      render: item => <span className="tabular-nums font-medium">{formatCurrency(item.valueRemaining)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: item => (
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${item.status === 'Active' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border bg-muted text-muted-foreground'}`}>
          {item.status}
        </span>
      ),
    },
  ];

  const productOptions = products
    .filter(p => p.status !== 'Inactive')
    .map(p => {
      const lines = p.usageType === 'assembled' && (p.components?.length ?? 0) > 0
        ? p.components?.length ?? 0
        : 1;
      return { id: p.id, label: p.name, secondaryLabel: `${lines} material line${lines === 1 ? '' : 's'}` };
    });

  const selectedEditProduct = editingOrder ? products.find(p => p.id === editingOrder.productId) : undefined;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
            <Factory className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Manufacturing</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Build finished goods from components. Sales are fulfilled from the lots produced here.
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          disabled={!enabled}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> New order
        </button>
      </div>

      {!enabled && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Manufacturing is waiting for the data migration to finish. Restart the app to enable it.
        </div>
      )}

      {enabled && reclassification.amount >= 0.01 && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
                <Coins className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Historical processing cost needs capitalising
                </h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/80">
                  {formatCurrency(reclassification.amount)} of processing charges was expensed in earlier periods and is
                  still embedded in {formatNumber(reclassification.batchCount)} batch
                  {reclassification.batchCount === 1 ? '' : 'es'} on hand. Capitalise it once so manufacturing orders can
                  draw it from Raw Material Inventory. Sold quantities keep their historical expense.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReclassifyOpen(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
            >
              <Coins className="h-4 w-4" />
              Capitalise {formatCurrency(reclassification.amount)}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Planned</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(stats.planned)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">In progress</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-amber-600 dark:text-amber-400">{formatNumber(stats.inProgress)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Completed</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(stats.completed)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">FG in stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-indigo-500">{formatNumber(stats.fgPcs)}</div>
          <div className="text-xs text-muted-foreground">PCS ready to sell</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">FG value</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatCurrency(stats.fgValue)}</div>
          <div className="text-xs text-muted-foreground">At produced cost</div>
        </div>
      </section>

      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'orders' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
        >
          <ClipboardList className="h-3.5 w-3.5" /> Orders
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('lots')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${activeTab === 'lots' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
        >
          <PackageCheck className="h-3.5 w-3.5" /> Finished-goods lots
        </button>
      </div>

      {activeTab === 'orders' ? (
        <DataTable
          data={enrichedOrders}
          columns={orderColumns}
          searchKeys={['orderNo', 'productName', 'status']}
          searchPlaceholder="Search manufacturing orders..."
          persistKey="manufacturing-orders-table"
          defaultSortKey="date"
        />
      ) : (
        <DataTable
          data={enrichedLots}
          columns={lotColumns}
          searchKeys={['lotNo', 'productName', 'orderNo']}
          searchPlaceholder="Search finished-goods lots..."
          persistKey="manufacturing-lots-table"
          defaultSortKey="date"
        />
      )}

      {/* ── Create / edit order ── */}
      <FormModal
        isOpen={isOrderModalOpen}
        onClose={closeOrderModal}
        title={editingOrder ? `Edit ${editingOrder.orderNo}` : 'New manufacturing order'}
        description={editingOrder
          ? 'Only planned orders can be edited. The saved BOM is refreshed when the planned quantity changes.'
          : 'The recipe is frozen when the order is created; stock is consumed only at completion.'}
        icon={editingOrder ? <Pencil /> : <Factory />}
        size="lg"
        accent="from-indigo-500 to-violet-600"
        footer={<FormFooter onCancel={closeOrderModal} formId="manufacturing-order-form" submitLabel={editingOrder ? 'Save changes' : 'Create order'} />}
      >
        <form id="manufacturing-order-form" onSubmit={handleSaveOrder} className="space-y-5">
          <FormSection icon={<Factory />} eyebrow="Order" first>
            <FormGrid cols={2}>
              <FormField id="mo-product" label="Product" required>
                {editingOrder ? (
                  <div className="flex h-[42px] items-center rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground">
                    {selectedEditProduct?.name ?? productName(editingOrder.productId)}
                  </div>
                ) : (
                  <SearchableSelect
                    options={productOptions}
                    value={form.productId}
                    onChange={id => setForm(prev => ({ ...prev, productId: id }))}
                    placeholder="Select product…"
                    required
                  />
                )}
              </FormField>
              <FormField id="mo-qty" label="Planned quantity (PCS)" required>
                <input
                  id="mo-qty"
                  type="number"
                  min={1}
                  step="1"
                  required
                  value={form.plannedQty}
                  onChange={e => setForm(prev => ({ ...prev, plannedQty: e.target.value }))}
                  className={formInputClass}
                  placeholder="e.g. 100"
                />
              </FormField>
              <FormField id="mo-date" label="Order date" required>
                <DatePicker id="mo-date" value={form.date} onChange={value => setForm(prev => ({ ...prev, date: value }))} className="h-[42px] w-full" />
              </FormField>
              <FormField id="mo-production-cost" label="Production cost (optional)">
                <input
                  id="mo-production-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.productionCost}
                  onChange={e => setForm(prev => ({ ...prev, productionCost: e.target.value }))}
                  className={formInputClass}
                  placeholder="0 (labour / power)"
                />
              </FormField>
              <FormField id="mo-remarks" label="Remarks" className="sm:col-span-2">
                <textarea
                  id="mo-remarks"
                  rows={2}
                  value={form.remarks}
                  onChange={e => setForm(prev => ({ ...prev, remarks: e.target.value }))}
                  className={formInputClass}
                  placeholder="Optional note"
                />
              </FormField>
            </FormGrid>
          </FormSection>

          {formComponents.length > 0 && (
            <FormSection icon={<Layers />} eyebrow="Bill of materials">
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Material</th>
                      <th className="px-3 py-2 text-right font-medium">Per unit</th>
                      <th className="px-3 py-2 text-right font-medium">Required</th>
                      <th className="px-3 py-2 text-right font-medium">In stock</th>
                      <th className="px-3 py-2 text-right font-medium">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {formComponents.map(line => {
                      const material = materials.find(m => m.id === line.materialId);
                      const available = stockByMaterial.get(line.materialId) || 0;
                      const short = line.plannedQuantity > available + 1e-9;
                      return (
                        <tr key={line.materialId}>
                          <td className="px-3 py-2 font-medium text-foreground">{material?.name ?? 'Unknown material'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{line.quantityPerUnit}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{line.plannedQuantity}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${short ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                            {available}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {formatCurrency(formPreview?.costByMaterial.get(line.materialId) ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Estimated component cost: {formatCurrency(formPreview?.totalCost ?? 0)}. Components are not reserved until the order completes.
              </p>
              {formPreview?.shortage && (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Stock is short for {materials.find(m => m.id === formPreview.shortage!.materialId)?.name ?? 'a material'}: needs{' '}
                  {formPreview.shortage.required}, has {formPreview.shortage.available}. The order can still be created; completion will wait for stock.
                </p>
              )}
            </FormSection>
          )}
        </form>
      </FormModal>

      {/* ── Complete order ── */}
      <FormModal
        isOpen={Boolean(completingOrder)}
        onClose={() => setCompletingOrder(null)}
        title={completingOrder ? `Complete ${completingOrder.orderNo}` : 'Complete order'}
        description="Components are consumed in full for the planned quantity. A short output spreads the same cost over fewer good units."
        icon={<CheckCircle2 />}
        size="lg"
        accent="from-emerald-500 to-teal-600"
        footer={<FormFooter onCancel={() => setCompletingOrder(null)} formId="manufacturing-complete-form" submitLabel="Complete & create lot" />}
      >
        <form id="manufacturing-complete-form" onSubmit={handleComplete} className="space-y-5">
          <FormSection icon={<PackageCheck />} eyebrow="Output" first>
            <FormGrid cols={2}>
              <FormField id="mo-finished-qty" label="Finished quantity (PCS)" required>
                <input
                  id="mo-finished-qty"
                  type="number"
                  min={1}
                  max={completingOrder?.plannedQty}
                  step="1"
                  required
                  value={completeForm.finishedQty}
                  onChange={e => setCompleteForm(prev => ({ ...prev, finishedQty: e.target.value }))}
                  className={formInputClass}
                />
              </FormField>
              <FormField id="mo-complete-date" label="Completion date" required>
                <DatePicker id="mo-complete-date" value={completeForm.date} onChange={value => setCompleteForm(prev => ({ ...prev, date: value }))} className="h-[42px] w-full" />
              </FormField>
              <FormField id="mo-complete-production-cost" label="Production cost (this order)">
                <input
                  id="mo-complete-production-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={completeForm.productionCost}
                  onChange={e => setCompleteForm(prev => ({ ...prev, productionCost: e.target.value }))}
                  className={formInputClass}
                />
              </FormField>
              <FormField id="mo-complete-remarks" label="Remarks">
                <input
                  id="mo-complete-remarks"
                  type="text"
                  value={completeForm.remarks}
                  onChange={e => setCompleteForm(prev => ({ ...prev, remarks: e.target.value }))}
                  className={formInputClass}
                  placeholder="Optional note"
                />
              </FormField>
            </FormGrid>
          </FormSection>

          {completingOrder && completePreview && (
            <FormSection icon={<Layers />} eyebrow="Cost preview">
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Material</th>
                      <th className="px-3 py-2 text-right font-medium">Will consume</th>
                      <th className="px-3 py-2 text-right font-medium">In stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {completingOrder.components.map(line => {
                      const material = materials.find(m => m.id === line.materialId);
                      const available = stockByMaterial.get(line.materialId) || 0;
                      const short = line.plannedQuantity > available + 1e-9;
                      return (
                        <tr key={line.materialId}>
                          <td className="px-3 py-2 font-medium text-foreground">{material?.name ?? 'Unknown material'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{line.plannedQuantity}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${short ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                            {available}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Material cost</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{formatCurrency(completePreview.totalCost - Math.max(0, Number(completeForm.productionCost) || 0))}</dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Production cost</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{formatCurrency(Math.max(0, Number(completeForm.productionCost) || 0))}</dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost / finished PCS</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{formatCurrency(completePreview.costPerPiece)}</dd>
                </div>
              </dl>
              {completePreview.shortage && (
                <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  Not enough {materials.find(m => m.id === completePreview.shortage!.materialId)?.name ?? 'material'}: needs{' '}
                  {completePreview.shortage.required} PCS but only {completePreview.shortage.available} are on hand. Nothing will be consumed.
                </p>
              )}
              {completePreview.absorption > 0 && (
                <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  Output is short by {formatNumber(completePreview.absorption)} PCS. The full component cost is absorbed into the surviving units, so inventory stays at cost with no WIP balance.
                </p>
              )}
            </FormSection>
          )}
        </form>
      </FormModal>

      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Manufacturing Order"
        recordNo={deleteTarget?.orderNo ?? ''}
        description="Only planned, in-progress or cancelled orders can be deleted. Completed orders keep their finished-goods lot and posted cost."
      />

      <FormModal
        isOpen={reclassifyOpen}
        onClose={() => setReclassifyOpen(false)}
        title="Capitalise historical processing cost"
        description="One forward journal moves the on-hand cost from expense into inventory. No historical voucher or COGS figure is rewritten."
        icon={<Coins />}
        size="lg"
        accent="from-amber-500 to-orange-600"
        footer={
          <FormFooter
            onCancel={() => setReclassifyOpen(false)}
            formId="processing-reclass-form"
            submitLabel="Post reclassification"
          />
        }
      >
        <form id="processing-reclass-form" onSubmit={handleReclassify} className="space-y-5">
          <FormSection icon={<Coins />} eyebrow="One-time adjustment" first>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To capitalise</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatCurrency(reclassification.amount)}</dd>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batches</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatNumber(reclassification.batchCount)}</dd>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Materials</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatNumber(reclassification.lines.length)}</dd>
              </div>
            </dl>

            {reclassification.lines.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Material</th>
                      <th className="px-3 py-2 text-right font-medium">Legacy cost on hand</th>
                      <th className="px-3 py-2 text-right font-medium">Expensed historically</th>
                      <th className="px-3 py-2 text-right font-medium">Capitalise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {reclassification.lines.map(line => (
                      <tr key={line.materialId}>
                        <td className="px-3 py-2 font-medium text-foreground">{line.materialName}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(line.onHandLegacyCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(line.expensedLegacyCost)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{formatCurrency(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Journal to post</p>
              <p className="mt-1">
                Dr Raw Material Inventory {formatCurrency(reclassification.amount)} · Cr Processing Expense{' '}
                {formatCurrency(reclassification.amount)}.
              </p>
              <p className="mt-2">
                Only the share still in on-hand pcs is capitalised. Quantities already sold or consumed keep the expense
                they were charged in their own period, and later manufacturing orders will credit the same cost from Raw
                Material Inventory.
              </p>
            </div>
          </FormSection>
        </form>
      </FormModal>
    </div>
  );
}
