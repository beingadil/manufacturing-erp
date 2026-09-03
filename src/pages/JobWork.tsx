import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Edit, Eye, Printer, Trash2 } from 'lucide-react';
import { useMemo, useState } from "react";
import { Link } from 'react-router-dom';
import { Column, DataTable } from "../components/DataTable";
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { CreateProcessorBillForm } from '../components/processing/CreateProcessorBillForm';
import { DispatchDetailModal } from '../components/processing/DispatchDetailModal';
import { ReceiveFromProcessorForm } from '../components/processing/ReceiveFromProcessorForm';
import { SendToProcessorForm } from '../components/processing/SendToProcessorForm';
import { StageManagerPanel } from '../components/processing/StageManagerPanel';
import { StageTimelinePanel } from '../components/processing/StageTimelinePanel';
import { WipBoard } from '../components/processing/WipBoard';
import { WipStageStrip } from '../components/processing/WipStageStrip';
import { PageModal } from "../components/ui/PageModal";
import { VoucherHistoryTab } from "../components/VoucherHistoryTab";
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { generateDispatchSlipPDF, generateProcessorBillPDF } from "../lib/documentGenerators";
import { getSortedStages } from '../lib/processing/stageProgress';
import { formatCurrency } from "../lib/utils";
import { ErrorManagement } from '../lib/validation';
import { ProcessingService } from '../services/ProcessingService';
import { useERPStore } from "../store/useERPStore";

type JobWorkTab = "Board" | "Send" | "Receive" | "Billing" | "Vouchers" | "Timeline" | "Stages";

