import { ChevronRight, Download, FileText, Pencil, Printer, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { filterFinancialData } from '../lib/abac';
import { formatCurrency } from '../lib/utils';
import { DatePicker } from './ui/date-picker';
import { useERPStore } from '../store/useERPStore';
import { SourceModule } from '../types/erp';
import { CashbookEntryModal } from './CashbookEntryModal';
import { VoucherDetailModal } from './VoucherDetailModal';

interface VoucherHistoryTabProps {
  sourceModule: SourceModule;
}

export function VoucherHistoryTab({ sourceModule }: VoucherHistoryTabProps) {
  const { profile, isAdmin, dataPolicies } = useAuth();
  const { vouchers } = useERPStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [editingVoucherId, setEditingVoucherId] = useState<string | undefined>(undefined);

  const filteredVouchers = useMemo(() => {
    const secureVouchers = filterFinancialData(vouchers, profile, isAdmin, dataPolicies);
    return secureVouchers.filter(v => {
      // 1. Module Filter
      if (v.sourceModule !== sourceModule) return false;

      // 2. Date Filter
      if (dateFrom && v.date < dateFrom) return false;
      if (dateTo && v.date > dateTo) return false;

      // 3. Search Filter (Voucher No, Ref No, Narration)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !v.voucherNo.toLowerCase().includes(term) &&
          !(v.referenceNo && v.referenceNo.toLowerCase().includes(term)) &&
          !v.narration.toLowerCase().includes(term)
        ) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Descending by date
  }, [vouchers, sourceModule, dateFrom, dateTo, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-card border border-border/50 rounded-xl shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by Voucher No, Ref No, or Narration..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <DatePicker value={dateFrom} onChange={setDateFrom} size="sm" className="w-40" placeholder="From" />
          <span className="text-muted-foreground">to</span>
          <DatePicker value={dateTo} onChange={setDateTo} size="sm" className="w-40" placeholder="To" />
        </div>
        <div className="flex items-center gap-2">
           <button className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground transition-colors" title="Export CSV" aria-label="Export CSV">
             <Download className="h-4 w-4" />
           </button>
           <button className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground transition-colors" title="Print" aria-label="Print">
             <Printer className="h-4 w-4" />
           </button>
        </div>
      </div>

      {/* Voucher List */}
      <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Voucher No</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    No vouchers found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredVouchers.map(v => (
                  <tr key={v.id} className="hover:bg-muted/20 transition-colors group cursor-pointer" onClick={() => setSelectedVoucherId(v.id)}>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(v.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{v.voucherNo}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.type}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.referenceNo || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(v.totalDebit)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(v.totalCredit)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        v.status === 'Posted' ? 'bg-success/10 text-success' :
                        v.status === 'Deleted' ? 'bg-destructive/100/10 text-destructive ' :
                        'bg-warning/10 text-warning'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={() => setEditingVoucherId(v.id)}
                          className="p-1 text-muted-foreground/50 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                          title="Edit voucher"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors inline-block" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedVoucherId && (
        <VoucherDetailModal 
          voucherId={selectedVoucherId} 
          onClose={() => setSelectedVoucherId(null)} 
        />
      )}

      {editingVoucherId && (
        <CashbookEntryModal 
          isOpen={true}
          onClose={() => setEditingVoucherId(undefined)}
          onSave={() => setEditingVoucherId(undefined)}
          editVoucherId={editingVoucherId}
        />
      )}
    </div>
  );
}
