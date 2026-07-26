import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useERPStore } from "../store/useERPStore";
import { formatCurrency, cn } from "../lib/utils";
import { Plus, Truck, X } from "lucide-react";
import { DataTable, Column } from "../components/DataTable";

export function Suppliers() {
  const { suppliers, addSupplier } = useERPStore();
  const navigate = useNavigate();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierContact, setNewSupplierContact] = useState("");

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;
    
    addSupplier({
      name: newSupplierName,
      phone: newSupplierContact
    });
    
    setIsAddModalOpen(false);
    setNewSupplierName("");
    setNewSupplierContact("");
  };

  const columns: Column<typeof suppliers[0]>[] = [
    {
      key: "name",
      label: "Supplier Name",
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Truck className="h-4 w-4" /></div>
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
          <button onClick={() => navigate(`/ledgers?tab=Supplier&id=${item.id}`)} className="px-3 py-1.5 text-xs font-semibold text-foreground/80 bg-card border border-border rounded-md hover:bg-muted/40">Ledger</button>
          <button onClick={() => navigate(`/ledgers?tab=Supplier&id=${item.id}&action=pay`)} className="px-3 py-1.5 text-xs font-semibold text-foreground bg-card border border-border rounded-md hover:bg-muted/40">Pay</button>
        </div>
      )
    }
  ];
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Suppliers</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage vendors and accounts payable.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsAddModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Create New
          </button>
        </div>
      </div>

      <DataTable
        data={suppliers}
        columns={columns}
        searchKeys={["name", "phone"]}
        searchPlaceholder="Search suppliers..."
        persistKey="suppliers-table"
        defaultSortKey="name"
      />

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">Add Supplier</h3>
              <button onClick={() => setIsAddModalOpen(false)}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleAddSupplier} className="p-6 pb-64 space-y-4">
              <input type="text" required value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Supplier Name *" />
              <input type="text" value={newSupplierContact} onChange={e => setNewSupplierContact(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Contact Details" />
              <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Add Supplier</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
