import React, { useMemo, useState } from 'react';
import { useERPStore } from '../store/useERPStore';
import { X, FileText, CheckCircle2, History, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { JournalEntry } from '../types/erp';
import { ErrorManagement } from '../lib/validation';
import { AccountingService } from '../services/AccountingService';

export function VoucherDetailModal({ voucherId, onClose }: { voucherId: string, onClose: () => void }) {
  const { vouchers, journalEntries, accounts, deleteVoucher } = useERPStore();
  const [activeTab, setActiveTab] = useState<'entries' | 'audit'>('entries');
  
  const voucher = vouchers.find(v => v.id === voucherId);
  
  const entries = useMemo(() => {
    return journalEntries.filter(e => e.voucherId === voucherId);
  }, [journalEntries, voucherId]);

  if (!voucher) return null;

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this voucher? This will reverse its accounting impact.")) {
      ErrorManagement.safeExecuteSync(() => {
        AccountingService.deleteVoucher(voucher.id);
        onClose();
      }, 'Voucher Delete');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 flex items-start justify-between bg-muted/20">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">{voucher.voucherNo}</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <span>{voucher.type}</span>
                  <span>•</span>
                  <span>{new Date(voucher.date).toLocaleDateString()}</span>
                  {voucher.referenceNo && (
                    <>
                      <span>•</span>
                      <span>Ref: {voucher.referenceNo}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
              voucher.status === 'Posted' ? 'bg-success/10 text-success' :
              voucher.status === 'Cancelled' ? 'bg-destructive/100/10 text-destructive ' :
              'bg-warning/10 text-warning'
            }`}>
              {voucher.status === 'Posted' && <CheckCircle2 className="w-3 h-3 mr-1" />}
              {voucher.status === 'Cancelled' && <AlertCircle className="w-3 h-3 mr-1" />}
              {voucher.status}
            </span>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Action Bar & Tabs */}
        <div className="px-6 py-2 border-b border-border/50 flex items-center justify-between bg-card">
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('entries')}
              className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'entries' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              Journal Entries
            </button>
            <button 
              onClick={() => setActiveTab('audit')}
              className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'audit' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <History className="h-4 w-4" />
              Audit Trail
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            {voucher.status === 'Posted' && (
              <>
                <button className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors">
                  <Edit className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button 
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-destructive/100/10 hover:bg-destructive/100/20 text-destructive  rounded-lg transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Voucher
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
          
          {/* Metadata Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 bg-card p-4 rounded-xl border border-border/50 shadow-sm">
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Source Module</p>
              <p className="text-sm font-medium">{voucher.sourceModule}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Created At</p>
              <p className="text-sm font-medium">{new Date(voucher.createdAt).toLocaleString()}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Narration</p>
              <p className="text-sm font-medium">{voucher.narration || '-'}</p>
            </div>
          </div>

          {activeTab === 'entries' && (
            <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Narration</th>
                    <th className="px-4 py-3 text-right w-32">Debit</th>
                    <th className="px-4 py-3 text-right w-32">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {entries.map(entry => {
                    const acc = accounts.find(a => a.id === entry.accountId);
                    return (
                      <tr key={entry.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{acc?.name || 'Unknown Account'}</div>
                          <div className="text-xs text-muted-foreground">{acc?.code} • {acc?.type}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{entry.narration || '-'}</td>
                        <td className="px-4 py-3 text-right font-medium">{entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</td>
                        <td className="px-4 py-3 text-right font-medium">{entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</td>
                      </tr>
                    );
                  })}
                  
                  {/* Totals Row */}
                  <tr className="bg-muted/20 font-bold border-t-2 border-border/50">
                    <td colSpan={2} className="px-4 py-4 text-right uppercase text-xs tracking-wider">Total</td>
                    <td className="px-4 py-4 text-right text-success">{formatCurrency(voucher.totalDebit)}</td>
                    <td className="px-4 py-4 text-right text-success">{formatCurrency(voucher.totalCredit)}</td>
                  </tr>
                </tbody>
              </table>
              
              {voucher.totalDebit !== voucher.totalCredit && (
                <div className="p-3 bg-destructive/100/10 text-destructive text-sm font-medium flex items-center justify-center gap-2 border-t border-destructive/20">
                  <AlertCircle className="w-4 h-4" />
                  Warning: Voucher is unbalanced! (Difference: {formatCurrency(Math.abs(voucher.totalDebit - voucher.totalCredit))})
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-4">
              {!voucher.versionHistory || voucher.versionHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-card rounded-xl border border-border/50">
                  No audit history available.
                </div>
              ) : (
                <div className="relative border-l-2 border-border ml-4 space-y-8 pb-4">
                  {voucher.versionHistory.map((audit, index) => (
                    <div key={audit.id} className="relative pl-6">
                      <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-card ${
                        audit.action === 'Created' ? 'bg-success' :
                        audit.action === 'Deleted' ? 'bg-destructive/100' :
                        'bg-info/100'
                      }`} />
                      
                      <div className="bg-card p-4 rounded-xl border border-border/50 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold flex items-center gap-2 text-foreground">
                            {audit.action}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
                            {new Date(audit.modifiedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          Reason: <span className="font-medium text-foreground">{audit.reason || 'N/A'}</span>
                        </p>
                        
                        {audit.previousValues && audit.updatedValues && (
                          <div className="mt-4 border-t border-border/50 pt-4 text-xs font-mono bg-muted/30 p-3 rounded-lg overflow-x-auto">
                            <details>
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-sans text-sm font-medium">View detailed changes</summary>
                              <div className="grid grid-cols-2 gap-4 mt-3">
                                <div>
                                  <div className="font-semibold text-destructive mb-1">Previous:</div>
                                  <pre className="whitespace-pre-wrap">{JSON.stringify(audit.previousValues, null, 2)}</pre>
                                </div>
                                <div>
                                  <div className="font-semibold text-success mb-1">Updated:</div>
                                  <pre className="whitespace-pre-wrap">{JSON.stringify(audit.updatedValues, null, 2)}</pre>
                                </div>
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
