import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Edit, Eye, Factory, Printer, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Column, DataTable } from "../components/DataTable";
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { SearchableSelect } from "../components/SearchableSelect";
import { DispatchDetailModal } from '../components/processing/DispatchDetailModal';
import { StageManagerPanel } from '../components/processing/StageManagerPanel';
import { StageTimelinePanel } from '../components/processing/StageTimelinePanel';
import { WipBoard } from '../components/processing/WipBoard';
import { PageModal } from "../components/ui/PageModal";
import { VoucherHistoryTab } from "../components/VoucherHistoryTab";
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { generateDispatchSlipPDF, generateProcessorBillPDF } from "../lib/documentGenerators";
import { getSortedStages } from '../lib/processing/stageProgress';
import { formatCurrency, formatNumber } from "../lib/utils";
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
  const [detailSendId, setDetailSendId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'send' | 'receipt' | 'bill'; id: string; no: string }>({ isOpen: false, type: 'send', id: '', no: '' });
  const [lossModal, setLossModal] = useState<{ isOpen: boolean; sendId: string; dispatchNo: string; pending: number }>({ isOpen: false, sendId: '', dispatchNo: '', pending: 0 });
  const [lossQty, setLossQty] = useState('');

  // Deep links from Quick Entry / command surfaces: ?new=send|receive|bill
  // navigates to the dedicated create page instead of opening a modal.
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const newAction = searchParams.get('new');
  useEffect(() => {
    if (newAction === 'send') navigate('/processing/send', { replace: true });
    else if (newAction === 'receive') navigate('/processing/receive', { replace: true });
    else if (newAction === 'bill') navigate('/processing/generate-bill', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newAction]);

  // ── Stage filters for tables ─────────────────────────────────────────────
  const [sendStageFilter, setSendStageFilter] = useState('');
  const [receiveStageFilter, setReceiveStageFilter] = useState('');
  const [sendDateFrom, setSendDateFrom] = useState('');
  const [sendDateTo, setSendDateTo] = useState('');
  const [receiveDateFrom, setReceiveDateFrom] = useState('');
  const [receiveDateTo, setReceiveDateTo] = useState('');
  const [billDateFrom, setBillDateFrom] = useState('');
  const [billDateTo, setBillDateTo] = useState('');
  const [timelineBatchId, setTimelineBatchId] = useState('');

  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);

  // WIP-by-stage derivation for the header strip (same basis as the dashboard).
  const stageWip = useMemo(() => sortedStages
    .filter(s => !s.isFinalStage)
    .map(stage => ({
      stageId: stage.id,
      name: stage.name,
      sequence: stage.sequence,
      pcs: InventoryCalculationService.getStageWIP(stage.id, processingSends, processingReceipts),
    })), [sortedStages, processingSends, processingReceipts]);
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

  const filteredSends = useMemo(() => enrichedSends.filter(s => {
    if (sendStageFilter && (s.stageId || '') !== sendStageFilter) return false;
    if (sendDateFrom && (s.date || '') < sendDateFrom) return false;
    if (sendDateTo && (s.date || '') > sendDateTo) return false;
    return true;
  }), [enrichedSends, sendStageFilter, sendDateFrom, sendDateTo]);

  // Record totals for the stats strip (mirrors the tables below).
  const jobStats = useMemo(() => ({
    dispatches: enrichedSends.length,
    pcsSent: enrichedSends.reduce((s, x) => s + (x.pcsSent || 0), 0),
    pcsReceived: enrichedSends.reduce((s, x) => s + (x.pcsReceived || 0), 0),
    pending: enrichedSends.reduce((s, x) => s + (x.pendingPcs || 0), 0),
  }), [enrichedSends]);

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

  const filteredReceipts = useMemo(() => enrichedReceipts.filter(r => {
    if (receiveStageFilter && (r.stageId || '') !== receiveStageFilter) return false;
    if (receiveDateFrom && (r.date || '') < receiveDateFrom) return false;
    if (receiveDateTo && (r.date || '') > receiveDateTo) return false;
    return true;
  }), [enrichedReceipts, receiveStageFilter, receiveDateFrom, receiveDateTo]);
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
  const filteredBills = useMemo(() => enrichedBills.filter(b => {
    if (billDateFrom && (b.date || '') < billDateFrom) return false;
    if (billDateTo && (b.date || '') > billDateTo) return false;
    return true;
  }), [enrichedBills, billDateFrom, billDateTo]);

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
        <button onClick={() => navigate(`/processing/send/${item.id}`)} aria-label="Edit dispatch" className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
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
    { key: "batchNo", label: "Batch", sortable: true, render: (item) => item.batchId ? <Link to={`/materials/${item.materialId}/purchases/${item.batchId}`} className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline">{item.batchNo}</Link> : <span className="font-mono text-xs text-muted-foreground">{item.batchNo}</span> },
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
        <button onClick={() => navigate(`/processing/receive/${item.id}`)} aria-label="Edit receipt" className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
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
        <button onClick={() => navigate(`/processing/generate-bill/${item.id}`)} aria-label="Edit processor bill" className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
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
    try {
      if (deleteModal.type === 'send') ProcessingService.deleteDispatch(deleteModal.id);
      else if (deleteModal.type === 'receipt') ProcessingService.deleteReceive(deleteModal.id);
      else if (deleteModal.type === 'bill') ProcessingService.deleteBill(deleteModal.id);
      toast.success(`${deleteModal.no} deleted.`);
      setDeleteModal({ ...deleteModal, isOpen: false });
    } catch (error: any) {
      // Guarded deletes surface the reason here — a silent no-op previously
      // left users staring at a canonical modal that "did nothing".
      toast.error(error?.message || 'Could not delete.');
    }
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
    <div className="min-h-[calc(100vh-4rem)] animate-in fade-in duration-500 pb-10">
      {/* ── Page header ── */}
      <header className="sticky top-16 z-20 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Processing</p>
            <h1 className="text-lg font-semibold leading-tight text-foreground">Job Work</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Send raw material through each processing stage and receive finished goods.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate('/processing/generate-bill')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-500/70 bg-amber-500 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              <CheckCircle2 className="h-4 w-4" /> Generate Bill
            </button>
            <button
              onClick={() => navigate('/processing/receive')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-600/70 bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1"
            >
              <ArrowLeft className="h-4 w-4" /> Receive
            </button>
            <button
              onClick={() => navigate('/processing/send')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <ArrowRight className="h-4 w-4" /> Send
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 py-5">

      {/* WIP-by-stage strip — the chain at a glance, enhanced to the current design language */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
              <Factory className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Work in Progress by Stage</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatNumber(totalWipPcs)} PCS in the chain ·{' '}
                {stageWip.filter(s => (s.pcs || 0) > 0).length} active stage{stageWip.filter(s => (s.pcs || 0) > 0).length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const active = stageWip.filter(s => (s.pcs || 0) > 0).length;
              return active > 0 ? (
                <span className="hidden items-center rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning sm:inline-flex">
                  {active} active stage{active === 1 ? '' : 's'}
                </span>
              ) : null;
            })()}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4 lg:grid-cols-6">
          {sortedStages.map(stage => {
            const wip = stageWip.find(w => w.stageId === stage.id);
            const pcs = wip?.pcs || 0;
            const active = pcs > 0;
            return (
              <div
                key={stage.id}
                className={`flex min-h-[104px] flex-col justify-between rounded-xl border p-3 transition-colors sm:min-h-[112px] ${
                  active ? 'border-warning/40 bg-warning/[0.06]' : 'border-border/50 bg-muted/20'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums ${
                      stage.isFinalStage ? 'bg-violet-500/20 text-violet-600 dark:text-violet-300' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {stage.sequence}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground" title={stage.name}>
                    {stage.name}{stage.isFinalStage ? ' · Final' : ''}
                  </span>
                </div>
                <div className="mt-2">
                  <div className={`text-xl font-bold tabular-nums tracking-tight ${active ? 'text-warning' : 'text-foreground/30'}`}>
                    {formatNumber(pcs)}<span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PCS</span>
                  </div>
                  {totalWipPcs > 0 && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" role="presentation">
                      <div
                        className={`h-full rounded-full ${active ? 'bg-warning/70' : 'bg-foreground/10'}`}
                        style={{ width: `${Math.min(100, ((pcs || 0) / totalWipPcs) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section tabs — segmented control, consistent with the rest of the redesign */}
      <div className="overflow-x-auto">
        <div role="tablist" aria-label="Processing views" className="inline-flex min-w-max gap-1 rounded-xl border border-border/60 bg-muted p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeTab === t.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Record totals strip — shown on the three record tabs (WIP Board has its own stage strip) */}
      {(activeTab === 'Send' || activeTab === 'Receive' || activeTab === 'Billing') && (
        <section className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dispatches</div>
            <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{jobStats.dispatches.toLocaleString()}</div>
          </div>
          <div className="border-l border-border/60 pl-10">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">PCS sent</div>
            <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{jobStats.pcsSent.toLocaleString()}</div>
          </div>
          <div className="border-l border-border/60 pl-10">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">PCS received</div>
            <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{jobStats.pcsReceived.toLocaleString()}</div>
          </div>
          <div className="border-l border-border/60 pl-10">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Pending PCS</div>
            <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-destructive">{jobStats.pending.toLocaleString()}</div>
            {jobStats.pending > 0 && <div className="text-xs text-muted-foreground">Awaiting receipt or loss</div>}
          </div>
        </section>
      )}

      {activeTab === "Board" ? (
        <WipBoard
          stages={sortedStages}
          batches={batches || []}
          materials={materials}
          processors={processors}
          sends={processingSends}
          onOpenDispatch={setDetailSendId}
        />
      ) : activeTab === "Send" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{filteredSends.length} {filteredSends.length === 1 ? 'dispatch' : 'dispatches'}</span>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={sendDateFrom} onChange={e => setSendDateFrom(e.target.value)} className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs text-foreground" aria-label="From date" />
              <input type="date" value={sendDateTo} onChange={e => setSendDateTo(e.target.value)} className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs text-foreground" aria-label="To date" />
              <SearchableSelect
                options={[
                  { id: '', label: 'All stages' },
                  ...sortedStages.map(s => ({ id: s.id, label: s.name + (s.isFinalStage ? ' (Final)' : '') })),
                ]}
                value={sendStageFilter}
                onChange={(val) => setSendStageFilter(val)}
                placeholder="Filter by stage…"
                size="sm"
              />
            </div>
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
            <span className="text-xs text-muted-foreground">{filteredReceipts.length} {filteredReceipts.length === 1 ? 'receipt' : 'receipts'}</span>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={receiveDateFrom} onChange={e => setReceiveDateFrom(e.target.value)} className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs text-foreground" aria-label="From date" />
              <input type="date" value={receiveDateTo} onChange={e => setReceiveDateTo(e.target.value)} className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs text-foreground" aria-label="To date" />
              <SearchableSelect
                options={[
                  { id: '', label: 'All stages' },
                  ...sortedStages.map(s => ({ id: s.id, label: s.name + (s.isFinalStage ? ' (Final)' : '') })),
                ]}
                value={receiveStageFilter}
                onChange={(val) => setReceiveStageFilter(val)}
                placeholder="Filter by stage…"
                size="sm"
              />
            </div>
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
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{filteredBills.length} bills</span>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={billDateFrom} onChange={e => setBillDateFrom(e.target.value)} className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs text-foreground" aria-label="From date" />
              <input type="date" value={billDateTo} onChange={e => setBillDateTo(e.target.value)} className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs text-foreground" aria-label="To date" />
            </div>
          </div>
          <DataTable
            data={filteredBills}
            columns={billColumns}
            searchKeys={["processorName", "billNo", "stageName"]}
            searchPlaceholder="Search bills..."
            persistKey="jobwork-bills-table"
            defaultSortKey="date"
          />
        </div>
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
    </div>
  );
}
