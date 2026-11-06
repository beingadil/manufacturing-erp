import { Banknote, CalendarDays, Edit, Eye, Plus, Printer, ReceiptText, ShoppingBag, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { KpiCard } from "../components/ui/KpiCard";
import { VoucherHistoryTab } from "../components/VoucherHistoryTab";
import { generateInvoicePDF } from "../lib/documentGenerators";
import { formatCurrency } from "../lib/utils";
import { ErrorManagement } from '../lib/validation';
import { SalesService } from '../services/SalesService';
import { useERPStore } from "../store/useERPStore";

export function Sales() {
  const { sales, products, customers, vouchers } = useERPStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'data' | 'vouchers'>(() => (searchParams.get('tab') === 'vouchers' ? 'vouchers' : 'data'));
  const navigate = useNavigate();

  // Sync tab to URL (?tab=data|vouchers) so refresh/back preserves the view.
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', activeTab);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string, no: string}>({isOpen: false, id: '', no: ''});

  const enrichedSales = useMemo(() => sales.map(s => {
    const c = customers.find(cust => cust.id === s.customerId);
    const p = products.find(prod => prod.id === s.productId);
    const voucher = vouchers.find(v => v.sourceId === s.id && v.sourceModule === 'Sales');
    return {
      ...s,
      customerName: c?.name || 'Unknown',
      productName: p?.name || 'Unknown',
      formattedDate: new Date(s.date).toLocaleDateString(),
      voucherNo: voucher?.voucherNo || null
    };
  }), [sales, customers, products, vouchers]);

  const columns: Column<typeof enrichedSales[0]>[] = [
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "invoiceNo", label: "Invoice No", sortable: true, render: (item) => <span className="font-medium text-foreground">{item.invoiceNo}</span> },
    { key: "customerName", label: "Customer", sortable: true },
    { key: "productName", label: "Product", sortable: true },
    { key: "pcsSold", label: "PCS Sold", align: "right", sortable: true, render: (item) => <span className="font-medium text-success">-{item.pcsSold} PCS</span> },
    { key: "totalAmount", label: "Amount", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{formatCurrency(item.totalAmount)}</span> },
    { key: "voucherNo", label: "Voucher #", sortable: true, render: (item) => item.voucherNo ? <Link to="/accounting/cashbook" className="font-mono text-xs text-primary hover:underline">{item.voucherNo}</Link> : <span className="text-muted-foreground/30 text-xs">—</span> }
    ,{ key: "actions", label: "Actions", align: "right", render: (item) => (
      <div className="flex justify-end gap-1">
        <RowActionButton
          onClick={() => {
            const customer = useERPStore.getState().customers.find(c => c.id === item.customerId);
            const product = useERPStore.getState().products.find(p => p.id === item.productId);
            generateInvoicePDF(item, customer, product);
          }}
          label={`Print invoice for ${item.invoiceNo}`}
        >
          <Printer />
        </RowActionButton>
        <RowActionButton label={`View ${item.invoiceNo}`}>
          <Eye />
        </RowActionButton>
        <RowActionButton onClick={() => navigate(`/sales/edit/${item.id}`)} label={`Edit ${item.invoiceNo}`} tone="primary">
          <Edit />
        </RowActionButton>
        <RowActionButton onClick={() => setDeleteModal({isOpen: true, id: item.id, no: item.invoiceNo})} label={`Delete ${item.invoiceNo}`} tone="destructive">
          <Trash2 />
        </RowActionButton>
      </div>
    ) }
  ];

  const handleDelete = () => {
    ErrorManagement.safeExecuteSync(() => {
      SalesService.delete(deleteModal.id);
      setDeleteModal({ isOpen: false, id: '', no: '' });
    }, 'Sales Delete');
  };

  // Record totals for the stats strip (mirrors the table below).
  const salesStats = useMemo(() => {
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    return {
      count: enrichedSales.length,
      pcs: enrichedSales.reduce((s, x) => s + (x.pcsSold || 0), 0),
      revenue: enrichedSales.reduce((s, x) => s + (x.totalAmount || 0), 0),
      monthRevenue: enrichedSales
        .filter(x => (x.date || '').startsWith(monthPrefix))
        .reduce((s, x) => s + (x.totalAmount || 0), 0),
    };
  }, [enrichedSales]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Sales</h2>
          <p className="text-sm text-muted-foreground mt-1">Record sales of finished products.</p>
        </div>
        <button onClick={() => navigate('/sales/new')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Sale
        </button>
      </div>

      <div className="flex border-b border-border/50">
        <button
          onClick={() => setActiveTab('data')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'data' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Sales Records
          <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{sales.length}</span>
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
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sales</div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{salesStats.count}</div>
              <div className="text-xs text-muted-foreground">Records in the register</div>
            </div>
            <div className="border-l border-border/60 pl-10">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">PCS Sold</div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{salesStats.pcs.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Finished pieces billed</div>
            </div>
            <div className="border-l border-border/60 pl-10">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Revenue</div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{formatCurrency(salesStats.revenue)}</div>
              <div className="text-xs text-muted-foreground">All recorded sales</div>
            </div>
            <div className="border-l border-border/60 pl-10">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">This Month</div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-violet-500">{formatCurrency(salesStats.monthRevenue)}</div>
              <div className="text-xs text-muted-foreground">Revenue in {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            </div>
          </section>
          <DataTable
            data={enrichedSales}
            columns={columns}
            searchKeys={["invoiceNo", "customerName", "productName"]}
            searchPlaceholder="Search sales by invoice, customer or product..."
            persistKey="sales-table"
            defaultSortKey="date"
          />
        </>
      ) : (
        <VoucherHistoryTab sourceModule="Sales" />
      )}

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', no: '' })}
        onConfirm={handleDelete}
        title="Delete Sale"
        recordNo={deleteModal.no}
        description="Are you sure you want to permanently delete this sale? All linked accounting entries, vouchers, and stock movements will be reversed automatically."
      />
    </div>
  );
}
