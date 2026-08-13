import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { Eye, Edit, Trash2, Printer } from 'lucide-react';
import React, { useState, useMemo } from "react";
import { useERPStore } from "../store/useERPStore";
import { toast } from 'sonner';
import { ErrorManagement } from '../lib/validation';
import { PurchaseService } from '../services/PurchaseService';
import { Plus, FileText, X } from "lucide-react";
import { formatCurrency } from "../lib/utils";
import { DataTable, Column, RowActionButton } from "../components/DataTable";
import { SearchableSelect } from "../components/SearchableSelect";
import { QuickAddSupplier, QuickAddMaterial } from "../components/QuickAddModals";
import { VoucherHistoryTab } from "../components/VoucherHistoryTab";
import { Link } from 'react-router-dom';
import { generatePurchaseInvoicePDF } from "../lib/documentGenerators";

export function Purchases() {
  const { purchases, materials, suppliers, vouchers } = useERPStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editPurchaseId, setEditPurchaseId] = useState<string | undefined>();
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string, no: string}>({isOpen: false, id: '', no: ''});
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  const handleEditClick = (item: any) => {
    setEditPurchaseId(item.id);
    setSupplierId(item.supplierId);
    setMaterialId(item.materialId);
    setWeight(item.weight.toString());
    setWeightUnit(item.weightUnit);
    setWeightPerPiece(item.weightPerPiece.toString());
    setRatePerUnit(item.ratePerUnit.toString());
    setDate(item.date);
    setIsModalOpen(true);
  };

  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'data' | 'vouchers'>('data');
  
  const [supplierId, setSupplierId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"KGs" | "Tons">("KGs");
  const [ratePerUnit, setRatePerUnit] = useState("");
  const [weightPerPiece, setWeightPerPiece] = useState("");

  const selectedMaterial = materials.find(m => m.id === materialId);

  const calculatedPcsPreview = useMemo(() => {
    if (!weight || isNaN(parseFloat(weight)) || !weightPerPiece || isNaN(parseFloat(weightPerPiece))) return 0;
    const w = parseFloat(weight);
    const wpp = parseFloat(weightPerPiece);
    if (wpp <= 0) return 0;
    const weightInKg = weightUnit === "KGs" ? w : w * 1000;
    return Math.floor(weightInKg / wpp);
  }, [weight, weightUnit, weightPerPiece]);

  const totalAmountPreview = useMemo(() => {
    if (!weight || isNaN(parseFloat(weight)) || !ratePerUnit || isNaN(parseFloat(ratePerUnit))) return 0;
    return parseFloat(weight) * parseFloat(ratePerUnit);
  }, [weight, ratePerUnit]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !materialId || !weight || !date || !ratePerUnit || !weightPerPiece) return;
    
    ErrorManagement.safeExecuteSync(() => {
      const payload = {
        supplierId,
        materialId,
        date,
        weight: parseFloat(weight),
        weightUnit: weightUnit as 'KGs' | 'Tons',
        ratePerUnit: parseFloat(ratePerUnit),
        weightPerPiece: parseFloat(weightPerPiece)
      };

      if (editPurchaseId) {
        PurchaseService.update(editPurchaseId, payload);
      } else {
        PurchaseService.create(payload);
      }
      setIsModalOpen(false);
      setWeight("");
      setRatePerUnit("");
      setWeightPerPiece("");
    }, 'Purchase Save');
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

  const columns: Column<typeof enrichedPurchases[0]>[] = [
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "purchaseNo", label: "PO Number", sortable: true, render: (item) => <span className="font-medium text-foreground">{item.purchaseNo}</span> },
    { key: "supplierName", label: "Supplier", sortable: true, render: (item) => <span className="font-medium">{item.supplierName}</span> },
    { key: "materialName", label: "Material", sortable: true, render: (item) => <span className="text-muted-foreground">{item.materialName}</span> },
    { key: "weight", label: "Weight", align: "right", sortable: true, render: (item) => <span className="font-medium">{item.weight} {item.weightUnit}</span> },
    { key: "calculatedPcs", label: "Added PCS", align: "right", sortable: true, render: (item) => <span className="font-bold text-success">+{item.calculatedPcs} PCS</span> },
    { key: "amount", label: "Amount", align: "right", sortable: true, render: (item) => <span className="font-medium text-destructive">{formatCurrency(item.amount)}</span> },
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
          onClick={() => { setEditPurchaseId(undefined); setSupplierId(''); setMaterialId(''); setWeight(''); setWeightPerPiece(''); setRatePerUnit(''); setIsModalOpen(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Purchase
        </button>
      </div>

      <div className="flex border-b border-border/50">
        <button
          onClick={() => setActiveTab('data')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'data' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Purchase Records
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
          data={enrichedPurchases} 
          columns={columns} 
          searchKeys={["purchaseNo", "supplierName", "materialName"]} 
          searchPlaceholder="Search purchases by PO, supplier or material..."
          persistKey="purchases-table"
          defaultSortKey="date"
        />
      ) : (
        <VoucherHistoryTab sourceModule="Purchase" />
      )}

      {isModalOpen && !isAddSupplierOpen && !isAddMaterialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between sticky top-0 bg-card z-10">
              <h3 className="text-lg font-bold">{editPurchaseId ? "Edit Purchase" : "Add Purchase"}</h3>
              <button onClick={() => { setIsModalOpen(false); setEditPurchaseId(undefined); }}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 pb-64 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Supplier *</label>
                <SearchableSelect 
                  options={suppliers.map(s => ({ id: s.id, label: s.name, searchValue: s.phone }))}
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Select Supplier..."
                  onAdd={() => setIsAddSupplierOpen(true)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Material *</label>
                <SearchableSelect 
                  options={materials.map(m => ({ id: m.id, label: m.name }))}
                  value={materialId}
                  onChange={setMaterialId}
                  placeholder="Select Material..."
                  onAdd={() => setIsAddMaterialOpen(true)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Date *</label>
                <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3" />
              </div>
              
              <div className="flex gap-4">
                <div className="space-y-2 flex-1">
                  <label className="text-sm font-semibold">Weight *</label>
                  <input type="number" step="0.01" min="0.01" required value={weight} onChange={e => setWeight(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3" placeholder="Total weight" />
                </div>
                <div className="space-y-2 flex-1">
                  <label className="text-sm font-semibold">Unit *</label>
                  <select required value={weightUnit} onChange={e => setWeightUnit(e.target.value as any)} className="w-full rounded-xl border border-border px-4 py-3 bg-card">
                    <option value="KGs">KGs</option>
                    <option value="Tons">Tons</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Rate per Unit ({weightUnit}) *</label>
                <input type="number" step="0.01" min="0" required value={ratePerUnit} onChange={e => setRatePerUnit(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3" placeholder={`Price per ${weightUnit}`} />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold">Weight Per Piece (KGs) *</label>
                <input type="number" step="any" min="0.000001" required value={weightPerPiece} onChange={e => setWeightPerPiece(e.target.value)} className="w-full rounded-xl border border-border px-4 py-3" placeholder="Weight of one piece (e.g. 0.572)" />
              </div>

              <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Calculated PCS:</span>
                  <span className="text-sm font-bold text-foreground">{calculatedPcsPreview} PCS</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Amount:</span>
                  <span className="text-sm font-bold text-foreground">{formatCurrency(totalAmountPreview)}</span>
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-xl border border-border bg-card px-4 py-3 font-semibold text-foreground/80 hover:bg-muted/40 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md">Save Purchase</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', no: '' })}
        onConfirm={handleDelete}
        title="Delete Purchase"
        recordNo={deleteModal.no}
        description="Are you sure you want to permanently delete this purchase? All linked accounting entries, vouchers, batches, and stock movements will be reversed automatically."
      />

      <QuickAddSupplier 
        isOpen={isAddSupplierOpen} 
        onClose={() => setIsAddSupplierOpen(false)} 
        onSuccess={(id) => setSupplierId(id)} 
      />
      <QuickAddMaterial 
        isOpen={isAddMaterialOpen} 
        onClose={() => setIsAddMaterialOpen(false)} 
        onSuccess={(id) => setMaterialId(id)} 
      />
    </div>
  );
}
