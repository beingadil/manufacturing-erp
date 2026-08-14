import { useEffect, useState } from 'react';
import { useERPStore } from '../store/useERPStore';
import { Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface Issue {
  category: string;
  name: string;
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

export function SystemHealthDashboard() {
  const state = useERPStore();
  const [healthStatus, setHealthStatus] = useState<Issue[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);

  const runHealthCheck = () => {
    setIsScanning(true);
    setTimeout(() => {
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
        // 1. Database Connection & Basic Integrity
        addIssue('Database', 'Zustand Store Active', 'pass', `Store loaded. ${state.accounts?.length || 0} accounts found.`);
        
        // 2. Orphaned Records Check
        const orphanedPurchases = state.purchases?.filter((p: any) => !state.suppliers?.find((s: any) => s.id === p.supplierId)) || [];
        if (orphanedPurchases.length > 0) {
          addIssue('Integrity', 'Orphaned Purchases', 'fail', `${orphanedPurchases.length} purchases linked to deleted suppliers.`);
        } else {
          addIssue('Integrity', 'Orphaned Purchases', 'pass', 'All purchases have valid suppliers.');
        }

        const orphanedSales = state.sales?.filter((s: any) => !state.customers?.find((c: any) => c.id === s.customerId)) || [];
        if (orphanedSales.length > 0) {
          addIssue('Integrity', 'Orphaned Sales', 'fail', `${orphanedSales.length} sales linked to deleted customers.`);
        } else {
          addIssue('Integrity', 'Orphaned Sales', 'pass', 'All sales have valid customers.');
        }

        // 3. Financial Integrity (Trial Balance Check)
        let totalDebit = 0;
        let totalCredit = 0;
        state.journalEntries?.forEach((entry: any) => {
          if (entry.debit) totalDebit += entry.debit;
          if (entry.credit) totalCredit += entry.credit;
        });

        // Add opening balances
        state.accounts?.forEach((a: any) => {
          if (a.openingBalanceType === 'Debit') totalDebit += a.openingBalance;
          if (a.openingBalanceType === 'Credit') totalCredit += a.openingBalance;
        });

        const diff = Math.abs(totalDebit - totalCredit);
        if (diff > 0.01) {
          addIssue('Financial', 'Trial Balance Match', 'fail', `Mismatch of ${diff.toFixed(2)}. Dr: ${totalDebit}, Cr: ${totalCredit}`);
        } else {
          addIssue('Financial', 'Trial Balance Match', 'pass', `Books are balanced. Total: ${totalDebit.toFixed(2)}`);
        }

        // 4. Voucher Integrity
        const invalidVouchers = state.vouchers?.filter((v: any) => v.totalDebit !== v.totalCredit) || [];
        if (invalidVouchers.length > 0) {
          addIssue('Financial', 'Voucher Balancing', 'fail', `${invalidVouchers.length} vouchers have mismatched Dr/Cr.`);
        } else {
          addIssue('Financial', 'Voucher Balancing', 'pass', 'All vouchers are perfectly balanced.');
        }

        // 5. Inventory Integrity
        const negativeStocks = state.materials?.filter((m: any) => m.stockPcs < 0) || [];
        if (negativeStocks.length > 0) {
          addIssue('Inventory', 'Negative Stock', 'warn', `${negativeStocks.length} materials have negative stock.`);
        } else {
          addIssue('Inventory', 'Negative Stock', 'pass', 'No negative stock found.');
        }

        // 6. Settings Check
        if (!state.companySettings?.name || state.companySettings.name === '') {
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
    }, 800);
  };

  useEffect(() => {
    runHealthCheck();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Health Check</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {lastScan ? `Last scanned: ${lastScan.toLocaleTimeString()}` : 'Initializing scan...'}
          </p>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Run Diagnostics'}
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
