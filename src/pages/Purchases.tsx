import { CalendarDays, Edit, Eye, PackagePlus, Plus, Printer, ReceiptText, Trash2, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { KpiCard } from "../components/ui/KpiCard";
import { VoucherHistoryTab } from "../components/VoucherHistoryTab";
import { generatePurchaseInvoicePDF } from "../lib/documentGenerators";
import { formatCurrency } from "../lib/utils";
import { ErrorManagement } from '../lib/validation';
import { PurchaseService } from '../services/PurchaseService';
import { useERPStore } from "../store/useERPStore";

export function Purchases() {
  const { purchases, materials, suppliers, vouchers } = useERPStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string, no: string}>({isOpen: false, id: '', no: ''});
  const [activeTab, setActiveTab] = useState<'data' | 'vouchers'>(() => (searchParams.get('tab') === 'vouchers' ? 'vouchers' : 'data'));

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', activeTab);
    setSearchParams(params, { replace: true });
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditClick = (item: any) => {
    navigate(`/purchases/edit/${item.id}`);
  };

  const enrichedPurchases = useMemo(() => purchases.map(p => {
    const s = suppliers.find(sup => sup.id === p.supplierId);
    const m = materials.find(mat => mat.id === p.materialId);
    const voucher = vouchers.find(v => v.sourceId === p.id && v.sourceModule === 'Purchase');
    return {
      ...p,
      supplierName: s?.name || 'Unknown',
      materialName: m?.name || 'Unknown',
      formattedDate: new Date(p.date).toLocaleDateString(),
      voucherNo: voucher?.voucherNo || null
    };
  }), [purchases, suppliers, materials, vouchers]);

  const purchaseStats = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    return {
      count: enrichedPurchases.length,
      pcs: enrichedPurchases.reduce((s, p) => s + (p.calculatedPcs || 0), 0),
      value: enrichedPurchases.reduce((s, p) => s + (p.amount || 0), 0),
      monthValue: enrichedPurchases
        .filter(p => (p.date || '').startsWith(monthPrefix))
        .reduce((s, p) => s + (p.amount || 0), 0),
    };
  }, [enrichedPurchases]);

  const columns: Column<typeof enrichedPurchases[0]>[] = [
    { key: "formattedDate", label: "Date", sortable: true, render: (item) => <span className="whitespace-nowrap text-muted-foreground">{item.formattedDate}</span> },
    { key: "purchaseNo", label: "PO Number", sortable: true, render: (item) => <span className="font-mono text-xs font-semibold text-foreground">{item.purchaseNo}</span> },
    { key: "supplierName", label: "Supplier", sortable: true, render: (item) => (
      <span className="inline-flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary" aria-hidden>{item.supplierName.charAt(0).toUpperCase()}</span>
        <span className="font-medium">{item.supplierName}</span>
      </span>
    ) },
    { key: "materialName", label: "Material", sortable: true, render: (item) => <span className="text-muted-foreground">{item.materialName}</span> },
    { key: "weight", label: "Weight", align: "right", sortable: true, render: (item) => <span className="font-medium tabular-nums">{item.weight} {item.weightUnit}</span> },
    { key: "calculatedPcs", label: "Added PCS", align: "right", sortable: true, render: (item) => <span className="font-bold tabular-nums text-success">+{item.calculatedPcs} PCS</span> },
    { key: "amount", label: "Amount", align: "right", sortable: true, render: (item) => <span className="font-semibold tabular-nums text-destructive">{formatCurrency(item.amount)}</span> },
    { key: "voucherNo", label: "Voucher #", sortable: true, render: (item) => item.voucherNo ? <Link to="/accounting/cashbook" className="font-mono text-xs text-primary hover:underline">{item.voucherNo}</Link> : <span className="text-muted-foreground/30 text-xs">—</span> }
    ,{ key: "actions", label: "Actions", align: "right", render: (item) => (
      <div className="flex justify-end gap-1">
        <RowActionButton
          onClick={() => {
            const supplier = useERPStore.getState().suppliers.find(s => s.id === item.supplierId);
            const material = useERPStore.getState().materials.find(m => m.id === item.materialId);
            generatePurchaseInvoicePDF(item, supplier, material);
          }}
          label={`Print invoice for ${item.purchaseNo}`}
        >
          <Printer />
        </RowActionButton>
        <RowActionButton label={`View ${item.purchaseNo}`}>
          <Eye />
        </RowActionButton>
        <RowActionButton onClick={() => handleEditClick(item)} label={`Edit ${item.purchaseNo}`} tone="primary">
          <Edit />
        </RowActionButton>
        <RowActionButton onClick={() => setDeleteModal({isOpen: true, id: item.id, no: item.purchaseNo})} label={`Delete ${item.purchaseNo}`} tone="destructive">
          <Trash2 />
        </RowActionButton>
      </div>
    ) }
  ];

  const handleDelete = () => {
    ErrorManagement.safeExecuteSync(() => {
      PurchaseService.delete(deleteModal.id);
      setDeleteModal({ isOpen: false, id: '', no: '' });
    }, 'Purchase Delete');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Purchases</h2>
          <p className="text-sm text-muted-foreground mt-1">Record raw material purchases and piece calculations.</p>
        </div>
        <button
          onClick={() => navigate('/purchases/new')}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Purchase
        </button>
      </div>

      <div className="flex border-b border-border/50">
        <button
          onClick={() => setActiveTab('data')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'data' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Purchase Records
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{purchases.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('vouchers')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'vouchers' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Voucher History
        </button>
      </div>

      {activeTab === 'data' ? (
        <>
          {/* Live totals strip — mirrors exactly what the table below shows */}
          <section className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Purchases</div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{purchaseStats.count}</div>
              <div className="text-xs text-muted-foreground">Records in the register</div>
            </div>
            <div className="border-l border-border/60 pl-10">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">PCS Added</div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{purchaseStats.pcs.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Raw pieces received</div>
            </div>
            <div className="border-l border-border/60 pl-10">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Spend</div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-destructive">{formatCurrency(purchaseStats.value)}</div>
              <div className="text-xs text-muted-foreground">All recorded purchases</div>
            </div>
            <div className="border-l border-border/60 pl-10">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">This Month</div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-blue-500">{formatCurrency(purchaseStats.monthValue)}</div>
              <div className="text-xs text-muted-foreground">Spend in {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            </div>
          </section>
          <DataTable 
            data={enrichedPurchases} 
            columns={columns} 
            searchKeys={["purchaseNo", "supplierName", "materialName", "formattedDate", "weight", "calculatedPcs", "amount"]} 
            searchPlaceholder="Search purchases by PO, supplier, material, date, weight, pcs or amount..."
            persistKey="purchases-table"
            defaultSortKey="date"
          />
        </>
      ) : (
        <VoucherHistoryTab sourceModule="Purchase" />
      )}

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', no: '' })}
        onConfirm={handleDelete}
        title="Delete Purchase"
        recordNo={deleteModal.no}
        description="Are you sure you want to permanently delete this purchase? All linked accounting entries, vouchers, batches, and stock movements will be reversed automatically."
      />

    </div>
  );
}
