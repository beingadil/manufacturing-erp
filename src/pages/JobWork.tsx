import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { Eye, Edit, Trash2, Printer } from 'lucide-react';
import React, { useState, useMemo } from "react";
import { useERPStore } from "../store/useERPStore";
import { Plus, ArrowRight, ArrowLeft, CheckCircle2, X } from "lucide-react";
import { DataTable, Column } from "../components/DataTable";
import { formatCurrency } from "../lib/utils";
import { SearchableSelect } from "../components/SearchableSelect";
import { QuickAddProcessor, QuickAddMaterial } from "../components/QuickAddModals";
import { VoucherHistoryTab } from "../components/VoucherHistoryTab";
import { generateDispatchSlipPDF, generateProcessorBillPDF } from "../lib/documentGenerators";
import { ErrorManagement } from '../lib/validation';
import { Link } from 'react-router-dom';
import { ProcessingService } from '../services/ProcessingService';

export function JobWork() {
  const { 
    materials, processors, processingSends, processingReceipts, processorBills, vouchers,
    addProcessingSend, addProcessingReceipt, addProcessorBill, batches 
  } = useERPStore();
  
  const [activeTab, setActiveTab] = useState<"Send" | "Receive" | "Billing" | "Vouchers">("Send");
  
  const [isAddProcessorOpen, setIsAddProcessorOpen] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);

  // Send Form
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, type: 'send'|'receipt'|'bill', id: string, no: string}>({isOpen: false, type: 'send', id: '', no: ''});
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [editSendId, setEditSendId] = useState<string | undefined>();
  const [sendProcessorId, setSendProcessorId] = useState("");
  const [sendMaterialId, setSendMaterialId] = useState("");
  const [sendBatchId, setSendBatchId] = useState("");
  const [sendPcs, setSendPcs] = useState("");
  const [sendRate, setSendRate] = useState("");
  const [sendDate, setSendDate] = useState(new Date().toISOString().split('T')[0]);
  const [sendNote, setSendNote] = useState("");
  const [adjustPendingIds, setAdjustPendingIds] = useState<string[]>([]);

  const sendSelectedMaterial = materials.find(m => m.id === sendMaterialId);
  const availableBatches = (batches || []).filter(b => b.materialId === sendMaterialId && b.remainingPcs > 0);
  
  // Find previous pending sends for the selected processor to allow adjustment
  const previousPendingSends = useMemo(() => {
    if (!sendProcessorId) return [];
    return processingSends.filter(s => 
      s.processorId === sendProcessorId && 
      (s.status === 'Pending' || s.status === 'Partial')
    );
  }, [processingSends, sendProcessorId]);

  
  const handleEditSend = (item: any) => {
    setEditSendId(item.id);
    setSendProcessorId(item.processorId);
    setSendMaterialId(item.materialId);
    setSendPcs(item.pcsSent.toString());
    setSendRate(item.ratePerPiece.toString());
    setSendDate(item.date);
    setIsSendModalOpen(true);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendProcessorId || !sendMaterialId || !sendPcs || !sendRate || !sendDate) return;
    
    const pcs = parseInt(sendPcs);
    if (sendSelectedMaterial && pcs > sendSelectedMaterial.stockPcs) {
      return;
    }
    
    if (sendBatchId) {
       const b = availableBatches.find(bat => bat.id === sendBatchId);
       if (b && pcs > b.remainingPcs) return; // validate batch qty
    }

    if (editSendId) {
      useERPStore.getState().updateProcessingSend(editSendId, {
        processorId: sendProcessorId,
        materialId: sendMaterialId,
        batchId: sendBatchId || undefined,
        pcsSent: pcs,
        ratePerPiece: parseFloat(sendRate),
        date: sendDate,
        remarks: sendNote
      });
    } else {
      addProcessingSend({
        processorId: sendProcessorId,
        materialId: sendMaterialId,
        batchId: sendBatchId || undefined,
        pcsSent: pcs,
        ratePerPiece: parseFloat(sendRate),
        date: sendDate,
        remarks: sendNote
      }, adjustPendingIds.length > 0 ? adjustPendingIds : undefined);
    }
    
    setIsSendModalOpen(false);
    setSendPcs("");
    setSendRate("");
    setSendNote("");
    setSendBatchId("");
    setAdjustPendingIds([]);
  };

  // Receive Form
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [editReceiveId, setEditReceiveId] = useState<string | undefined>();
  const [receiveProcessorId, setReceiveProcessorId] = useState("");
  const [receiveSendId, setReceiveSendId] = useState("");
  const [receivePcs, setReceivePcs] = useState("");
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);

  const openSends = processingSends.filter(s => s.processorId === receiveProcessorId && (s.status === 'Pending' || s.status === 'Partial'));
  const selectedSend = processingSends.find(s => s.id === receiveSendId);
  
  
  const handleEditReceive = (item: any) => {
    setEditReceiveId(item.id);
    setReceiveProcessorId(item.processorId);
    setReceiveSendId(item.sendId);
    setReceivePcs(item.pcsReceived.toString());
    setReceiveDate(item.date);
    setIsReceiveModalOpen(true);
  };

  const handleReceive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveProcessorId || !receiveSendId || !receivePcs || !receiveDate) return;
    if (!selectedSend) return;

    const pcs = parseInt(receivePcs);
    const maxPcs = selectedSend.pcsSent - selectedSend.pcsReceived;
    if (pcs > maxPcs) {
      return;
    }

    ErrorManagement.safeExecuteSync(() => {
      if (editReceiveId) {
        ProcessingService.updateReceive(editReceiveId, {
          sendId: receiveSendId,
          processorId: receiveProcessorId,
          materialId: selectedSend.materialId,
          pcsReceived: pcs,
          date: receiveDate
        });
      } else {
        const previouslyReceived = processingReceipts
          .filter(r => r.sendId === receiveSendId)
          .reduce((sum, r) => sum + r.pcsReceived, 0);

        ProcessingService.receive({
          sendId: receiveSendId,
          processorId: receiveProcessorId,
          materialId: selectedSend.materialId,
          date: receiveDate,
          pcsReceived: pcs,
          dispatchedPcs: selectedSend.pcsSent,
          previouslyReceivedPcs: previouslyReceived
        });
      }
      setIsReceiveModalOpen(false);
      setReceivePcs("");
    }, 'Processing Receive Save');
  };

  // Billing Form
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [editBillId, setEditBillId] = useState<string | undefined>();
  const [billProcessorId, setBillProcessorId] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedReceiptsForBill, setSelectedReceiptsForBill] = useState<string[]>([]);
  
  const unbilledReceipts = useMemo(() => {
    if (!billProcessorId) return [];
    return processingReceipts.filter(r => r.processorId === billProcessorId && r.billedStatus === "Unbilled");
  }, [processingReceipts, billProcessorId]);

  const handleEditBill = (item: any) => {
    setEditBillId(item.id);
    setBillProcessorId(item.processorId);
    setSelectedReceiptsForBill(item.receiptIds || []);
    setBillDate(item.date);
    setIsBillModalOpen(true);
  };

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billProcessorId || selectedReceiptsForBill.length === 0) return;
    if (editBillId) {
      useERPStore.getState().updateProcessorBill(editBillId, {
        processorId: billProcessorId,
        date: billDate,
        receiptIds: selectedReceiptsForBill
      });
    } else {
      addProcessorBill({
        processorId: billProcessorId,
        date: billDate,
        receiptIds: selectedReceiptsForBill,
        remarks: "Generated from pending receipts"
      });
    }
    setIsBillModalOpen(false);
    setSelectedReceiptsForBill([]);
    setBillProcessorId("");
  };

  const enrichedSends = useMemo(() => processingSends.map(s => {
    const p = processors.find(pr => pr.id === s.processorId);
    const m = materials.find(mat => mat.id === s.materialId);
    return {
      ...s,
      processorName: p?.name || 'Unknown',
      materialName: m?.name || 'Unknown',
      formattedDate: new Date(s.date).toLocaleDateString(),
      pendingPcs: s.pcsSent - s.pcsReceived
    };
  }), [processingSends, processors, materials]);

  const sendColumns: Column<typeof enrichedSends[0]>[] = [
    { key: 'actions', label: 'Actions', align: 'right', render: (item) => (
      <div className="flex justify-end gap-2">
        <button 
          onClick={() => {
            const processor = processors.find(p => p.id === item.processorId);
            const material = materials.find(m => m.id === item.materialId);
            generateDispatchSlipPDF(item, processor, material);
          }}
          className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"
          title="Print Dispatch Slip"
        >
          <Printer className="h-4 w-4" />
        </button>
        <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Eye className="h-4 w-4" /></button>
        <button onClick={() => handleEditSend(item)} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
        <button onClick={() => setDeleteModal({isOpen: true, type: 'send', id: item.id, no: item.dispatchNo || 'Unknown'})} className="p-1.5 hover:bg-destructive/10 text-destructive rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "processorName", label: "Processor", sortable: true, render: (item) => <span className="font-medium">{item.processorName}</span> },
    { key: "materialName", label: "Material", sortable: true },
    { key: "pcsSent", label: "Sent", align: "right", sortable: true, render: (item) => <span className="font-medium">{item.pcsSent} PCS</span> },
    { key: "pcsReceived", label: "Received", align: "right", sortable: true, render: (item) => <span className="font-medium text-success">{item.pcsReceived} PCS</span> },
    { key: "pendingPcs", label: "Pending", align: "right", sortable: true, render: (item) => <span className="font-bold text-destructive">{item.pendingPcs} PCS</span> },
    { 
      key: "status", 
      label: "Status", 
      align: "right", 
      sortable: true,
      render: (item) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-md ${item.status === 'Closed' ? 'bg-muted text-muted-foreground' : 'bg-warning/10 text-warning'}`}>
          {item.status}
        </span>
      )
    }
  ];

  const enrichedReceipts = useMemo(() => processingReceipts.map(r => {
    const p = processors.find(pr => pr.id === r.processorId);
    const m = materials.find(mat => mat.id === r.materialId);
    return {
      ...r,
      processorName: p?.name || 'Unknown',
      materialName: m?.name || 'Unknown',
      formattedDate: new Date(r.date).toLocaleDateString()
    };
  }), [processingReceipts, processors, materials]);

  const receiptColumns: Column<typeof enrichedReceipts[0]>[] = [
    { key: 'actions', label: 'Actions', align: 'right', render: (item) => (
      <div className="flex justify-end gap-2">
        <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Eye className="h-4 w-4" /></button>
        <button onClick={() => handleEditReceive(item)} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
        <button onClick={() => setDeleteModal({isOpen: true, type: 'receipt', id: item.id, no: item.receiveNo || 'Unknown'})} className="p-1.5 hover:bg-destructive/10 text-destructive rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "processorName", label: "Processor", sortable: true, render: (item) => <span className="font-medium">{item.processorName}</span> },
    { key: "materialName", label: "Material", sortable: true },
    { key: "pcsReceived", label: "Received", align: "right", sortable: true, render: (item) => <span className="font-medium text-success">+{item.pcsReceived} PCS</span> },
    { key: "billAmount", label: "Bill Amount", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{formatCurrency(item.billAmount)}</span> }
  ];

  const enrichedBills = useMemo(() => processorBills.map(b => {
    const p = processors.find(pr => pr.id === b.processorId);
    const voucher = vouchers.find(v => v.sourceId === b.id && v.sourceModule === 'Processing');
    return {
      ...b,
      processorName: p?.name || 'Unknown',
      formattedDate: new Date(b.date).toLocaleDateString(),
      voucherNo: voucher?.voucherNo || null
    };
  }), [processorBills, processors, vouchers]);

  const billColumns: Column<typeof enrichedBills[0]>[] = [
    { key: 'actions', label: 'Actions', align: 'right', render: (item) => (
      <div className="flex justify-end gap-2">
        <button 
          onClick={() => {
            const processor = processors.find(p => p.id === item.processorId);
            const includedReceipts = processingReceipts.filter((r: any) => item.receiptIds.includes(r.id));
            generateProcessorBillPDF(item, processor, includedReceipts, materials);
          }}
          className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"
          title="Print Bill"
        >
          <Printer className="h-4 w-4" />
        </button>
        <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Eye className="h-4 w-4" /></button>
        <button onClick={() => handleEditBill(item)} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
        <button onClick={() => setDeleteModal({isOpen: true, type: 'bill', id: item.id, no: item.billNo || 'Unknown'})} className="p-1.5 hover:bg-destructive/10 text-destructive rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "billNo", label: "Bill #", sortable: true, render: (item) => <span className="font-mono text-sm">{item.billNo}</span> },
    { key: "processorName", label: "Processor", sortable: true, render: (item) => <span className="font-medium">{item.processorName}</span> },
    { key: "receiptIds", label: "Receipts Included", sortable: false, render: (item) => <span className="text-muted-foreground">{item.receiptIds.length} receipts</span> },
    { key: "totalAmount", label: "Bill Amount", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{formatCurrency(item.totalAmount)}</span> },
    { key: "voucherNo", label: "Voucher #", sortable: true, render: (item) => item.voucherNo ? <Link to="/accounting/cashbook" className="font-mono text-xs text-primary hover:underline">{item.voucherNo}</Link> : <span className="text-muted-foreground/30 text-xs">—</span> }
  ];

  
  const handleDelete = () => {
    const store = useERPStore.getState();
    if (deleteModal.type === 'send') store.deleteProcessingSend(deleteModal.id);
    else if (deleteModal.type === 'receipt') store.deleteProcessingReceipt(deleteModal.id);
    else if (deleteModal.type === 'bill') store.deleteProcessorBill(deleteModal.id);
  };
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Processing (Job Work)</h2>
          <p className="text-sm text-muted-foreground mt-1">Send raw materials to processors and receive finished goods.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setEditBillId(undefined); setBillProcessorId(''); setSelectedReceiptsForBill([]); setIsBillModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            <CheckCircle2 className="h-4 w-4" /> Generate Bill
          </button>
          <button
            onClick={() => { setEditReceiveId(undefined); setReceiveProcessorId(''); setReceiveSendId(''); setReceivePcs(''); setIsReceiveModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            <ArrowLeft className="h-4 w-4" /> Receive
          </button>
          <button
            onClick={() => { setEditSendId(undefined); setSendProcessorId(''); setSendMaterialId(''); setSendPcs(''); setSendRate(''); setIsSendModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ArrowRight className="h-4 w-4" /> Send
          </button>
        </div>
      </div>

      <div className="flex gap-6 border-b border-border">
        <button
          onClick={() => setActiveTab("Send")}
          className={`pb-4 text-sm font-semibold transition-colors border-b-2 ${activeTab === "Send" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
        >
          Sent Orders (Pending)
        </button>
        <button
          onClick={() => setActiveTab("Receive")}
          className={`pb-4 text-sm font-semibold transition-colors border-b-2 ${activeTab === "Receive" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
        >
          Receipts History
        </button>
        <button
          onClick={() => setActiveTab("Billing")}
          className={`pb-4 text-sm font-semibold transition-colors border-b-2 ${activeTab === "Billing" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
        >
          Processor Bills
        </button>
        <button
          onClick={() => setActiveTab("Vouchers")}
          className={`pb-4 text-sm font-semibold transition-colors border-b-2 ${activeTab === "Vouchers" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
        >
          Voucher History
        </button>
      </div>

      {activeTab === "Send" ? (
        <DataTable
          data={enrichedSends}
          columns={sendColumns}
          searchKeys={["processorName", "materialName", "status"]}
          searchPlaceholder="Search sent orders..."
          persistKey="jobwork-sends-table"
          defaultSortKey="date"
        />
      ) : activeTab === "Receive" ? (
        <DataTable
          data={enrichedReceipts}
          columns={receiptColumns}
          searchKeys={["processorName", "materialName"]}
          searchPlaceholder="Search receipts..."
          persistKey="jobwork-receipts-table"
          defaultSortKey="date"
        />
      ) : activeTab === "Billing" ? (
        <DataTable
          data={enrichedBills}
          columns={billColumns}
          searchKeys={["processorName", "billNo"]}
          searchPlaceholder="Search bills..."
          persistKey="jobwork-bills-table"
          defaultSortKey="date"
        />
      ) : (
        <VoucherHistoryTab sourceModule="Processing" />
      )}

      {isSendModalOpen && !isAddProcessorOpen && !isAddMaterialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">Send to Processor</h3>
              <button onClick={() => { setIsSendModalOpen(false); setEditSendId(undefined); }}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleSend} className="p-6 pb-64 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Processor</label>
                <SearchableSelect 
                  options={processors.map(p => ({ id: p.id, label: p.name, searchValue: p.phone }))}
                  value={sendProcessorId}
                  onChange={setSendProcessorId}
                  placeholder="Select Processor..."
                  onAdd={() => setIsAddProcessorOpen(true)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Material</label>
                <SearchableSelect 
                  options={materials.map(m => ({ id: m.id, label: m.name, secondaryLabel: `Available: ${m.stockPcs} PCS` }))}
                  value={sendMaterialId}
                  onChange={(val) => { setSendMaterialId(val); setSendBatchId(""); }}
                  placeholder="Select Material..."
                  onAdd={() => setIsAddMaterialOpen(true)}
                  required
                />
              </div>
              {sendMaterialId && (
                <select value={sendBatchId} onChange={e => setSendBatchId(e.target.value)} className="w-full rounded-xl border p-3 text-sm">
                  <option value="">Auto (oldest batch first)</option>
                  {availableBatches.map(b => <option key={b.id} value={b.id}>{b.batchNo} (Available: {b.remainingPcs} PCS)</option>)}
                </select>
              )}
              <input type="number" required placeholder="PCS to Send" value={sendPcs} onChange={e => setSendPcs(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <input type="number" step="0.01" required placeholder="Rate Per Piece (₹)" value={sendRate} onChange={e => setSendRate(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <input type="date" required value={sendDate} onChange={e => setSendDate(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              
              {previousPendingSends.length > 0 && (
                <div className="bg-warning/10 border border-amber-200 rounded-xl p-4 mt-2">
                  <h4 className="text-sm font-semibold text-amber-800 mb-2">Processor has pending items. Adjust into new dispatch?</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {previousPendingSends.map(s => {
                      const m = materials.find(mat => mat.id === s.materialId);
                      const pending = s.pcsSent - s.pcsReceived;
                      return (
                        <label key={s.id} className="flex items-start gap-2 text-sm text-amber-900 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="mt-1"
                            checked={adjustPendingIds.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) setAdjustPendingIds(prev => [...prev, s.id]);
                              else setAdjustPendingIds(prev => prev.filter(id => id !== s.id));
                            }}
                          />
                          <span>{m?.name || 'Material'}: {pending} PCS from {s.dispatchNo} ({new Date(s.date).toLocaleDateString()})</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" className="flex-1 rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Send Items</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isReceiveModalOpen && !isAddProcessorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">Receive from Processor</h3>
              <button onClick={() => { setIsReceiveModalOpen(false); setEditReceiveId(undefined); }}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleReceive} className="p-6 pb-64 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Processor</label>
                <SearchableSelect 
                  options={processors.map(p => ({ id: p.id, label: p.name, searchValue: p.phone }))}
                  value={receiveProcessorId}
                  onChange={(val) => { setReceiveProcessorId(val); setReceiveSendId(""); }}
                  placeholder="Select Processor..."
                  onAdd={() => setIsAddProcessorOpen(true)}
                  required
                />
              </div>
              <select required value={receiveSendId} onChange={e => setReceiveSendId(e.target.value)} className="w-full rounded-xl border p-3 text-sm" disabled={!receiveProcessorId}>
                <option value="">Select Pending Send Entry</option>
                {openSends.map(s => {
                  const m = materials.find(mat => mat.id === s.materialId);
                  return <option key={s.id} value={s.id}>{new Date(s.date).toLocaleDateString()} - {m?.name} ({s.pcsSent - s.pcsReceived} pending)</option>;
                })}
              </select>
              <input type="number" required placeholder="PCS Received" value={receivePcs} onChange={e => setReceivePcs(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <input type="date" required value={receiveDate} onChange={e => setReceiveDate(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <div className="flex gap-3">
                <button type="submit" className="flex-1 rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Receive Items</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBillModalOpen && !isAddProcessorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">Generate Processor Bill</h3>
              <button onClick={() => { setIsBillModalOpen(false); setEditBillId(undefined); }}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleCreateBill} className="p-6 pb-64 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <SearchableSelect 
                    options={processors.map(p => ({ id: p.id, label: p.name, searchValue: p.phone }))}
                    value={billProcessorId}
                    onChange={(val) => { setBillProcessorId(val); setSelectedReceiptsForBill([]); }}
                    placeholder="Select Processor..."
                    onAdd={() => setIsAddProcessorOpen(true)}
                    required
                  />
                </div>
                <input type="date" required value={billDate} onChange={e => setBillDate(e.target.value)} className="w-1/3 rounded-xl border p-3 text-sm" />
              </div>
              
              {billProcessorId && unbilledReceipts.length === 0 && (
                <div className="p-4 bg-muted/40 rounded-xl text-center text-sm text-muted-foreground">
                  No unbilled receipts found for this processor.
                </div>
              )}

              {unbilledReceipts.length > 0 && (
                <div className="border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="px-4 py-2 w-10"></th>
                        <th className="px-4 py-2">Receipt</th>
                        <th className="px-4 py-2">Material</th>
                        <th className="px-4 py-2 text-right">PCS</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {unbilledReceipts.map(r => {
                        const m = materials.find(mat => mat.id === r.materialId);
                        return (
                          <tr key={r.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => {
                            if (selectedReceiptsForBill.includes(r.id)) setSelectedReceiptsForBill(prev => prev.filter(id => id !== r.id));
                            else setSelectedReceiptsForBill(prev => [...prev, r.id]);
                          }}>
                            <td className="px-4 py-3">
                              <input 
                                type="checkbox"
                                className="pointer-events-none"
                                checked={selectedReceiptsForBill.includes(r.id)}
                                readOnly
                              />
                            </td>
                            <td className="px-4 py-3">{r.receiveNo} <br/><span className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString()}</span></td>
                            <td className="px-4 py-3">{m?.name}</td>
                            <td className="px-4 py-3 text-right">{r.pcsReceived}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.billAmount)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedReceiptsForBill.length > 0 && (
                <div className="flex justify-between items-center p-4 bg-muted/40 rounded-xl">
                  <span className="font-medium text-foreground/80">Total Selected: {selectedReceiptsForBill.length} receipts</span>
                  <span className="text-xl font-bold text-foreground">
                    {formatCurrency(unbilledReceipts.filter(r => selectedReceiptsForBill.includes(r.id)).reduce((sum, r) => sum + r.billAmount, 0))}
                  </span>
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" disabled={selectedReceiptsForBill.length === 0} className="flex-1 rounded-xl bg-primary p-3 text-primary-foreground font-semibold disabled:opacity-50">Create Bill</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <QuickAddProcessor 
        isOpen={isAddProcessorOpen} 
        onClose={() => setIsAddProcessorOpen(false)} 
        onSuccess={(id) => {
          if (isSendModalOpen) setSendProcessorId(id);
          else if (isReceiveModalOpen) setReceiveProcessorId(id);
          else if (isBillModalOpen) setBillProcessorId(id);
        }} 
      />
      <QuickAddMaterial 
        isOpen={isAddMaterialOpen} 
        onClose={() => setIsAddMaterialOpen(false)} 
        onSuccess={(id) => setSendMaterialId(id)} 
      />
    </div>
  );
}