export function JobWork() {
  const {
    materials, processors, processingSends, processingReceipts, processorBills, vouchers,
    batches, processingStages
  } = useERPStore();

  const [activeTab, setActiveTab] = useState<JobWorkTab>("Board");

  // ── Modal state ──────────────────────────────────────────────────────────
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [editSendId, setEditSendId] = useState<string | undefined>();
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [editReceiveId, setEditReceiveId] = useState<string | undefined>();
  const [isBillOpen, setIsBillOpen] = useState(false);
  const [editBillId, setEditBillId] = useState<string | undefined>();
  const [detailSendId, setDetailSendId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'send' | 'receipt' | 'bill'; id: string; no: string }>({ isOpen: false, type: 'send', id: '', no: '' });
  const [lossModal, setLossModal] = useState<{ isOpen: boolean; sendId: string; dispatchNo: string; pending: number }>({ isOpen: false, sendId: '', dispatchNo: '', pending: 0 });
  const [lossQty, setLossQty] = useState('');

  // ── Stage filters for tables ─────────────────────────────────────────────
  const [sendStageFilter, setSendStageFilter] = useState('');
  const [receiveStageFilter, setReceiveStageFilter] = useState('');
  const [timelineBatchId, setTimelineBatchId] = useState('');

  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);

  // WIP-by-stage derivation for the header strip (same basis as the dashboard).
  const stageWip = useMemo(() => sortedStages
    .filter(s => !s.isFinalStage)
    .map(stage => {
      const pcs = InventoryCalculationService.getStageWIP(stage.id, processingSends, processingReceipts);
      const totalWip = materials.reduce((sum, m) => sum + (m.atProcessorPcs || 0), 0);
      const value = totalWip > 0 ? pcs * (totalWip > 0 ? 1 : 0) : 0;
      return { stageId: stage.id, name: stage.name, sequence: stage.sequence, pcs, value };
    }), [sortedStages, processingSends, processingReceipts, materials]);
  const totalWipPcs = materials.reduce((sum, m) => sum + (m.atProcessorPcs || 0), 0);

  // ── Enriched rows for tables ─────────────────────────────────────────────
  const enrichedSends = useMemo(() => processingSends.map(s => {
    const p = processors.find(pr => pr.id === s.processorId);
    const m = materials.find(mat => mat.id === s.materialId);
    const stage = processingStages.find(st => st.id === s.stageId);
    const batch = batches.find(b => b.id === s.batchId);
    return {
      ...s,
      processorName: p?.name || 'Unknown',
      materialName: m?.name || 'Unknown',
      stageName: stage ? stage.name : 'Initial Processor',
      batchNo: batch?.batchNo || (s.batchId ? s.batchId : '—'),
      formattedDate: new Date(s.date).toLocaleDateString(),
      pendingPcs: s.pcsSent - s.pcsReceived - (s.lossQuantity || 0),
      lossPcs: s.lossQuantity || 0,
      batchStageProgress: batch ? { batch, stages: processingStages } : null,
    };
  }), [processingSends, processors, materials, processingStages, batches]);

  const filteredSends = useMemo(() => sendStageFilter
    ? enrichedSends.filter(s => (s.stageId || '') === sendStageFilter)
    : enrichedSends, [enrichedSends, sendStageFilter]);

  const enrichedReceipts = useMemo(() => processingReceipts.map(r => {
    const p = processors.find(pr => pr.id === r.processorId);
    const m = materials.find(mat => mat.id === r.materialId);
    const stage = processingStages.find(st => st.id === r.stageId);
    return {
      ...r,
      processorName: p?.name || 'Unknown',
      materialName: m?.name || 'Unknown',
      stageName: stage ? stage.name : (r.stageId ? r.stageId : 'Initial Processor'),
      formattedDate: new Date(r.date).toLocaleDateString()
    };
  }), [processingReceipts, processors, materials, processingStages]);

  const filteredReceipts = useMemo(() => receiveStageFilter
    ? enrichedReceipts.filter(r => (r.stageId || '') === receiveStageFilter)
    : enrichedReceipts, [enrichedReceipts, receiveStageFilter]);

  const enrichedBills = useMemo(() => processorBills.map(b => {
    const p = processors.find(pr => pr.id === b.processorId);
    const voucher = vouchers.find(v => v.sourceId === b.id && v.sourceModule === 'Processing');
    const stage = processingStages.find(st => st.id === b.stageId);
    return {
      ...b,
      processorName: p?.name || 'Unknown',
      formattedDate: new Date(b.date).toLocaleDateString(),
      voucherNo: voucher?.voucherNo || null,
      stageName: stage ? stage.name : '—',
    };
  }), [processorBills, processors, vouchers, processingStages]);

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
        <button onClick={() => setDetailSendId(item.id)} aria-label="View dispatch details" className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Eye className="h-4 w-4" /></button>
        <button onClick={() => { setEditSendId(item.id); setIsSendOpen(true); }} aria-label="Edit dispatch" className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
        <button
          onClick={() => setLossModal({ isOpen: true, sendId: item.id, dispatchNo: item.dispatchNo || 'Unknown', pending: item.pendingPcs })}
          disabled={item.pendingPcs <= 0}
          title={item.pendingPcs > 0 ? 'Record loss/wastage' : 'No pending pcs to record as loss'}
          className="p-1.5 rounded-md text-warning transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-warning/10"
        ><AlertTriangle className="h-4 w-4" /></button>
        <button
          onClick={() => setDeleteModal({ isOpen: true, type: 'send', id: item.id, no: item.dispatchNo || 'Unknown' })}
          aria-label="Delete dispatch (also removes its receipts and bills)"
          title="Delete dispatch (also removes its receipts and bills)"
          className="p-1.5 rounded-md text-destructive transition-colors hover:bg-destructive/10"
        ><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "processorName", label: "Processor", sortable: true, render: (item) => <span className="font-medium">{item.processorName}</span> },
    { key: "stageName", label: "Stage", sortable: true },
    { key: "materialName", label: "Material", sortable: true },
    { key: "batchNo", label: "Batch", sortable: true, render: (item) => <span className="font-mono text-xs text-muted-foreground">{item.batchNo}</span> },
    { key: "pcsSent", label: "Sent", align: "right", sortable: true, render: (item) => <span className="font-medium">{item.pcsSent} PCS</span> },
    { key: "pcsReceived", label: "Received", align: "right", sortable: true, render: (item) => <span className="font-medium text-success">{item.pcsReceived} PCS</span> },
    { key: "lossPcs", label: "Loss", align: "right", sortable: true, render: (item) => item.lossPcs > 0 ? <span className="font-medium text-destructive">{item.lossPcs} PCS</span> : <span className="text-muted-foreground/40">—</span> },
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

  const receiptColumns: Column<typeof enrichedReceipts[0]>[] = [
    { key: 'actions', label: 'Actions', align: 'right', render: (item) => (
      <div className="flex justify-end gap-2">
        <button onClick={() => { setEditReceiveId(item.id); setIsReceiveOpen(true); }} aria-label="Edit receipt" className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
        <button
          onClick={() => setDeleteModal({ isOpen: true, type: 'receipt', id: item.id, no: item.receiveNo || 'Unknown' })}
          disabled={item.billedStatus === 'Billed'}
          aria-label={item.billedStatus === 'Billed' ? 'Delete the processor bill first' : 'Delete receipt'}
          title={item.billedStatus === 'Billed' ? 'Delete the processor bill first' : 'Delete receipt'}
          className="p-1.5 rounded-md text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-destructive/10"
        ><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "processorName", label: "Processor", sortable: true, render: (item) => <span className="font-medium">{item.processorName}</span> },
    { key: "stageName", label: "Stage", sortable: true },
    { key: "materialName", label: "Material", sortable: true },
    { key: "pcsReceived", label: "Received", align: "right", sortable: true, render: (item) => <span className="font-medium text-success">+{item.pcsReceived} PCS</span> },
    { key: "billAmount", label: "Bill Amount", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{formatCurrency(item.billAmount)}</span> }
  ];

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
        <button onClick={() => { setEditBillId(item.id); setIsBillOpen(true); }} aria-label="Edit processor bill" className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
        <button onClick={() => setDeleteModal({ isOpen: true, type: 'bill', id: item.id, no: item.billNo || 'Unknown' })} aria-label="Delete processor bill" className="p-1.5 hover:bg-destructive/10 text-destructive rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "billNo", label: "Bill #", sortable: true, render: (item) => <span className="font-mono text-sm">{item.billNo}</span> },
    { key: "processorName", label: "Processor", sortable: true, render: (item) => <span className="font-medium">{item.processorName}</span> },
    { key: "stageName", label: "Stage", sortable: true },
    { key: "receiptIds", label: "Receipts Included", sortable: false, render: (item) => <span className="text-muted-foreground">{item.receiptIds.length} receipts</span> },
    { key: "totalAmount", label: "Bill Amount", align: "right", sortable: true, render: (item) => <span className="font-bold text-foreground">{formatCurrency(item.totalAmount)}</span> },
    { key: "voucherNo", label: "Voucher #", sortable: true, render: (item) => item.voucherNo ? <Link to="/accounting/cashbook" className="font-mono text-xs text-primary hover:underline">{item.voucherNo}</Link> : <span className="text-muted-foreground/30 text-xs">—</span> }
  ];

  const handleDelete = () => {
    if (deleteModal.type === 'send') ProcessingService.deleteDispatch(deleteModal.id);
    else if (deleteModal.type === 'receipt') ProcessingService.deleteReceive(deleteModal.id);
    else if (deleteModal.type === 'bill') ProcessingService.deleteBill(deleteModal.id);
  };

  const handleRecordLoss = () => {
    if (!lossModal.isOpen || !lossQty) return;
    ErrorManagement.safeExecuteSync(() => {
      ProcessingService.recordLoss({ sendId: lossModal.sendId, quantity: parseInt(lossQty), remarks: 'Recorded from Job Work' });
      setLossModal({ isOpen: false, sendId: '', dispatchNo: '', pending: 0 });
      setLossQty('');
    }, 'Record Processing Loss');
  };

  const detailSend = processingSends.find(s => s.id === detailSendId) || null;

  const tabs: { id: JobWorkTab; label: string }[] = [
    { id: 'Board', label: 'WIP Board' },
    { id: 'Send', label: 'Sent Orders' },
    { id: 'Receive', label: 'Receipts History' },
    { id: 'Billing', label: 'Processor Bills' },
    { id: 'Vouchers', label: 'Voucher History' },
    { id: 'Timeline', label: 'Stage Timeline' },
    { id: 'Stages', label: 'Stages' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Processing (Job Work)</h2>
          <p className="text-sm text-muted-foreground mt-1">Send raw materials through each processing stage and receive finished goods.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setEditBillId(undefined); setIsBillOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            <CheckCircle2 className="h-4 w-4" /> Generate Bill
          </button>
          <button
            onClick={() => { setEditReceiveId(undefined); setIsReceiveOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            <ArrowLeft className="h-4 w-4" /> Receive
          </button>
          <button
            onClick={() => { setEditSendId(undefined); setIsSendOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ArrowRight className="h-4 w-4" /> Send
          </button>
        </div>
      </div>

      {/* WIP-by-stage strip (always visible, multi-stage at a glance) */}
      {activeTab !== 'Board' && (
        <WipStageStrip stages={sortedStages} stageWip={stageWip} totalPcs={totalWipPcs} totalValue={0} />
      )}

      <div className="flex gap-6 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`pb-4 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${activeTab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "Board" ? (
        <div className="space-y-5">
          <WipStageStrip stages={sortedStages} stageWip={stageWip} totalPcs={totalWipPcs} totalValue={0} />
          <WipBoard
            stages={sortedStages}
            batches={batches || []}
            materials={materials}
            processors={processors}
            sends={processingSends}
            onOpenDispatch={setDetailSendId}
          />
        </div>
      ) : activeTab === "Send" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{filteredSends.length} dispatches</span>
            <select
              value={sendStageFilter}
              onChange={e => setSendStageFilter(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All stages</option>
              {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}{s.isFinalStage ? ' (Final)' : ''}</option>)}
            </select>
          </div>
          <DataTable
            data={filteredSends}
            columns={sendColumns}
            searchKeys={["processorName", "materialName", "status", "dispatchNo", "batchNo"]}
            searchPlaceholder="Search sent orders..."
            persistKey="jobwork-sends-table"
            defaultSortKey="date"
          />
        </div>
      ) : activeTab === "Receive" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{filteredReceipts.length} receipts</span>
            <select
              value={receiveStageFilter}
              onChange={e => setReceiveStageFilter(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All stages</option>
              {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}{s.isFinalStage ? ' (Final)' : ''}</option>)}
            </select>
          </div>
          <DataTable
            data={filteredReceipts}
            columns={receiptColumns}
            searchKeys={["processorName", "materialName", "receiveNo"]}
            searchPlaceholder="Search receipts..."
            persistKey="jobwork-receipts-table"
            defaultSortKey="date"
          />
        </div>
      ) : activeTab === "Billing" ? (
        <DataTable
          data={enrichedBills}
          columns={billColumns}
          searchKeys={["processorName", "billNo", "stageName"]}
          searchPlaceholder="Search bills..."
          persistKey="jobwork-bills-table"
          defaultSortKey="date"
        />
      ) : activeTab === "Vouchers" ? (
        <VoucherHistoryTab sourceModule="Processing" />
      ) : activeTab === "Timeline" ? (
        <StageTimelinePanel
          batches={batches || []}
          materials={materials}
          processors={processors}
          stages={sortedStages}
          sends={processingSends}
          receipts={processingReceipts}
          selectedBatchId={timelineBatchId}
          onSelectBatch={setTimelineBatchId}
        />
      ) : (
        <StageManagerPanel />
      )}

      {/* Forms (extracted components — each owns its QuickAdd modals) */}
      <SendToProcessorForm
        isOpen={isSendOpen}
        onClose={() => setIsSendOpen(false)}
        editSendId={editSendId}
      />
      <ReceiveFromProcessorForm
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        editReceiveId={editReceiveId}
      />
      <CreateProcessorBillForm
        isOpen={isBillOpen}
        onClose={() => setIsBillOpen(false)}
        editBillId={editBillId}
      />

      {/* Dispatch detail drill-down */}
      <DispatchDetailModal
        send={detailSend}
        onClose={() => setDetailSendId(null)}
        materials={materials}
        processors={processors}
        stages={sortedStages}
        batches={batches || []}
        receipts={processingReceipts}
        bills={processorBills}
        vouchers={vouchers}
      />

      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, type: 'send', id: '', no: '' })}
        onConfirm={handleDelete}
        title={deleteModal.type === 'send' ? 'Delete Dispatch' : deleteModal.type === 'receipt' ? 'Delete Receipt' : 'Delete Processor Bill'}
        recordNo={deleteModal.no}
        description={
          deleteModal.type === 'send'
            ? 'Are you sure you want to permanently delete this dispatch? Its receipts will be removed and any processor bills (and their vouchers) reversed; stock returns to raw material.'
            : deleteModal.type === 'receipt'
              ? 'Are you sure you want to permanently delete this receipt? The received pcs will move back to At Processor (WIP).'
              : 'Are you sure you want to permanently delete this processor bill? Receipts will be marked unbilled and the processor balance reversed.'
        }
      />

      <PageModal isOpen={lossModal.isOpen} onClose={() => setLossModal({ ...lossModal, isOpen: false })} title="Record Loss">
        <form onSubmit={(e) => { e.preventDefault(); handleRecordLoss(); }} className="p-6 space-y-4">
          <div className="text-sm text-muted-foreground">
            Dispatch <span className="font-mono">{lossModal.dispatchNo}</span> — pending {lossModal.pending} PCS. Loss is recorded explicitly; pending pcs can still be received later.
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Loss Quantity (PCS)</label>
            <input required type="number" min="1" max={lossModal.pending} value={lossQty} onChange={e => setLossQty(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-xl bg-destructive p-3 text-destructive-foreground font-semibold">Record Loss</button>
        </form>
      </PageModal>
    </div>
  );
}
