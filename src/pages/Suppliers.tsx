import { CircleDollarSign, Pencil, Plus, Truck, Wallet, } from "lucide-react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { PartyLedgerModal } from "../components/PartyLedgerModal";
import { KpiCard } from '../components/ui/KpiCard';
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";
import { PageModal } from "../components/ui/PageModal";

export function Suppliers() {
  const { suppliers, addSupplier, updateSupplier } = useERPStore();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ledgerParty, setLedgerParty] = useState<{ id: string; name: string; kind: 'Supplier' } | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [ntn, setNtn] = useState("");
  const [notes, setNotes] = useState("");

  const openEditModal = (supplier: any) => {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setContactPerson(supplier.contactPerson || "");
    setPhone(supplier.phone || "");
    setEmail(supplier.email || "");
    setAddress(supplier.address || "");
    setNtn(supplier.ntn || "");
    setNotes(supplier.notes || "");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
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
      if (editingSupplier) {
        updateSupplier(editingSupplier.id, data);
        toast.success("Supplier updated successfully");
      } else {
        addSupplier(data);
        toast.success("Supplier created successfully");
      }
      closeModal();
    } catch (error: any) {
      toast.error(error.message || "Failed to save supplier");
    }
  };

  const columns: Column<typeof suppliers[0]>[] = [
    {
      key: "name",
      label: "Supplier Name",
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Truck className="h-4 w-4" /></div>
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
          <button onClick={() => setLedgerParty({ id: item.id, name: item.name, kind: 'Supplier' })} className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-md hover:bg-primary/20 transition-all">View Ledger</button>
          <button onClick={() => navigate(`/ledgers?tab=Supplier&id=${item.id}&action=pay`)} className="px-3 py-1.5 text-xs font-semibold text-foreground bg-card border border-border rounded-md hover:bg-muted/40">Pay</button>
        </div>
      )
    }
  ];
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Suppliers</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Manage vendors and accounts payable.</p>
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
          label="Total Suppliers"
          value={formatNumber(suppliers.length)}
          icon={<Truck className="h-5 w-5" />}
          iconClassName="text-amber-500"
          size="sm"
        />
        <KpiCard
          label="Total Payable"
          value={formatCurrency(suppliers.reduce((s, su) => s + (su.balancePayable || 0), 0))}
          icon={<Wallet className="h-5 w-5" />}
          iconClassName="text-orange-500"
          accent="text-destructive"
          size="sm"
          description="Outstanding balance across all suppliers"
        />
        <KpiCard
          label="Suppliers with Balance"
          value={formatNumber(suppliers.filter(su => (su.balancePayable || 0) > 0).length)}
          icon={<CircleDollarSign className="h-5 w-5" />}
          iconClassName="text-amber-500"
          size="sm"
          description="Suppliers currently owed money"
        />
      </div>

      <DataTable
        data={suppliers}
        columns={columns}
        searchKeys={["name", "phone", "ntn", "contactPerson"]}
        searchPlaceholder="Search suppliers..."
        persistKey="suppliers-table"
        defaultSortKey="name"
      />

      <PageModal isOpen={isModalOpen} onClose={closeModal} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}>
              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Supplier Name *" />
              <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Contact Person" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Phone" />
                <input type="text" value={ntn} onChange={e => setNtn(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="NTN Number" />
              </div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl border p-3 text-sm" placeholder="Email" />
              <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full rounded-xl border p-3 text-sm" placeholder="Address" />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border p-3 text-sm" placeholder="Notes" />
              <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">{editingSupplier ? 'Save Changes' : 'Add Supplier'}</button>
            </form>
            </PageModal>

      {ledgerParty && <PartyLedgerModal party={ledgerParty} onClose={() => setLedgerParty(null)} />}
    </div>
  );
}
