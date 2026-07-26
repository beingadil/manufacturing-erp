import React, { useState, useMemo } from "react";
import { useERPStore } from "../store/useERPStore";
import { Plus, PackageCheck, X } from "lucide-react";
import { DataTable, Column } from "../components/DataTable";
import { formatCurrency } from "../lib/utils";
import { SearchableSelect } from "../components/SearchableSelect";
import { QuickAddMaterial } from "../components/QuickAddModals";

export function FinishedGoods() {
  const { products, materials, categories, addProduct } = useERPStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [name, setName] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !materialId || !sellingPrice) return;

    addProduct({
      name,
      materialId,
      categoryId,
      sellingPrice: parseFloat(sellingPrice),
      description
    });
    
    setIsModalOpen(false);
    setName("");
    setCategoryId("");
    setMaterialId("");
    setSellingPrice("");
    setDescription("");
  };

  const enrichedProducts = useMemo(() => products.map(p => {
    const m = materials.find(mat => mat.id === p.materialId);
    const cat = categories.find(c => c.id === p.categoryId);
    return {
      ...p,
      categoryName: cat?.name || '-',
      materialName: m?.name || 'Unknown',
      availableStock: m?.processedStockPcs || 0
    };
  }), [products, materials, categories]);

  const columns: Column<typeof enrichedProducts[0]>[] = [
    { key: "name", label: "Product Name", sortable: true, render: (item) => <span className="font-medium">{item.name}</span> },
    { key: "categoryName", label: "Category", sortable: true },
    { key: "materialName", label: "Linked Material", sortable: true },
    { key: "sellingPrice", label: "Selling Price", align: "right", sortable: true, render: (item) => <span className="font-medium">{formatCurrency(item.sellingPrice)}</span> },
    { key: "availableStock", label: "Available Stock (PCS)", align: "right", sortable: true, render: (item) => <span className="font-bold text-success">{item.availableStock}</span> }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Products</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage final products linked to raw materials.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      <DataTable
        data={enrichedProducts}
        columns={columns}
        searchKeys={["name", "categoryName", "materialName"]}
        searchPlaceholder="Search products..."
        persistKey="products-table"
        defaultSortKey="name"
      />

      {isModalOpen && !isAddMaterialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between">
              <h3 className="text-lg font-bold">Add Product</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="h-5 w-5 text-muted-foreground/80" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 pb-64 space-y-4">
              <input type="text" required placeholder="Product Name" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full rounded-xl border p-3 text-sm bg-card">
                <option value="">Select Category (Optional)</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <div>
                <SearchableSelect 
                  options={materials.map(m => ({ id: m.id, label: m.name }))}
                  value={materialId}
                  onChange={setMaterialId}
                  placeholder="Select Linked Material..."
                  onAdd={() => setIsAddMaterialOpen(true)}
                  required
                />
              </div>
              
              <input type="number" step="0.01" required placeholder="Selling Price (₹)" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <input type="text" placeholder="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border p-3 text-sm" />
              <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">Save Product</button>
            </form>
          </div>
        </div>
      )}

      <QuickAddMaterial 
        isOpen={isAddMaterialOpen} 
        onClose={() => setIsAddMaterialOpen(false)} 
        onSuccess={(id) => setMaterialId(id)} 
      />
    </div>
  );
}
