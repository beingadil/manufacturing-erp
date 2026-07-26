import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useERPStore } from "../store/useERPStore";
import { formatCurrency, cn } from "../lib/utils";
import { Plus, UserCog, X } from "lucide-react";
import { DataTable, Column } from "../components/DataTable";

export function Processors() {
  const { processors, addProcessor } = useERPStore();
  const navigate = useNavigate();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProcessorName, setNewProcessorName] = useState("");
  const [newProcessorContact, setNewProcessorContact] = useState("");

  const handleAddProcessor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProcessorName.trim()) return;
    
    addProcessor({
      name: newProcessorName,
      phone: newProcessorContact
    });
    
    setIsAddModalOpen(false);
    setNewProcessorName("");
    setNewProcessorContact("");
  };

  const columns: Column<typeof processors[0]>[] = [
    {
      key: "name",
      label: "Processor Name",
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <UserCog className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{item.name}</span>
        </div>
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
          <button onClick={() => navigate(`/ledgers?tab=Processor&id=${item.id}`)} className="px-3 py-1.5 text-xs font-semibold text-foreground/80 bg-card border border-border rounded-md hover:bg-muted/40 transition-all">
            Ledger
          </button>
          <button onClick={() => navigate(`/ledgers?tab=Processor&id=${item.id}&action=pay`)} className="px-3 py-1.5 text-xs font-semibold text-foreground bg-card border border-border rounded-md hover:bg-muted/40 transition-all">
            Pay
          </button>
        </div>
      )
    }
  ];
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Processors</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage external processing units and their balances.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsAddModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Create New
          </button>
        </div>
      </div>

      <DataTable
        data={processors}
        columns={columns}
        searchKeys={["name", "phone"]}
        searchPlaceholder="Search processors..."
        persistKey="processors-table"
        defaultSortKey="name"
      />

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">Add Processor</h3>
              <button onClick={() => setIsAddModalOpen(false)}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleAddProcessor} className="p-6 pb-64 space-y-4">
              <input type="text" required value={newProcessorName} onChange={e => setNewProcessorName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Processor Name *" />
              <input type="text" value={newProcessorContact} onChange={e => setNewProcessorContact(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Contact Details" />
              <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Add Processor</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
