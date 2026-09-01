import { ChevronRight, Download, FileText, Pencil, Printer, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { filterFinancialData } from '../lib/abac';
import { exportToCSV } from '../lib/exportUtils';
import { formatDate, formatCurrency } from '../lib/utils';
import { DatePicker } from './ui/date-picker';
import { useERPStore } from '../store/useERPStore';
import { SourceModule } from '../types/erp';
import { CashbookEntryModal } from './CashbookEntryModal';
import { VoucherDetailModal } from './VoucherDetailModal';
import { toast } from 'sonner';

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

  const handleExportCSV = () => {
    if (filteredVouchers.length === 0) {
      toast.info('Nothing to export', { description: 'No vouchers match the current filters.' });
      return;
    }
    exportToCSV({
      filename: `${sourceModule}_Vouchers_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`,
      data: filteredVouchers,
      columns: [
        { header: 'Date', dataKey: 'date' },
        { header: 'Voucher No', dataKey: 'voucherNo' },
        { header: 'Type', dataKey: 'type' },
        { header: 'Reference', dataKey: 'referenceNo' },
        { header: 'Debit', dataKey: 'totalDebit' },
        { header: 'Credit', dataKey: 'totalCredit' },
        { header: 'Status', dataKey: 'status' },
      ],
    });
    toast.success(`${filteredVouchers.length} vouchers exported to CSV`);
  };

  const handlePrint = () => {
    if (filteredVouchers.length === 0) {
      toast.info('Nothing to print', { description: 'No vouchers match the current filters.' });
      return;
    }
    const title = `${sourceModule} Voucher History`;
    const rows = filteredVouchers
      .map(v => `<tr><td>${formatDate(v.date)}</td><td>${v.voucherNo}</td><td>${v.type}</td><td>${v.referenceNo || '-'}</td><td style="text-align:right">${formatCurrency(v.totalDebit)}</td><td style="text-align:right">${formatCurrency(v.totalCredit)}</td><td>${v.status}</td></tr>`)
      .join('');
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) { toast.error('Print failed', { description: 'The print window was blocked.' }); return; }
    w.document.write(`<html><head><title>${title}</title><style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
      h1{font-size:18px;margin:0 0 4px}p{font-size:12px;color:#64748b;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}
      th{background:#f1f5f9;font-weight:600;text-transform:uppercase;font-size:10px}
    </style></head><body><h1>${title}</h1>
    <p>${filteredVouchers.length} vouchers${dateFrom || dateTo ? ` · ${dateFrom || '…'} to ${dateTo || '…'}` : ''}</p>
    <table><thead><tr><th>Date</th><th>Voucher No</th><th>Type</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

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
           <button onClick={handleExportCSV} className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground transition-colors" title="Export CSV" aria-label="Export CSV">
             <Download className="h-4 w-4" />
           </button>
           <button onClick={handlePrint} className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground transition-colors" title="Print" aria-label="Print">
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
                        v.status === 'Deleted' ? 'bg-destructive/10 text-destructive' :
                        'bg-warning/10 text-warning'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingVoucherId(v.id)}
                          aria-label={`Edit voucher ${v.voucherNo}`}
                          className="p-1 text-muted-foreground/60 hover:text-primary transition-colors"
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
