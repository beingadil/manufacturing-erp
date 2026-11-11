import { Pencil, Plus, Truck, } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Column, DataTable, RowActionButton } from "../components/DataTable";
import { FormFooter } from "../components/form/FormFooter";
import { FormModal } from "../components/form/FormModal";
import { SupplierForm } from "../components/forms/SupplierForm";
import { PartyLedgerModal } from "../components/PartyLedgerModal";
import { cn, formatCurrency, formatNumber } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";

export function Suppliers() {
  const { suppliers } = useERPStore();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ledgerParty, setLedgerParty] = useState<{ id: string; name: string; kind: 'Supplier' } | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);

  const openEditModal = (supplier: any) => {
    setEditingSupplier(supplier);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
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
            <p className="text-sm text-muted-foreground mt-0.5">Manage suppliers and what you owe them.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Create New
          </button>
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Suppliers</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(suppliers.length)}</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Payable</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-destructive">{formatCurrency(suppliers.reduce((s, su) => s + (su.balancePayable || 0), 0))}</div>
          <div className="text-xs text-muted-foreground">Outstanding balance</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">With Balance</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(suppliers.filter(su => (su.balancePayable || 0) > 0).length)}</div>
          <div className="text-xs text-muted-foreground">Suppliers owed money</div>
        </div>
      </section>

      <DataTable
        data={suppliers}
        columns={columns}
        searchKeys={["name", "phone", "ntn", "contactPerson"]}
        searchPlaceholder="Search suppliers..."
        persistKey="suppliers-table"
        defaultSortKey="name"
      />

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
        description="Someone you buy from, with contact details, NTN, address and notes."
        icon={editingSupplier ? <Pencil /> : <Truck />}
        size="xl"
        footer={
          <FormFooter
            onCancel={closeModal}
            formId="supplier-form"
            submitLabel={editingSupplier ? 'Save Changes' : 'Add Supplier'}
          />
        }>
        <SupplierForm
          supplier={editingSupplier}
          onSaved={closeModal}
          onCancel={closeModal}
          formId="supplier-form"
          showFooter={false}
        />
      </FormModal>

      {ledgerParty && <PartyLedgerModal party={ledgerParty} onClose={() => setLedgerParty(null)} />}
    </div>
  );
}
