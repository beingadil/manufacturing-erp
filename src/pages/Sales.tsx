import { Edit, Eye, Plus, Printer, Trash2, X } from 'lucide-react';
import React, { useMemo, useState } from "react";
import { Link } from 'react-router-dom';
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { QuickAddCustomer, QuickAddProduct } from "../components/QuickAddModals";
import { SearchableSelect } from "../components/SearchableSelect";
import { VoucherHistoryTab } from "../components/VoucherHistoryTab";
import { generateInvoicePDF } from "../lib/documentGenerators";
import { formatCurrency } from "../lib/utils";
import { ErrorManagement } from '../lib/validation';
import { SalesService } from '../services/SalesService';
import { useERPStore } from "../store/useERPStore";

export function Sales() {
  const { sales, products, materials, customers, vouchers } = useERPStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editSaleId, setEditSaleId] = useState<string | undefined>();
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string, no: string}>({isOpen: false, id: '', no: ''});
  const [activeTab, setActiveTab] = useState<'data' | 'vouchers'>('data');
  
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);

  const [productId, setProductId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [pcsSold, setPcsSold] = useState("");
  const [pricePerPiece, setPricePerPiece] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const selectedProduct = products.find(p => p.id === productId);
  const linkedMaterial = selectedProduct ? materials.find(m => m.id === selectedProduct.materialId) : null;
  const availableStock = linkedMaterial ? linkedMaterial.processedStockPcs : 0;

  
  const handleEditClick = (item: any) => {
    setEditSaleId(item.id);
    setCustomerId(item.customerId);
    setProductId(item.productId);
    setPcsSold(item.pcsSold.toString());
    setPricePerPiece(item.pricePerPiece.toString());
    setDate(item.date);
    setIsModalOpen(true);
  };

  const handleProductChange = (pId: string) => {
    setProductId(pId);
    const p = products.find(prod => prod.id === pId);
    if (p) setPricePerPiece(p.sellingPrice.toString());
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !customerId || !pcsSold || !pricePerPiece || !date) return;
    
    const pcs = parseInt(pcsSold);
    if (pcs > availableStock) {
      return;
    }

    const price = parseFloat(pricePerPiece);

    ErrorManagement.safeExecuteSync(() => {
      if (editSaleId) {
        SalesService.update(editSaleId, {
          productId,
          customerId,
          pcsSold: pcs,
          pricePerPiece: price,
          date
        });
      } else {
        SalesService.create({
          productId,
          customerId,
          pcsSold: pcs,
          pricePerPiece: price,
          date
        });
      }
      setIsModalOpen(false);
      setPcsSold("");
      setProductId("");
      setCustomerId("");
    }, 'Sales Save');
  };

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
        <RowActionButton onClick={() => handleEditClick(item)} label={`Edit ${item.invoiceNo}`} tone="primary">
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Sales</h2>
          <p className="text-sm text-muted-foreground mt-1">Record sales of finished products.</p>
        </div>
        <button onClick={() => { setEditSaleId(undefined); setCustomerId(''); setProductId(''); setPcsSold(''); setPricePerPiece(''); setIsModalOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Sale
        </button>
      </div>

      <div className="flex border-b border-border/50">
        <button
          onClick={() => setActiveTab('data')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'data' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Sales Records
        </button>
        <button
          onClick={() => setActiveTab('vouchers')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'vouchers' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Voucher History
        </button>
      </div>

      {activeTab === 'data' ? (
        <DataTable
          data={enrichedSales}
          columns={columns}
          searchKeys={["invoiceNo", "customerName", "productName"]}
          searchPlaceholder="Search sales by invoice, customer or product..."
          persistKey="sales-table"
          defaultSortKey="date"
        />
      ) : (
        <VoucherHistoryTab sourceModule="Sales" />
      )}

      {isModalOpen && !isAddCustomerOpen && !isAddProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">{editSaleId ? "Edit Sale" : "New Sale"}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditSaleId(undefined); }}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Customer</label>
                  <SearchableSelect 
                    options={customers.map(c => ({ id: c.id, label: c.name, searchValue: c.phone }))}
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="Select Customer..."
                    onAdd={() => setIsAddCustomerOpen(true)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Product</label>
                  <SearchableSelect 
                    options={products.map(p => {
                      const m = materials.find(mat => mat.id === p.materialId);
                      return { id: p.id, label: p.name, secondaryLabel: `Available: ${m?.processedStockPcs || 0} PCS` }
                    })}
                    value={productId}
                    onChange={handleProductChange}
                    placeholder="Select Product..."
                    onAdd={() => setIsAddProductOpen(true)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">PCS to Sell *</label>
                  <input type="number" required placeholder="Quantity" value={pcsSold} onChange={e => setPcsSold(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Price Per Piece (₹) *</label>
                  <input type="number" step="0.01" required placeholder="Rate" value={pricePerPiece} onChange={e => setPricePerPiece(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Date *</label>
                  <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3" />
                </div>
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => { setIsModalOpen(false); setEditSaleId(undefined); }} className="flex-1 rounded-xl border border-border bg-card px-4 py-3 font-semibold text-foreground/80 hover:bg-muted/40 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md">{editSaleId ? "Update Sale" : "Confirm Sale"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', no: '' })}
        onConfirm={handleDelete}
        title="Delete Sale"
        recordNo={deleteModal.no}
        description="Are you sure you want to permanently delete this sale? All linked accounting entries, vouchers, and stock movements will be reversed automatically."
      />

      <QuickAddCustomer 
        isOpen={isAddCustomerOpen} 
        onClose={() => setIsAddCustomerOpen(false)} 
        onSuccess={(id) => setCustomerId(id)} 
      />
      <QuickAddProduct 
        isOpen={isAddProductOpen} 
        onClose={() => setIsAddProductOpen(false)} 
        onSuccess={(id) => handleProductChange(id)} 
      />
    </div>
  );
}
