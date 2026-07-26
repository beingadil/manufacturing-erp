import React, { useState } from "react";
import { X } from "lucide-react";
import { useERPStore } from "../store/useERPStore";

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (id: string) => void;
}

export function QuickAddCustomer({ isOpen, onClose, onSuccess }: BaseModalProps) {
  const { addCustomer } = useERPStore();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // We didn't define companyName in Customer type according to erp.ts, wait! Let me check... 
    // erp.ts actually doesn't have companyName for Customer, just name, contactPerson, phone, address, ntn, notes
    const id = addCustomer({ name, phone });
    onSuccess(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b flex justify-between">
          <h3 className="text-lg font-bold">Quick Add Customer</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground/80" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Customer Name *</label>
            <input required autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Save Customer</button>
        </form>
      </div>
    </div>
  );
}

export function QuickAddSupplier({ isOpen, onClose, onSuccess }: BaseModalProps) {
  const { addSupplier } = useERPStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = addSupplier({ name, phone });
    onSuccess(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b flex justify-between">
          <h3 className="text-lg font-bold">Quick Add Supplier</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground/80" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Supplier Name *</label>
            <input required autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Save Supplier</button>
        </form>
      </div>
    </div>
  );
}

export function QuickAddProcessor({ isOpen, onClose, onSuccess }: BaseModalProps) {
  const { addProcessor } = useERPStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = addProcessor({ name, phone });
    onSuccess(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b flex justify-between">
          <h3 className="text-lg font-bold">Quick Add Processor</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground/80" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Processor Name *</label>
            <input required autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Save Processor</button>
        </form>
      </div>
    </div>
  );
}

export function QuickAddProduct({ isOpen, onClose, onSuccess }: BaseModalProps) {
  const { addProduct, materials } = useERPStore();
  const [name, setName] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !materialId || !sellingPrice) return;
    const id = addProduct({ name, materialId, sellingPrice: parseFloat(sellingPrice) });
    onSuccess(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b flex justify-between">
          <h3 className="text-lg font-bold">Quick Add Product</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground/80" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Product Name *</label>
            <input required autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Linked Material *</label>
            <select required value={materialId} onChange={e => setMaterialId(e.target.value)} className="w-full rounded-xl border p-3 text-sm">
              <option value="">Select Material...</option>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Selling Price *</label>
            <input type="number" step="0.01" required value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Save Product</button>
        </form>
      </div>
    </div>
  );
}

export function QuickAddMaterial({ isOpen, onClose, onSuccess }: BaseModalProps) {
  const { addRawMaterial, categories } = useERPStore();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) return;
    const id = addRawMaterial({ name, categoryId, status: "Active" });
    onSuccess(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b flex justify-between">
          <h3 className="text-lg font-bold">Quick Add Material</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground/80" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Material Name *</label>
            <input required autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Category *</label>
            <select required value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full rounded-xl border p-3 text-sm">
              <option value="">Select Category...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Save Material</button>
        </form>
      </div>
    </div>
  );
}

