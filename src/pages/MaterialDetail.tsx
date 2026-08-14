import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useERPStore } from '../store/useERPStore';
import { ArrowLeft, Package, History, ArrowRightLeft, Target, Clock, ArrowDown, ArrowUp } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { format } from 'date-fns';

export function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const { 
    materials, categories, batches, processingSends, 
    products, sales, inventoryMovements,
    suppliers, processors
  } = useERPStore();

  const material = materials.find(m => m.id === id);
  const category = categories.find(c => c.id === material?.categoryId);

  const materialBatches = useMemo(() => {
    return (batches || []).filter(b => b.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [batches, id]);

  const materialMovements = useMemo(() => {
    return (inventoryMovements || []).filter(m => m.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inventoryMovements, id]);

  const materialSends = useMemo(() => {
    return processingSends.filter(s => s.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [processingSends, id]);

  const materialProducts = useMemo(() => {
    return products.filter(p => p.materialId === id);
  }, [products, id]);
  
  const productIds = materialProducts.map(p => p.id);
  
  const materialSales = useMemo(() => {
    return sales.filter(s => productIds.includes(s.productId)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, productIds]);

  if (!material) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Package className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Material Not Found</h2>
        <Link to="/materials" className="text-sm font-medium text-muted-foreground hover:text-foreground underline">
          Return to Materials
        </Link>
      </div>
    );
  }

  const getSupplierName = (supplierId: string) => suppliers.find(s => s.id === supplierId)?.name || 'Unknown';
  const getProcessorName = (processorId: string) => processors.find(p => p.id === processorId)?.name || 'Unknown';
  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name || 'Unknown';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center gap-4">
        <Link to="/materials" className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{material.name}</h2>
            <span className={cn(
              "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
              material.status === 'Active' ? "bg-success/10 text-success ring-1 ring-success/20" : "bg-muted text-muted-foreground ring-1 ring-muted-foreground/20"
            )}>
              {material.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{category?.name || 'Uncategorized'} • {material.description || 'No description'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Package className="h-5 w-5" />
            <span className="text-sm font-medium">Available Raw Stock</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{material.stockPcs} <span className="text-sm font-medium text-muted-foreground">PCS</span></div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-medium">At Processor</span>
          </div>
          <div className="text-3xl font-bold text-warning">{material.atProcessorPcs || 0} <span className="text-sm font-medium text-amber-500/70">PCS</span></div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Target className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-medium">Processed Stock</span>
          </div>
          <div className="text-3xl font-bold text-success">{material.processedStockPcs} <span className="text-sm font-medium text-emerald-500/70">PCS</span></div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <History className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium">Reserved Stock</span>
          </div>
          <div className="text-3xl font-bold text-info">{material.reservedStockPcs || 0} <span className="text-sm font-medium text-blue-500/70">PCS</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/40">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" /> Movement Ledger
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 p-0">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-muted-foreground bg-card sticky top-0 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Ref</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {materialMovements.length > 0 ? (
                    materialMovements.map(m => (
                      <tr key={m.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{format(new Date(m.date), 'MMM d, yyyy')}</td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          <div>{m.referenceNo}</div>
                          <div className="text-xs text-muted-foreground font-normal">{m.module}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                            m.transactionType === 'IN' ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                          )}>
                            {m.transactionType === 'IN' ? <ArrowDown className="w-3 h-3 mr-1" /> : <ArrowUp className="w-3 h-3 mr-1" />}
                            {m.transactionType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">{m.quantity}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{m.runningBalance}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No movements recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col max-h-[400px]">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/40">
              <h3 className="font-semibold text-foreground">Batches</h3>
            </div>
            <div className="overflow-y-auto flex-1 p-0">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-muted-foreground bg-card sticky top-0 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Batch No</th>
                    <th className="px-4 py-3 font-medium">Supplier</th>
                    <th className="px-4 py-3 font-medium text-right">Initial</th>
                    <th className="px-4 py-3 font-medium text-right">Remaining</th>
                    <th className="px-4 py-3 font-medium text-right">WIP</th>
                    <th className="px-4 py-3 font-medium text-right">Finished</th>
                    <th className="px-4 py-3 font-medium text-right">Purchase Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {materialBatches.length > 0 ? (
                    materialBatches.map(b => (
                      <tr key={b.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{b.batchNo}</td>
                        <td className="px-4 py-3 text-muted-foreground">{getSupplierName(b.supplierId)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{b.initialPcs}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">{b.remainingPcs}</td>
                        <td className="px-4 py-3 text-right text-warning">{b.atProcessorPcs || 0}</td>
                        <td className="px-4 py-3 text-right text-success">{b.processedPcs || 0}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {b.initialPcs > 0 ? `${formatCurrency(b.amount / b.initialPcs)}/PCS` : '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No batches recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col max-h-[300px]">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/40">
              <h3 className="font-semibold text-foreground">Processing History</h3>
            </div>
            <div className="overflow-y-auto flex-1 p-0">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-muted-foreground bg-card sticky top-0 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ref</th>
                    <th className="px-4 py-3 font-medium">Processor</th>
                    <th className="px-4 py-3 font-medium text-right">Sent</th>
                    <th className="px-4 py-3 font-medium text-right">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {materialSends.length > 0 ? (
                    materialSends.map(s => (
                      <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{s.dispatchNo}</td>
                        <td className="px-4 py-3 text-muted-foreground">{getProcessorName(s.processorId)}</td>
                        <td className="px-4 py-3 text-right text-foreground">{s.pcsSent}</td>
                        <td className="px-4 py-3 text-right text-success">{s.pcsReceived}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No processing history</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col max-h-[300px]">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/40">
              <h3 className="font-semibold text-foreground">Sales History</h3>
            </div>
            <div className="overflow-y-auto flex-1 p-0">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-muted-foreground bg-card sticky top-0 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {materialSales.length > 0 ? (
                    materialSales.map(s => (
                      <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{format(new Date(s.date), 'MMM d, yyyy')}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{s.invoiceNo}</td>
                        <td className="px-4 py-3 text-muted-foreground">{getProductName(s.productId)}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">{s.pcsSold}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No sales history</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
