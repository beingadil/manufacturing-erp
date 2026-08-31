import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, CheckCircle2, Edit, Eye, PackageCheck, Plus, Printer, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from 'react-router-dom';
import { Column, DataTable } from "../components/DataTable";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { QuickAddMaterial, QuickAddProcessor } from "../components/QuickAddModals";
import { SearchableSelect } from "../components/SearchableSelect";
import { VoucherHistoryTab } from "../components/VoucherHistoryTab";
import { generateDispatchSlipPDF, generateProcessorBillPDF } from "../lib/documentGenerators";
import { formatCurrency, formatNumber } from "../lib/utils";
import { ErrorManagement } from '../lib/validation';
import { ProcessingService } from '../services/ProcessingService';
import { useERPStore } from "../store/useERPStore";
import { PageModal } from "../components/ui/PageModal";

export function JobWork() {
  const { 
    materials, processors, processingSends, processingReceipts, processorBills, vouchers,
    batches, processingStages
  } = useERPStore();
  
  const [activeTab, setActiveTab] = useState<"Send" | "Receive" | "Billing" | "Vouchers" | "Timeline" | "Stages">("Send");

  // ── Stage master state ────────────────────────────────────────────────────
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [editStageId, setEditStageId] = useState<string | undefined>();
  const [stageName, setStageName] = useState('');
  const [stageSequence, setStageSequence] = useState('');
  const [stageRateMethod, setStageRateMethod] = useState<'per_piece' | 'per_kg'>('per_piece');
  const [stageBillingUnit, setStageBillingUnit] = useState('Per PCS');
  const [stageIsFinal, setStageIsFinal] = useState(false);
  const [stageBillingEnabled, setStageBillingEnabled] = useState(true);
  const [stageDescription, setStageDescription] = useState('');

  // ── Timeline state ────────────────────────────────────────────────────────
  const [timelineBatchId, setTimelineBatchId] = useState('');

  // ── Loss recording state ──────────────────────────────────────────────────
  const [lossModal, setLossModal] = useState<{ isOpen: boolean; sendId: string; dispatchNo: string; pending: number }>({ isOpen: false, sendId: '', dispatchNo: '', pending: 0 });
  const [lossQty, setLossQty] = useState('');
  
  const [isAddProcessorOpen, setIsAddProcessorOpen] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);

  // Send Form
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, type: 'send'|'receipt'|'bill', id: string, no: string}>({isOpen: false, type: 'send', id: '', no: ''});
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [editSendId, setEditSendId] = useState<string | undefined>();
  const [sendProcessorId, setSendProcessorId] = useState("");
  const [sendMaterialId, setSendMaterialId] = useState("");
  const [sendStageId, setSendStageId] = useState("");
  const [sendBatchId, setSendBatchId] = useState("");
  const [sendPcs, setSendPcs] = useState("");
  const [sendRate, setSendRate] = useState("");
  const [sendDate, setSendDate] = useState(new Date().toISOString().split('T')[0]);
  const [sendNote, setSendNote] = useState("");
  const [adjustPendingIds, setAdjustPendingIds] = useState<string[]>([]);

  const sendSelectedMaterial = materials.find(m => m.id === sendMaterialId);
  // When no stage is explicitly chosen, default to the FIRST stage in the chain
  // (the real 'Initial Processor' stage) — NOT an empty legacy value that would
  // silently treat the dispatch as old single-stage processing (whose receipt
  // jumps straight to Finished Goods). Legacy records keep their empty stageId
  // when EDITED (see handleSend) so historical semantics are never rewritten.
  const sendSelectedStage = (processingStages || []).find(s => s.id === sendStageId)
    ?? [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence)[0];
  const sendStageRateMethod = sendSelectedStage?.rateMethod || 'per_piece';

  // Show ALL processors — the user picks the worker manually.
  // Stage filtering was removed because multiple materials at different stages
  // conflict with auto-filtering (user has material at Machine AND material at Acid).
  const stageWorkers = processors;
  const availableBatches = useMemo(() => {
    if (!sendMaterialId) return [];
    const targetStage = sendSelectedStage;
    const stages = [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence);
    const isFirstOrLegacy = !targetStage || targetStage === stages[0];
    return (batches || []).filter(b => {
      if (b.materialId !== sendMaterialId) return false;
      if (isFirstOrLegacy) {
        // Stage 1 / legacy: show batches with raw stock remaining
        return b.remainingPcs > 0;
      }
      // Non-first stage: show batches whose currentStageId is the stage BEFORE
      // the target (source stage), with pieces ready to send forward.
      const sourceStage = stages.find(s => s.sequence === (targetStage?.sequence ?? 0) - 1);
      if (sourceStage && b.currentStageId === sourceStage.id) return (b.stageAvailablePcs || 0) > 0;
      // Fallback: if currentStageId doesn't match but has pieces (old data)
      if (!b.currentStageId || !sourceStage) return (b.stageAvailablePcs || 0) > 0;
      return false;
    });
  }, [batches, sendMaterialId, sendSelectedStage, processingStages]);
  
  // Compute stage-aware available stock for each material
  const getStageAvailable = useCallback((materialId: string) => {
    const targetStage = sendSelectedStage;
    const stages = (processingStages || []).sort((a, b) => a.sequence - b.sequence);
    const isFirstOrLegacy = !targetStage || targetStage === stages[0];
    if (isFirstOrLegacy) {
      const m = materials.find(mat => mat.id === materialId);
      return m?.stockPcs || 0;
    }
    // Non-first: sum stageAvailablePcs for batches at the SOURCE stage
    // (the stage before the target — where pieces physically are)
    const sourceStage = stages.find(s => s.sequence === (targetStage?.sequence ?? 0) - 1);
    const exactMatch = (batches || [])
      .filter(b => b.materialId === materialId && b.currentStageId === sourceStage?.id)
      .reduce((sum, b) => sum + (b.stageAvailablePcs || 0), 0);
    if (exactMatch > 0) return exactMatch;
    // Fallback: if no batches match source stage but have pieces (old data)
    return (batches || [])
      .filter(b => b.materialId === materialId && (b.stageAvailablePcs || 0) > 0)
      .reduce((sum, b) => sum + (b.stageAvailablePcs || 0), 0);
  }, [sendSelectedStage, processingStages, materials, batches]);


  // ── Stage strictness: determine the material's current stage and next stage ──
  // When a material is selected, we compute which stages are complete and which
  // is the next valid stage. The user CANNOT go back to an earlier stage.
  const materialStageProgress = useMemo(() => {
    if (!sendMaterialId) return null;
    const sorted = [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence);
    if (sorted.length === 0) return null;

    // Find the most advanced stage any batch of this material has reached
    const materialBatches = (batches || []).filter(b => b.materialId === sendMaterialId);
    let maxStageSequence = 0;
    let currentStageId = '';
    let totalStageAvailable = 0;

    for (const b of materialBatches) {
      if (b.currentStageId) {
        const stage = sorted.find(s => s.id === b.currentStageId);
        if (stage && stage.sequence > maxStageSequence) {
          maxStageSequence = stage.sequence;
          currentStageId = b.currentStageId;
        }
      }
      totalStageAvailable += b.stageAvailablePcs || 0;
    }

    // Fallback: if currentStageId didn't match any stage but the batch has
    // stageAvailablePcs (received from a processor), determine the stage from
    // the processing sends. This handles old data where currentStageId was
    // never set or set to a now-deleted stage ID.
    if (maxStageSequence === 0 && totalStageAvailable > 0) {
      for (const b of materialBatches) {
        if (b.stageAvailablePcs && b.stageAvailablePcs > 0) {
          const batchSends = (processingSends || []).filter(
            s => s.batchId === b.id && (s.status === 'Closed' || s.status === 'Partial')
          );
          for (const s of batchSends) {
            if (s.stageId) {
              const stage = sorted.find(st => st.id === s.stageId);
              if (stage && stage.sequence > maxStageSequence) {
                maxStageSequence = stage.sequence;
                currentStageId = s.stageId;
              }
            }
          }
        }
      }
    }

    // If no batch has a currentStageId, the material is at stage 0 (raw, not yet sent)
    const nextStage = maxStageSequence === 0
      ? sorted[0]  // First stage (Initial Processor)
      : sorted.find(s => s.sequence === maxStageSequence + 1) || null; // Next in chain

    const completedStages = sorted.filter(s => s.sequence < maxStageSequence);
    const isRaw = maxStageSequence === 0;

    return {
      currentStageId: isRaw ? '' : currentStageId,
      nextStage,
      completedStages,
      allStages: sorted,
      isRaw,
      totalStageAvailable,
      canProgress: !!nextStage,
    };
  }, [sendMaterialId, batches, processingStages, processingSends]);

  // Auto-set stage when material changes (strict sequencing)
  useEffect(() => {
    if (!sendMaterialId || editSendId) return; // Don't auto-set during edits
    if (materialStageProgress?.nextStage) {
      setSendStageId(materialStageProgress.nextStage.id);
    } else if (materialStageProgress?.isRaw) {
      // Material is raw — set to first stage
      const first = [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence)[0];
      if (first) setSendStageId(first.id);
    }
  }, [sendMaterialId, materialStageProgress, editSendId, processingStages]);

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
    setSendStageId(item.stageId || "");
    setSendPcs(item.pcsSent.toString());
    setSendRate(item.ratePerPiece.toString());
    setSendDate(item.date);
    setIsSendModalOpen(true);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendProcessorId || !sendMaterialId || !sendPcs || !sendRate || !sendDate) return;
    
    const pcs = parseInt(sendPcs);
    if (sendSelectedMaterial && pcs > getStageAvailable(sendSelectedMaterial.id)) {
      return;
    }
    
    if (sendBatchId) {
       const b = availableBatches.find(bat => bat.id === sendBatchId);
       if (b && pcs > ((b.stageAvailablePcs || 0) > 0 ? (b.stageAvailablePcs || 0) : (b.remainingPcs || 0))) return; // validate batch qty
    }

    if (editSendId) {
      // EDITS stay faithful to the existing record: an empty stageId on a
      // legacy dispatch is preserved (never silently re-tagged), so its
      // historical single-stage behavior is unchanged.
      ProcessingService.updateDispatch(editSendId, {
        processorId: sendProcessorId,
        materialId: sendMaterialId,
        stageId: sendStageId || undefined,
        batchId: sendBatchId || undefined,
        pcsSent: pcs,
        ratePerPiece: parseFloat(sendRate),
        date: sendDate,
        remarks: sendNote
      });
    } else {
      // New sends resolve the default to the first stage — the dispatch flows
      // through the chain (receipt stays WIP until the final stage completes).
      ProcessingService.dispatch({
        processorId: sendProcessorId,
        materialId: sendMaterialId,
        stageId: sendStageId || sendSelectedStage?.id || undefined,
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
    setSendStageId("");
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
      ProcessingService.updateBill(editBillId, {
        processorId: billProcessorId,
        date: billDate,
        receiptIds: selectedReceiptsForBill
      });
    } else {
      ProcessingService.createBill({
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
    const stage = processingStages.find(st => st.id === s.stageId);
    return {
      ...s,
      processorName: p?.name || 'Unknown',
      materialName: m?.name || 'Unknown',
      stageName: stage ? stage.name : 'Initial Processor',
      formattedDate: new Date(s.date).toLocaleDateString(),
      pendingPcs: s.pcsSent - s.pcsReceived - (s.lossQuantity || 0),
      lossPcs: s.lossQuantity || 0
    };
  }), [processingSends, processors, materials, processingStages]);

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
        <button
          onClick={() => setLossModal({ isOpen: true, sendId: item.id, dispatchNo: item.dispatchNo || 'Unknown', pending: item.pendingPcs })}
          disabled={item.pendingPcs <= 0}
          title={item.pendingPcs > 0 ? 'Record loss/wastage' : 'No pending pcs to record as loss'}
          className="p-1.5 rounded-md text-warning transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-warning/10"
        ><AlertTriangle className="h-4 w-4" /></button>
        <button
          onClick={() => setDeleteModal({isOpen: true, type: 'send', id: item.id, no: item.dispatchNo || 'Unknown'})}
          disabled={item.pcsReceived > 0}
          title={item.pcsReceived > 0 ? 'Delete linked receipts first' : 'Delete dispatch'}
          className="p-1.5 rounded-md text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-destructive/10"
        ><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
    { key: "formattedDate", label: "Date", sortable: true },
    { key: "processorName", label: "Processor", sortable: true, render: (item) => <span className="font-medium">{item.processorName}</span> },
    { key: "stageName", label: "Stage", sortable: true },
    { key: "materialName", label: "Material", sortable: true },
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

  const receiptColumns: Column<typeof enrichedReceipts[0]>[] = [
    { key: 'actions', label: 'Actions', align: 'right', render: (item) => (
      <div className="flex justify-end gap-2">
        <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Eye className="h-4 w-4" /></button>
        <button onClick={() => handleEditReceive(item)} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
        <button
          onClick={() => setDeleteModal({isOpen: true, type: 'receipt', id: item.id, no: item.receiveNo || 'Unknown'})}
          disabled={item.billedStatus === 'Billed'}
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
    if (deleteModal.type === 'send') ProcessingService.deleteDispatch(deleteModal.id);
    else if (deleteModal.type === 'receipt') ProcessingService.deleteReceive(deleteModal.id);
    else if (deleteModal.type === 'bill') ProcessingService.deleteBill(deleteModal.id);
  };

  // ── Stage master handlers ──────────────────────────────────────────────────
  const sortedStages = useMemo(() => [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence), [processingStages]);

  const openAddStage = () => {
    setEditStageId(undefined);
    setStageName('');
    setStageSequence(String((sortedStages.length || 0) + 1));
    setStageRateMethod('per_piece');
    setStageBillingUnit('Per PCS');
    setStageIsFinal(false);
    setStageBillingEnabled(true);
    setStageDescription('');
    setStageModalOpen(true);
  };

  const openEditStage = (s: any) => {
    setEditStageId(s.id);
    setStageName(s.name);
    setStageSequence(String(s.sequence));
    setStageRateMethod(s.rateMethod || 'per_piece');
    setStageBillingUnit(s.billingUnit || 'Per PCS');
    setStageIsFinal(!!s.isFinalStage);
    setStageBillingEnabled(s.billingEnabled !== false);
    setStageDescription(s.description || '');
    setStageModalOpen(true);
  };

  const handleStageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageName || !stageSequence) return;
    const payload = {
      name: stageName,
      sequence: parseInt(stageSequence),
      description: stageDescription || undefined,
      active: true,
      inputUnit: 'PCS',
      billingUnit: stageBillingUnit,
      billingEnabled: stageBillingEnabled,
      rateMethod: stageRateMethod,
      isFinalStage: stageIsFinal,
    };
    if (editStageId) {
      ProcessingService.updateStage(editStageId, payload);
      // Only one stage may be final — clear the flag on any other final stage.
      if (stageIsFinal) {
        sortedStages.filter(s => s.id !== editStageId && s.isFinalStage).forEach(s => ProcessingService.updateStage(s.id, { isFinalStage: false }));
      }
    } else {
      ProcessingService.addStage(payload);
    }
    setStageModalOpen(false);
  };

  const [stageToDelete, setStageToDelete] = useState<string | null>(null);

  const handleDeleteStage = (id: string) => {
    ProcessingService.deleteStage(id);
    setStageToDelete(null);
  };

  // ── Timeline derivation ────────────────────────────────────────────────────
  const timelineBatch = batches.find(b => b.id === timelineBatchId);
  const timeline = useMemo(() => {
    if (!timelineBatchId) return [];
    const batchSends = processingSends.filter(s => s.batchId === timelineBatchId && s.status !== 'Adjusted');
    const batchReceipts = processingReceipts.filter(r => batchSends.some(s => s.id === r.sendId));
    const batch = batches.find(b => b.id === timelineBatchId);
    if (!batch) return [];
    const rows = sortedStages.map(stage => {
      const sends = batchSends.filter(s => s.stageId === stage.id);
      const receipts = batchReceipts.filter(r => r.stageId === stage.id);
      const sent = sends.reduce((sum, s) => sum + s.pcsSent, 0);
      const received = receipts.reduce((sum, r) => sum + r.pcsReceived, 0);
      const loss = sends.reduce((sum, s) => sum + (s.lossQuantity || 0), 0);
      const wip = Math.max(0, sent - received - loss);
      const processorName = sends[0] ? processors.find(p => p.id === sends[0].processorId)?.name || 'Unknown' : '—';
      const rate = sends[0]?.ratePerPiece || 0;
      const billed = receipts.some(r => r.billedStatus === 'Billed');
      return { stage, sent, received, loss, wip, processorName, rate, billed, sendCount: sends.length };
    });
    return rows;
  }, [timelineBatchId, processingSends, processingReceipts, batches, sortedStages, processors]);

  const handleRecordLoss = () => {
    if (!lossModal.isOpen || !lossQty) return;
    ErrorManagement.safeExecuteSync(() => {
      ProcessingService.recordLoss({
        sendId: lossModal.sendId,
        quantity: parseInt(lossQty),
        remarks: 'Recorded from Job Work'
      });
      setLossModal({ isOpen: false, sendId: '', dispatchNo: '', pending: 0 });
      setLossQty('');
    }, 'Record Processing Loss');
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
        <button
          onClick={() => setActiveTab("Timeline")}
          className={`pb-4 text-sm font-semibold transition-colors border-b-2 ${activeTab === "Timeline" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
        >
          Stage Timeline
        </button>
        <button
          onClick={() => setActiveTab("Stages")}
          className={`pb-4 text-sm font-semibold transition-colors border-b-2 ${activeTab === "Stages" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}
        >
          Stages
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
      ) : activeTab === "Vouchers" ? (
        <VoucherHistoryTab sourceModule="Processing" />
      ) : activeTab === "Timeline" ? (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <select
              value={timelineBatchId}
              onChange={e => setTimelineBatchId(e.target.value)}
              className="w-full sm:max-w-md rounded-xl border border-border bg-background p-3 text-sm"
            >
              <option value="">Select a batch to trace its processing chain...</option>
              {(batches || []).map(b => {
                const mat = materials.find(m => m.id === b.materialId);
                return <option key={b.id} value={b.id}>{b.batchNo} — {mat?.name || 'Material'} ({formatNumber(b.initialPcs)} PCS)</option>;
              })}
            </select>
            {timelineBatch && (
              <span className="text-xs text-muted-foreground">
                Raw on hand: {formatNumber(timelineBatch.remainingPcs)} · WIP: {formatNumber(timelineBatch.atProcessorPcs || 0)} · Finished: {formatNumber(timelineBatch.processedPcs || 0)}
              </span>
            )}
          </div>

          {!timelineBatchId ? (
            <div className="p-10 text-center text-sm text-muted-foreground bg-muted/30 rounded-2xl border border-dashed border-border">
              Select a batch above to see its full manufacturing chain: PURCHASE → INITIAL PROCESSOR → MACHINE → ACID → POLISH → FINISHED PRODUCT.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Purchase origin */}
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">Purchase — {timelineBatch?.batchNo}</div>
                  <div className="text-xs text-muted-foreground">Raw material on hand: {formatNumber(timelineBatch?.remainingPcs || 0)} PCS · {formatCurrency(timelineBatch?.amount || 0)}</div>
                </div>
              </div>
              {timeline.map((row, i) => (
                <div key={row.stage.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                  <div className={`h-2.5 w-2.5 rounded-full ${row.stage.isFinalStage ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                  <ArrowDown className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{row.stage.isFinalStage ? '★ ' : ''}{row.stage.name}</span>
                      {row.stage.isFinalStage && <span className="text-[10px] uppercase tracking-wide bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full">Final</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Worker: {row.processorName} · Rate: {formatCurrency(row.rate)}{row.stage.rateMethod === 'per_kg' ? '/KG' : '/PCS'}
                    </div>
                  </div>
                  <div className="text-right text-xs space-y-0.5">
                    <div className="text-muted-foreground">Sent <span className="font-medium text-foreground">{formatNumber(row.sent)}</span></div>
                    <div className="text-muted-foreground">Received <span className="font-medium text-success">{formatNumber(row.received)}</span></div>
                    {row.loss > 0 && <div className="text-muted-foreground">Loss <span className="font-medium text-destructive">{formatNumber(row.loss)}</span></div>}
                    <div className="text-muted-foreground">Held <span className="font-medium text-warning">{formatNumber(row.wip)}</span></div>
                  </div>
                </div>
              ))}
              {/* Finished goods */}
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <PackageCheck className="h-4 w-4 text-emerald-500" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">Finished Goods</div>
                  <div className="text-xs text-muted-foreground">Saleable after the final stage completes</div>
                </div>
                <div className="text-right text-xs">
                  <span className="font-medium text-emerald-600">{formatNumber(timelineBatch?.processedPcs || 0)} PCS</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">Processing Stage Master</h3>
              <p className="text-xs text-muted-foreground">Configure the manufacturing chain. The final stage (★) produces saleable Finished Goods — never hardcoded.</p>
            </div>
            <button onClick={openAddStage} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Add Stage
            </button>
          </div>
          <DataTable
            data={sortedStages.map(s => ({ ...s, isFinal: s.isFinalStage ? 'Yes' : 'No', rate: s.rateMethod === 'per_kg' ? 'Per KG' : 'Per PCS', activeLabel: s.active ? 'Active' : 'Inactive' }))}
            columns={[
              { key: 'actions', label: 'Actions', align: 'right', render: (item) => (
                <div className="flex justify-end gap-2">
                  <button onClick={() => openEditStage(item)} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => setStageToDelete(item.id)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded-md transition-colors" title="Only unused stages can be deleted"><Trash2 className="h-4 w-4" /></button>
                </div>
              )},
              { key: 'sequence', label: '#', sortable: true },
              { key: 'name', label: 'Stage', sortable: true, render: (item) => <span className="font-medium">{item.isFinal === 'Yes' ? '★ ' : ''}{item.name}</span> },
              { key: 'rate', label: 'Billing', sortable: true },
              { key: 'billingUnit', label: 'Billing Unit' },
              { key: 'isFinal', label: 'Final Stage', render: (item) => item.isFinal === 'Yes' ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-muted-foreground">No</span> },
              { key: 'activeLabel', label: 'Status' },
            ]}
            searchKeys={['name']}
            searchPlaceholder="Search stages..."
            persistKey="jobwork-stages-table"
          />
        </div>
      )}

      <PageModal isOpen={isSendModalOpen && !isAddProcessorOpen && !isAddMaterialOpen} onClose={() => setIsSendModalOpen(false)} title="Send to Processor" maxWidth="max-w-2xl">
              <form onSubmit={handleSend} className="p-6 space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
Processor
                </label>
                <SearchableSelect 
                  options={stageWorkers.map(p => ({
                    id: p.id,
                    label: p.name,
                    secondaryLabel: p.stageId
                      ? `${(processingStages || []).find(s => s.id === p.stageId)?.name || 'Worker'}${p.phone ? ` · ${p.phone}` : ''}`
                      : (p.phone ? `General · ${p.phone}` : 'General Worker'),
                    searchValue: p.phone
                  }))}
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
                  options={materials.map((m) => {
                    const avail = getStageAvailable(m.id);
                    const matBatches = (batches || []).filter(b => b.materialId === m.id);
                    const hasRaw = (m.stockPcs || 0) > 0;
                    const hasWip = matBatches.some(b => b.currentStageId);
                    const status = hasRaw && !hasWip ? 'Raw' : hasWip ? 'In Progress' : 'Raw';
                    return { id: m.id, label: m.name, secondaryLabel: `${status} · ${avail} PCS available` };
                  })}
                  value={sendMaterialId}
                  onChange={(val) => { setSendMaterialId(val); setSendBatchId(""); }}
                  placeholder="Select Material..."
                  onAdd={() => setIsAddMaterialOpen(true)}
                  required
                />
              </div>
              {/* Stage progress indicator when material is selected */}
              {materialStageProgress && (
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {materialStageProgress.isRaw ? 'Material is raw — ready for first stage' :
                     materialStageProgress.canProgress ? `Next stage: ${materialStageProgress.nextStage?.name}` :
                     'All stages complete — finished goods ready'}
                  </div>
                  <div className="flex gap-1">
                    {materialStageProgress.allStages.map((s, i) => {
                      const isComplete = materialStageProgress.completedStages.some(c => c.id === s.id);
                      const isNext = materialStageProgress.nextStage?.id === s.id;
                      return (
                        <div key={s.id} className="flex-1 text-center">
                          <div className={`h-1.5 rounded-full ${isComplete ? 'bg-green-500' : isNext ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
                          <div className={`text-[10px] mt-0.5 truncate ${isComplete ? 'text-green-600 font-medium' : isNext ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                            {s.name}{s.isFinalStage ? ' ★' : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {materialStageProgress.totalStageAvailable > 0 && (
                    <div className="text-xs text-primary font-medium mt-2">
                      {materialStageProgress.totalStageAvailable} PCS available at stage
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Processing Stage</label>
                {editSendId ? (
                  // During edits, allow changing stage (historical records)
                  <select
                    value={sendStageId}
                    onChange={e => setSendStageId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background p-3 text-sm"
                  >
                    {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}{s.isFinalStage ? ' (Final)' : ''}</option>)}
                  </select>
                ) : (
                  // New sends: auto-set to next stage, show as read-only
                  <div className="w-full rounded-xl border border-border bg-muted/50 p-3 text-sm flex items-center justify-between">
                    <span className="font-medium">
                      {sendSelectedStage?.name || 'Select material first'}
                      {sendSelectedStage?.isFinalStage ? ' (Final Stage)' : ''}
                    </span>
                    {materialStageProgress?.nextStage && (
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">AUTO</span>
                    )}
                  </div>
                )}
              </div>
              {sendMaterialId && (
                <select value={sendBatchId} onChange={e => setSendBatchId(e.target.value)} className="w-full rounded-xl border p-3 text-sm">
                  <option value="">Auto (oldest batch first)</option>
                  {availableBatches.map(b => <option key={b.id} value={b.id}>{b.batchNo} (Available: {(b.stageAvailablePcs || 0) > 0 ? b.stageAvailablePcs : b.remainingPcs} PCS)</option>)}
                </select>
              )}
              <input type="number" required placeholder="PCS to Send" value={sendPcs} onChange={e => setSendPcs(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <input type="number" step="0.01" required placeholder={sendStageRateMethod === 'per_kg' ? "Rate Per KG (PKR)" : "Rate Per Piece (PKR)"} value={sendRate} onChange={e => setSendRate(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
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
            </PageModal>

      <PageModal isOpen={isReceiveModalOpen && !isAddProcessorOpen} onClose={() => setIsReceiveModalOpen(false)} title="Receive from Processor" maxWidth="max-w-2xl">
              <form onSubmit={handleReceive} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
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
                  const st = processingStages.find(x => x.id === s.stageId);
                  return <option key={s.id} value={s.id}>{new Date(s.date).toLocaleDateString()} - {m?.name} ({st?.name || 'Initial Processor'}) ({s.pcsSent - s.pcsReceived} pending)</option>;
                })}
              </select>
              <input type="number" required placeholder="PCS Received" value={receivePcs} onChange={e => setReceivePcs(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <input type="date" required value={receiveDate} onChange={e => setReceiveDate(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <div className="flex gap-3">
                <button type="submit" className="flex-1 rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Receive Items</button>
              </div>
            </form>
            </PageModal>

      <PageModal isOpen={isBillModalOpen && !isAddProcessorOpen} onClose={() => setIsBillModalOpen(false)} title="Create Processor Bill" maxWidth="max-w-2xl">
              <form onSubmit={handleCreateBill} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
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
            </PageModal>

      <PageModal isOpen={stageModalOpen} onClose={() => setStageModalOpen(false)} title={editStageId ? 'Edit Processing Stage' : 'Add Processing Stage'} maxWidth="max-w-2xl">
              <form onSubmit={handleStageSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Stage Name</label>
                  <input required value={stageName} onChange={e => setStageName(e.target.value)} placeholder="e.g. Machine, Acid, Polish" className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">Sequence</label>
                    <input required type="number" min="1" value={stageSequence} onChange={e => setStageSequence(e.target.value)} className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">Rate Method</label>
                    <select value={stageRateMethod} onChange={e => setStageRateMethod(e.target.value as any)} className="w-full rounded-xl border border-border bg-background p-3 text-sm">
                      <option value="per_piece">Per Piece</option>
                      <option value="per_kg">Per KG</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Billing Unit</label>
                  <input value={stageBillingUnit} onChange={e => setStageBillingUnit(e.target.value)} placeholder="e.g. Per KG" className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">Description</label>
                  <input value={stageDescription} onChange={e => setStageDescription(e.target.value)} className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-foreground/80">
                    <input type="checkbox" checked={stageBillingEnabled} onChange={e => setStageBillingEnabled(e.target.checked)} className="h-4 w-4" />
                    Billing enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground/80">
                    <input type="checkbox" checked={stageIsFinal} onChange={e => setStageIsFinal(e.target.checked)} className="h-4 w-4" />
                    Final stage (produces Finished Goods)
                  </label>
                </div>
                <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">
                  {editStageId ? 'Save Changes' : 'Add Stage'}
                </button>
              </form>
            </PageModal>

      <PageModal isOpen={lossModal.isOpen} onClose={() => setLossModal({...lossModal, isOpen: false})} title="Record Loss">
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
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({isOpen: false, type: 'send', id: '', no: ''})}
        onConfirm={handleDelete}
        title={deleteModal.type === 'send' ? 'Delete Dispatch' : deleteModal.type === 'receipt' ? 'Delete Receipt' : 'Delete Processor Bill'}
        recordNo={deleteModal.no}
        description={
          deleteModal.type === 'send'
            ? 'Are you sure you want to permanently delete this dispatch? Stock will be returned to raw material and the batch trail rebuilt.'
            : deleteModal.type === 'receipt'
              ? 'Are you sure you want to permanently delete this receipt? The received pcs will move back to At Processor (WIP).'
              : 'Are you sure you want to permanently delete this processor bill? Receipts will be marked unbilled and the processor balance reversed.'
        }
        />
      <AlertDialog open={stageToDelete !== null} onOpenChange={(open) => { if (!open) setStageToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stage?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete this processing stage? Existing batch references will keep their stage name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (stageToDelete) handleDeleteStage(stageToDelete); }}
            >
              Delete Stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
