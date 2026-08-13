import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useERPStore } from "../store/useERPStore";
import { formatCurrency, formatNumber, cn } from "../lib/utils";
import { Plus, Users, X, Pencil, Wallet, CircleDollarSign } from "lucide-react";
import { DataTable, Column, RowActionButton } from "../components/DataTable";
import { KpiCard } from '../components/ui/KpiCard';
import { PartyLedgerModal } from "../components/PartyLedgerModal";
import { toast } from "sonner";

export function Customers() {
  const { customers, addCustomer, updateCustomer } = useERPStore();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ledgerParty, setLedgerParty] = useState<{ id: string; name: string; kind: 'Customer' } | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [ntn, setNtn] = useState("");
  const [notes, setNotes] = useState("");

  const openEditModal = (customer: any) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setContactPerson(customer.contactPerson || "");
    setPhone(customer.phone || "");
    setEmail(customer.email || "");
    setAddress(customer.address || "");
    setNtn(customer.ntn || "");
    setNotes(customer.notes || "");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNtn("");
    setNotes("");
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
      ntn,
      notes
    };

    try {
      if (editingCustomer) {
        updateCustomer(editingCustomer.id, data);
        toast.success("Customer updated successfully");
      } else {
        addCustomer(data);
        toast.success("Customer created successfully");
      }
      closeModal();
    } catch (error: any) {
      toast.error(error.message || "Failed to save customer");
    }
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
          <div>
            <span className="font-medium text-foreground">{item.name}</span>
            {item.contactPerson && <div className="text-xs text-muted-foreground">{item.contactPerson}</div>}
          </div>
        </div>
      )
    },
    { key: "phone", label: "Contact", sortable: true, render: (item) => <span className="text-muted-foreground">{item.phone || '-'}</span> },
    { key: "ntn", label: "NTN", sortable: true, render: (item) => <span className="font-mono text-xs text-muted-foreground">{item.ntn || '—'}</span> },
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
          <RowActionButton onClick={() => openEditModal(item)} label={`Edit ${item.name}`} tone="primary">
            <Pencil />
          </RowActionButton>
          <button onClick={() => setLedgerParty({ id: item.id, name: item.name, kind: 'Customer' })} className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-md hover:bg-primary/20 transition-all">
            View Ledger
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Customers</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Manage buyers and accounts receivable.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create New
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total Customers"
          value={formatNumber(customers.length)}
          icon={<Users className="h-5 w-5" />}
          iconClassName="text-blue-500"
          size="sm"
        />
        <KpiCard
          label="Total Receivable"
          value={formatCurrency(customers.reduce((s, c) => s + (c.balanceReceivable || 0), 0))}
          icon={<Wallet className="h-5 w-5" />}
          iconClassName="text-indigo-500"
          accent="text-success"
          size="sm"
          description="Outstanding balance across all customers"
        />
        <KpiCard
          label="Customers with Balance"
          value={formatNumber(customers.filter(c => (c.balanceReceivable || 0) > 0).length)}
          icon={<CircleDollarSign className="h-5 w-5" />}
          iconClassName="text-blue-500"
          size="sm"
          description="Customers who owe money"
        />
      </div>

      <DataTable
        data={customers}
        columns={columns}
        searchKeys={["name", "phone", "ntn", "contactPerson"]}
        searchPlaceholder="Search customers..."
        persistKey="customers-table"
        defaultSortKey="name"
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
              <button onClick={closeModal}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 pb-64 space-y-4">
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Customer Name *" />
              <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Contact Person" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Phone" />
                <input type="text" value={ntn} onChange={e => setNtn(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="NTN Number" />
              </div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Email" />
              <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full rounded-xl border p-3 text-sm" placeholder="Address" />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border p-3 text-sm" placeholder="Notes" />
              <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">{editingCustomer ? 'Save Changes' : 'Add Customer'}</button>
            </form>
          </div>
        </div>
      )}

      {ledgerParty && <PartyLedgerModal party={ledgerParty} onClose={() => setLedgerParty(null)} />}
    </div>
  );
}
