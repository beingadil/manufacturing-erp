import { CircleDollarSign, Pencil, Plus, UserCog, Wallet, } from "lucide-react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { PartyLedgerModal } from "../components/PartyLedgerModal";
import { KpiCard } from '../components/ui/KpiCard';
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";
import { PageModal } from "../components/ui/PageModal";

export function Processors() {
  const { processors, addProcessor, updateProcessor, processingStages } = useERPStore();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ledgerParty, setLedgerParty] = useState<{ id: string; name: string; kind: 'Processor' } | null>(null);
  const [editingProcessor, setEditingProcessor] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  // Worker type = the processing stage this person works at (config-driven,
  // so new stages appear here automatically). Empty = General (any stage).
  const [workerStageId, setWorkerStageId] = useState("");

  const sortedStages = [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence);
  const stageNameOf = (stageId?: string) => {
    if (!stageId) return 'General';
    const s = sortedStages.find(x => x.id === stageId);
    return s ? `${s.name}${s.isFinalStage ? ' (Final)' : ''}` : 'General';
  };

  const openEditModal = (processor: any) => {
    setEditingProcessor(processor);
    setName(processor.name);
    setContactPerson(processor.contactPerson || "");
    setPhone(processor.phone || "");
    setEmail(processor.email || "");
    setAddress(processor.address || "");
    setNotes(processor.notes || "");
    setWorkerStageId(processor.stageId || "");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProcessor(null);
    setName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    setWorkerStageId("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const data = {
      name,
      contactPerson,
      phone,
      email,
      address,
      notes,
      stageId: workerStageId || undefined
    };

    try {
      if (editingProcessor) {
        updateProcessor(editingProcessor.id, data);
        toast.success("Processor updated successfully");
      } else {
        addProcessor(data);
        toast.success("Processor created successfully");
      }
      closeModal();
    } catch (error: any) {
      toast.error(error.message || "Failed to save processor");
    }
  };

  const columns: Column<typeof processors[0]>[] = [
    {
      key: "name",
      label: "Processor Name",
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <UserCog className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium text-foreground">{item.name}</span>
            {item.contactPerson && <div className="text-xs text-muted-foreground">{item.contactPerson}</div>}
          </div>
        </div>
      )
    },
    {
      key: "workerType",
      label: "Worker Type",
      sortable: true,
      render: (item) => (
        <span className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          item.stageId
            ? "bg-primary/10 text-primary border border-primary/20"
            : "bg-muted text-muted-foreground border border-border"
        )}>
          {stageNameOf(item.stageId)}
        </span>
      )
    },
    { key: "phone", label: "Contact", sortable: true, render: (item) => <span className="text-muted-foreground">{item.phone || '-'}</span> },
    {
      key: "balancePayable",
      label: "Balance Payable",
      align: "right",
      sortable: true,
      render: (item) => (
        <span className={cn("font-bold", item.balancePayable > 0 ? "text-destructive" : "text-muted-foreground")}>
          {formatCurrency(item.balancePayable)}
        </span>
      )
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (item) => (
        <div className="flex justify-end items-center gap-2">
          <RowActionButton onClick={() => openEditModal(item)} label={`Edit ${item.name}`} tone="primary">
            <Pencil />
          </RowActionButton>
          <button onClick={() => setLedgerParty({ id: item.id, name: item.name, kind: 'Processor' })} className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-md hover:bg-primary/20 transition-all">View Ledger</button>
          <button onClick={() => navigate(`/ledgers?tab=Processor&id=${item.id}&action=pay`)} className="px-3 py-1.5 text-xs font-semibold text-foreground bg-card border border-border rounded-md hover:bg-muted/40 transition-all">Pay</button>
        </div>
      )
    }
  ];
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-md">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Processors</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Manage external processing units and their balances.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Create New
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total Processors"
          value={formatNumber(processors.length)}
          icon={<UserCog className="h-5 w-5" />}
          iconClassName="text-fuchsia-500"
          size="sm"
        />
        <KpiCard
          label="Total Payable"
          value={formatCurrency(processors.reduce((s, p) => s + (p.balancePayable || 0), 0))}
          icon={<Wallet className="h-5 w-5" />}
          iconClassName="text-purple-500"
          accent="text-destructive"
          size="sm"
          description="Outstanding balance across all processors"
        />
        <KpiCard
          label="Processors with Balance"
          value={formatNumber(processors.filter(p => (p.balancePayable || 0) > 0).length)}
          icon={<CircleDollarSign className="h-5 w-5" />}
          iconClassName="text-fuchsia-500"
          size="sm"
          description="Processors currently owed money"
        />
      </div>

      <DataTable
        data={processors}
        columns={columns}
        searchKeys={["name", "phone", "contactPerson"]}
        searchPlaceholder="Search processors..."
        persistKey="processors-table"
        defaultSortKey="name"
      />

      <PageModal isOpen={isModalOpen} onClose={closeModal} title={editingProcessor ? 'Edit Processor' : 'Add Processor'}>
              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Processor Name *" />
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Worker Type</label>
                <select
                  value={workerStageId}
                  onChange={e => setWorkerStageId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm"
                >
                  <option value="">General Worker (any stage)</option>
                  {sortedStages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.isFinalStage ? ' (Final)' : ''}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">The processing job this worker performs. The Job Work module only offers workers matching the selected stage.</p>
              </div>
              <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Contact Person" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Phone" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Email" />
              </div>
              <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full rounded-xl border p-3 text-sm" placeholder="Address" />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border p-3 text-sm" placeholder="Notes" />
              <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">{editingProcessor ? 'Save Changes' : 'Add Processor'}</button>
            </form>
            </PageModal>

      {ledgerParty && <PartyLedgerModal party={ledgerParty} onClose={() => setLedgerParty(null)} />}
    </div>
  );
}
