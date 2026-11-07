import { MapPin, Pencil, Plus, Users, } from "lucide-react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { FormField } from "../components/form/FormField";
import { FormFooter } from "../components/form/FormFooter";
import { FormGrid } from "../components/form/FormGrid";
import { FormModal } from "../components/form/FormModal";
import { FormSection } from "../components/form/FormSection";
import { formInputClass } from "../components/form/formStyles";
import { PartyLedgerModal } from "../components/PartyLedgerModal";
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";

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
            <p className="text-sm text-muted-foreground mt-0.5">Manage customers and what they owe you.</p>
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

      <section className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Customers</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(customers.length)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Receivable</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{formatCurrency(customers.reduce((s, c) => s + (c.balanceReceivable || 0), 0))}</div>
          <div className="text-xs text-muted-foreground">Outstanding balance</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">With Balance</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(customers.filter(c => (c.balanceReceivable || 0) > 0).length)}</div>
          <div className="text-xs text-muted-foreground">Customers owed money</div>
        </div>
      </section>

      <DataTable
        data={customers}
        columns={columns}
        searchKeys={["name", "phone", "ntn", "contactPerson"]}
        searchPlaceholder="Search customers..."
        persistKey="customers-table"
        defaultSortKey="name"
      />

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        description="Someone you sell to, with contact details, NTN, address and notes."
        icon={editingCustomer ? <Pencil /> : <Users />}
        size="md"
        footer={<FormFooter onCancel={closeModal} formId="customer-form" submitLabel={editingCustomer ? 'Save Changes' : 'Add Customer'} />}>
        <form id="customer-form" onSubmit={handleSubmit} className="space-y-5">
          <FormSection icon={<Users />} eyebrow="Details" first>
            <FormGrid cols={2}>
              <FormField id="customer-name" label="Customer Name" required className="col-span-2">
                <input
                  id="customer-name"
                  name="customer-name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="off"
                  className={formInputClass}
                />
              </FormField>
              <FormField id="customer-contact" label="Contact Person">
                <input
                  id="customer-contact"
                  name="customer-contact"
                  type="text"
                  value={contactPerson}
                  onChange={e => setContactPerson(e.target.value)}
                  autoComplete="off"
                  className={formInputClass}
                />
              </FormField>
              <FormField id="customer-phone" label="Phone">
                <input
                  id="customer-phone"
                  name="customer-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className={formInputClass}
                />
              </FormField>
              <FormField id="customer-email" label="Email">
                <input
                  id="customer-email"
                  name="customer-email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={formInputClass}
                />
              </FormField>
              <FormField id="customer-ntn" label="NTN Number">
                <input
                  id="customer-ntn"
                  name="customer-ntn"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={ntn}
                  onChange={e => setNtn(e.target.value)}
                  className={formInputClass}
                />
              </FormField>
            </FormGrid>
          </FormSection>
          <FormSection icon={<MapPin />} eyebrow="Address & notes">
            <FormGrid cols={2}>
              <FormField id="customer-address" label="Address" className="col-span-2">
                <textarea
                  id="customer-address"
                  name="customer-address"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  rows={2}
                  autoComplete="off"
                  className={formInputClass}
                />
              </FormField>
              <FormField id="customer-notes" label="Notes" className="col-span-2">
                <textarea
                  id="customer-notes"
                  name="customer-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  autoComplete="off"
                  className={formInputClass}
                />
              </FormField>
            </FormGrid>
          </FormSection>
        </form>
      </FormModal>

      {ledgerParty && <PartyLedgerModal party={ledgerParty} onClose={() => setLedgerParty(null)} />}
    </div>
  );
}
