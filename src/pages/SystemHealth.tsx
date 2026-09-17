import { Activity, AlertTriangle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';

interface Issue {
  category: string;
  name: string;
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

const electronDB = () => (window as any).electronDB;

export function SystemHealthDashboard() {
  // Per-slice selectors so the component only re-renders when a slice it reads
  // actually changes (previously subscribed to the entire store).
  const processingSends = useERPStore(s => s.processingSends);
  const materials = useERPStore(s => s.materials);
  const batches = useERPStore(s => s.batches);
  const accounts = useERPStore(s => s.accounts);
  const purchases = useERPStore(s => s.purchases);
  const suppliers = useERPStore(s => s.suppliers);
  const sales = useERPStore(s => s.sales);
  const customers = useERPStore(s => s.customers);
  const journalEntries = useERPStore(s => s.journalEntries);
  const vouchers = useERPStore(s => s.vouchers);
  const processingReceipts = useERPStore(s => s.processingReceipts);
  const processingStages = useERPStore(s => s.processingStages);
  const companySettings = useERPStore(s => s.companySettings);

  const [healthStatus, setHealthStatus] = useState<Issue[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);

  const runHealthCheck = useCallback(async () => {
    setIsScanning(true);
      const issues: Issue[] = [];
      let _passed = 0;
      let _failed = 0;
      let _warnings = 0;

      const addIssue = (category: string, name: string, status: 'pass' | 'fail' | 'warn', details: string) => {
        issues.push({ category, name, status, details });
        if (status === 'pass') _passed++;
        if (status === 'fail') _failed++;
        if (status === 'warn') _warnings++;
      };

      try {

      // ── Real SQLite Integrity Check (Electron IPC) ──────────────
      if (electronDB()?.integrityCheck) {
        try {
          const r = await electronDB().integrityCheck();
          if (r?.success)
            addIssue('Database', 'SQLite Integrity', 'pass', 'SQLite integrity check passed - no corruption detected.');
          else {
            const detail = r?.error || (Array.isArray(r?.details) && r.details.length ? r.details.join('; ') : 'unknown error');
            addIssue('Database', 'SQLite Integrity', 'fail', 'Integrity check failed: ' + detail);
          }
        } catch {
          addIssue('Database', 'SQLite Integrity', 'warn', 'Could not reach SQLite integrity check.');
        }
      } else {
        addIssue('Database', 'SQLite Integrity', 'warn', 'Browser mode - SQLite check skipped.');
      }

      // ── Database File Info (Electron IPC) ─────────────────────────
      if (electronDB()?.diag) {
        try {
          const diag = await electronDB().diag();
          if (diag?.success && diag?.data?.exists) {
            const sizeMB = (diag.data.size / (1024 * 1024)).toFixed(2);
            addIssue('Database', 'Database File', 'pass', 'SQLite file at ' + diag.data.path + ' (' + sizeMB + ' MB).');
          } else {
            addIssue('Database', 'Database File', 'fail', 'SQLite file not found on disk.');
          }
        } catch {
          addIssue('Database', 'Database File', 'warn', 'Could not query database file info.');
        }
      } else {
        addIssue('Database', 'Database File', 'warn', 'Browser mode - file check skipped.');
      }

      // ── Orphaned Processing Records ──────────────────────────────
      const orphanedSends = processingSends?.filter((ps: any) => !materials?.find((m: any) => m.id === ps.materialId)) || [];
      if (orphanedSends.length > 0) {
        addIssue('Integrity', 'Orphaned Processing', 'fail', orphanedSends.length + ' sends reference deleted materials.');
      } else {
        addIssue('Integrity', 'Orphaned Processing', 'pass', 'All ' + (processingSends?.length || 0) + ' sends OK.');
      }

      // ── Batch Integrity ──────────────────────────────────────────
      const orphanedBatches = batches?.filter((b: any) => !materials?.find((m: any) => m.id === b.materialId)) || [];
      if (orphanedBatches.length > 0) {
        addIssue('Inventory', 'Orphaned Batches', 'warn', orphanedBatches.length + ' batches reference deleted materials.');
      } else {
        addIssue('Inventory', 'Orphaned Batches', 'pass', 'All ' + (batches?.length || 0) + ' batches OK.');
      }

      // ── Unbilled Final-Stage Processing ──────────────────────────
      // A receipt is "unbilled final-stage" when it produced saleable finished
      // goods (its stage isFinalStage) but billedStatus is not 'Billed'.
      // Stage resolution: the receipt's own stageId, falling back to its
      // dispatch's stageId (legacy receipts may predate receipt.stageId).
      const sendsById = new Map((processingSends || []).map((ps: any) => [ps.id, ps]));
      const isFinalStage = (stageId?: string) =>
        !!processingStages?.find((s: any) => s.id === stageId)?.isFinalStage;
      const unbilledFinal = (processingReceipts || []).filter((r: any) => {
        if ((r.pcsReceived || 0) <= 0) return false;
        if (r.billedStatus === 'Billed') return false;
        const send = sendsById.get(r.sendId);
        return isFinalStage(r.stageId) || (!!send && isFinalStage(send.stageId));
      });
      if (unbilledFinal.length > 0) {
        addIssue('Processing', 'Unbilled Final Stage', 'warn', unbilledFinal.length + ' final-stage receipt(s) not yet billed.');
      } else {
        addIssue('Processing', 'Unbilled Final Stage', 'pass', 'No unbilled final-stage receipts.');
      }

      // ── Chart of Accounts Seeded ─────────────────────────────────
      if ((accounts?.length || 0) < 10) {
        addIssue('Configuration', 'Chart of Accounts', 'warn', 'Only ' + (accounts?.length || 0) + ' accounts - may not be seeded.');
      } else {
        addIssue('Configuration', 'Chart of Accounts', 'pass', (accounts?.length || 0) + ' accounts seeded.');
      }

        // 1. Database Connection & Basic Integrity
        addIssue('Database', 'Zustand Store Active', 'pass', `Store loaded. ${accounts?.length || 0} accounts found.`);
        
        // 2. Orphaned Records Check
        const orphanedPurchases = purchases?.filter((p: any) => !suppliers?.find((s: any) => s.id === p.supplierId)) || [];
        if (orphanedPurchases.length > 0) {
          addIssue('Integrity', 'Orphaned Purchases', 'fail', `${orphanedPurchases.length} purchases linked to deleted suppliers.`);
        } else {
          addIssue('Integrity', 'Orphaned Purchases', 'pass', 'All purchases have valid suppliers.');
        }

        const orphanedSales = sales?.filter((s: any) => !customers?.find((c: any) => c.id === s.customerId)) || [];
        if (orphanedSales.length > 0) {
          addIssue('Integrity', 'Orphaned Sales', 'fail', `${orphanedSales.length} sales linked to deleted customers.`);
        } else {
          addIssue('Integrity', 'Orphaned Sales', 'pass', 'All sales have valid customers.');
        }

        // 3. Financial Integrity (Trial Balance Check)
        let totalDebit = 0;
        let totalCredit = 0;
        journalEntries?.forEach((entry: any) => {
          if (entry.debit) totalDebit += entry.debit;
          if (entry.credit) totalCredit += entry.credit;
        });

        // Add opening balances
        accounts?.forEach((a: any) => {
          if (a.openingBalanceType === 'Debit') totalDebit += a.openingBalance;
          if (a.openingBalanceType === 'Credit') totalCredit += a.openingBalance;
        });

        const diff = Math.abs(totalDebit - totalCredit);
        if (diff > 0.01) {
          addIssue('Financial', 'Trial Balance Match', 'fail', `Mismatch of ${formatCurrency(diff)}. Dr: ${formatCurrency(totalDebit)}, Cr: ${formatCurrency(totalCredit)}`);
        } else {
          addIssue('Financial', 'Trial Balance Match', 'pass', `Books are balanced. Total: ${formatCurrency(totalDebit)}`);
        }

        // 4. Voucher Integrity (0.01 tolerance — float-exact comparison
        // false-fails on accumulated drift like 100.30000000000004)
        const invalidVouchers = vouchers?.filter((v: any) => Math.abs((v.totalDebit || 0) - (v.totalCredit || 0)) > 0.01) || [];
        if (invalidVouchers.length > 0) {
          addIssue('Financial', 'Voucher Balancing', 'fail', `${invalidVouchers.length} vouchers have mismatched Dr/Cr.`);
        } else {
          addIssue('Financial', 'Voucher Balancing', 'pass', 'All vouchers are perfectly balanced.');
        }

        // 5. Inventory Integrity
        const negativeStocks = materials?.filter((m: any) => m.stockPcs < 0) || [];
        if (negativeStocks.length > 0) {
          addIssue('Inventory', 'Negative Stock', 'warn', `${negativeStocks.length} materials have negative stock.`);
        } else {
          addIssue('Inventory', 'Negative Stock', 'pass', 'No negative stock found.');
        }

        // 6. Settings Check
        if (!companySettings?.name || companySettings.name === '') {
          addIssue('Configuration', 'Company Profile', 'warn', 'Company name is not configured.');
        } else {
          addIssue('Configuration', 'Company Profile', 'pass', 'Company profile is configured.');
        }

      } catch (e: any) {
        addIssue('System', 'Runtime Error', 'fail', `Exception during scan: ${e.message}`);
      }

      setHealthStatus(issues);
      setLastScan(new Date());
      setIsScanning(false);
  }, [processingSends, materials, batches, accounts, purchases, suppliers, sales, customers, journalEntries, vouchers, processingReceipts, processingStages, companySettings]);

  useEffect(() => { runHealthCheck(); }, [runHealthCheck]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Health Check</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {lastScan ? `Last scanned: ${lastScan.toLocaleTimeString()}` : 'Initializing scan'}
          </p>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning…' : 'Run Diagnostics'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col items-center justify-center text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500 mb-3" />
          <div className="text-3xl font-bold text-foreground">{healthStatus.filter(h => h.status === 'pass').length}</div>
          <div className="text-sm font-medium text-emerald-600 mt-1">Checks Passed</div>
        </div>
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col items-center justify-center text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
          <div className="text-3xl font-bold text-foreground">{healthStatus.filter(h => h.status === 'warn').length}</div>
          <div className="text-sm font-medium text-amber-600 mt-1">Warnings</div>
        </div>
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col items-center justify-center text-center">
          <XCircle className="h-10 w-10 text-rose-500 mb-3" />
          <div className="text-3xl font-bold text-foreground">{healthStatus.filter(h => h.status === 'fail').length}</div>
          <div className="text-sm font-medium text-rose-600 mt-1">Critical Issues</div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-6">
        <div className="p-4 border-b border-border bg-muted/20">
          <h3 className="font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Diagnostic Results
          </h3>
        </div>
        <div className="divide-y divide-border/50">
          {healthStatus.map((issue, idx) => (
            <div key={idx} className="p-4 flex items-start gap-4 hover:bg-muted/5 transition-colors">
              <div className="mt-0.5">
                {issue.status === 'pass' && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                {issue.status === 'warn' && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                {issue.status === 'fail' && <XCircle className="h-5 w-5 text-rose-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{issue.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    {issue.category}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{issue.details}</p>
              </div>
            </div>
          ))}
          {healthStatus.length === 0 && !isScanning && (
            <div className="p-8 text-center text-muted-foreground">
              No diagnostic data available. Run a scan to check system health.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
