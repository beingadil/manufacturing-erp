import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useERPStore } from "../store/useERPStore";
import { formatCurrency, cn } from "../lib/utils";
import { Plus, Users, X } from "lucide-react";
import { DataTable, Column } from "../components/DataTable";

export function Customers() {
  const { customers, sales, addCustomer } = useERPStore();
  const navigate = useNavigate();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;
    
    addCustomer({
      name: newCustomerName,
      phone: newCustomerContact
    });
    
    setIsAddModalOpen(false);
    setNewCustomerName("");
    setNewCustomerContact("");
  };

  const columns: Column<typeof customers[0]>[] = [
    {
      key: "name",
      label: "Customer Name",
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Users className="h-4 w-4" />
          </div>
          <span className="font-medium text-foreground">{item.name}</span>
        </div>
      )
    },
    { key: "phone", label: "Contact", sortable: true, render: (item) => <span className="text-muted-foreground">{item.phone || '-'}</span> },
    {
      key: "balanceReceivable",
      label: "Balance Receivable",
      align: "right",
      sortable: true,
      render: (item) => (
        <span className={cn("font-bold", item.balanceReceivable > 0 ? "text-success" : "text-muted-foreground")}>
          {formatCurrency(item.balanceReceivable)}
        </span>
      )
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (item) => (
        <div className="flex justify-end items-center gap-2">
          <button onClick={() => navigate(`/ledgers?tab=Customer&id=${item.id}`)} className="px-3 py-1.5 text-xs font-semibold text-foreground/80 bg-card border border-border rounded-md hover:bg-muted/40 transition-all">
            Ledger
          </button>
          <button onClick={() => navigate(`/ledgers?tab=Customer&id=${item.id}&action=receive`)} className="px-3 py-1.5 text-xs font-semibold text-foreground bg-card border border-border rounded-md hover:bg-muted/40 transition-all">
            Receive
          </button>
        </div>
      )
    }
  ];
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Customers</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage buyers and accounts receivable.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create New
          </button>
        </div>
      </div>

      <DataTable
        data={customers}
        columns={columns}
        searchKeys={["name", "phone"]}
        searchPlaceholder="Search customers..."
        persistKey="customers-table"
        defaultSortKey="name"
      />

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">Add Customer</h3>
              <button onClick={() => setIsAddModalOpen(false)}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="p-6 pb-64 space-y-4">
              <input type="text" required value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Customer Name *" />
              <input type="text" value={newCustomerContact} onChange={e => setNewCustomerContact(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Contact Details" />
              <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Add Customer</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
