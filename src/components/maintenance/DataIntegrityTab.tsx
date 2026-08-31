import { AlertCircle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from '@/components/ui/card';
import { InventoryReportService } from '@/lib/reporting/InventoryReportService';
import { useERPStore } from '@/store/useERPStore';

interface IntegrityIssue {
  id: string;
  type: 'error' | 'warning';
  module: 'accounting' | 'inventory' | 'processing';
  message: string;
  detail: string;
}

export function DataIntegrityTab() {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [issues, setIssues] = useState<IntegrityIssue[]>([]);

  const runIntegrityCheck = async () => {
    setIsScanning(true);
    // Artificial delay to show progress and simulate large db scan
    await new Promise(r => setTimeout(r, 800));

    const state = useERPStore.getState();
    const foundIssues: IntegrityIssue[] = [];

    // 1. Unbalanced Vouchers
    state.vouchers.forEach(v => {
      const entries = state.journalEntries.filter(e => e.voucherId === v.id);
      if (entries.length === 0) {
        foundIssues.push({
          id: `v-orphan-${v.id}`,
          type: 'error',
          module: 'accounting',
          message: `Orphaned Voucher: ${v.voucherNo}`,
          detail: 'Voucher has no associated journal entries.'
        });
        return;
      }

      const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        foundIssues.push({
          id: `v-unbal-${v.id}`,
          type: 'error',
          module: 'accounting',
          message: `Unbalanced Voucher: ${v.voucherNo}`,
          detail: `Debits: ${totalDebit}, Credits: ${totalCredit}`
        });
      }
    });

    // 2. Trial Balance Check (from the authoritative journal entries trail)
    const activeVoucherIds = new Set(
      state.vouchers.filter(v => v.status !== 'Cancelled' && v.status !== 'Deleted').map(v => v.id)
    );
    const allDebits = state.journalEntries
      .filter(e => activeVoucherIds.has(e.voucherId))
      .reduce((sum, e) => sum + (e.debit || 0), 0);
    const allCredits = state.journalEntries
      .filter(e => activeVoucherIds.has(e.voucherId))
      .reduce((sum, e) => sum + (e.credit || 0), 0);
    if (Math.abs(allDebits - allCredits) > 0.01) {
      foundIssues.push({
        id: 'tb-mismatch',
        type: 'error',
        module: 'accounting',
        message: 'Trial Balance Mismatch',
        detail: `System total Debits (${allDebits}) != Credits (${allCredits})`
      });
    }

    // 3. Negative Stock Check
    const productStock = InventoryReportService.getFinishedGoodsStockData('');
    productStock.forEach(p => {
      if (p.currentStock < 0) {
        foundIssues.push({
          id: `stk-neg-p-${p.id}`,
          type: 'error',
          module: 'inventory',
          message: `Negative Stock (Product): ${p.name}`,
          detail: `Current stock is ${p.currentStock}`
        });
      }
    });

    const materialStock = InventoryReportService.getRawMaterialStockData('');
    materialStock.forEach((m: any) => {
      if (m.currentStock < 0) {
        foundIssues.push({
          id: `stk-neg-m-${m.id}`,
          type: 'error',
          module: 'inventory',
          message: `Negative Stock (Material): ${m.name}`,
          detail: `Current stock is ${m.currentStock}`
        });
      }
    });

    // 4. Broken processing linkages
    state.processingSends.forEach(s => {
      const p = state.processors.find(pr => pr.id === s.processorId);
      if (!p) {
        foundIssues.push({
          id: `proc-orph-${s.id}`,
          type: 'error',
          module: 'processing',
          message: `Orphaned Dispatch: ${s.dispatchNo}`,
          detail: 'Processor ID no longer exists in database.'
        });
      }
    });

    setIssues(foundIssues);
    setLastScan(new Date());
    setIsScanning(false);
  };

  return (
    <Card className="flex flex-col min-h-[500px]">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Data Integrity Scanner
          </CardTitle>
          <CardDescription>
            Scan the entire database for accounting imbalances, orphaned records, and negative inventory.
          </CardDescription>
        </div>
        <Button onClick={runIntegrityCheck} disabled={isScanning}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning Database…' : 'Run Full Scan'}
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {!lastScan && !isScanning ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground pt-12">
            <ShieldCheck className="h-16 w-16 mb-4 opacity-20" />
            <p>No scan has been run yet in this session.</p>
            <p className="text-sm">Click "Run Full Scan" to verify database integrity.</p>
          </div>
        ) : isScanning ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground pt-12">
            <RefreshCw className="h-12 w-12 mb-4 opacity-20 animate-spin" />
            <p>Scanning relational constraints and ledger balances...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg">
              <div>
                <p className="text-sm font-medium">Scan Completed</p>
                <p className="text-xs text-muted-foreground">{lastScan?.toLocaleString()}</p>
              </div>
              <div className="text-right">
                {issues.length === 0 ? (
                  <span className="inline-flex items-center text-success  font-medium">
                    <CheckCircle2 className="h-5 w-5 mr-1" /> System Healthy
                  </span>
                ) : (
                  <span className="inline-flex items-center text-destructive font-medium">
                    <AlertCircle className="h-5 w-5 mr-1" /> {issues.length} Issues Found
                  </span>
                )}
              </div>
            </div>

            {issues.length > 0 ? (
              <div className="border rounded-md divide-y">
                {issues.map(issue => (
                  <div key={issue.id} className="p-4 flex gap-3">
                    <div className="mt-0.5">
                      {issue.type === 'error' ? (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{issue.message}</p>
                      <p className="text-sm text-muted-foreground">{issue.detail}</p>
                      <span className="inline-block mt-1 text-[10px] uppercase tracking-wider px-2 py-0.5 bg-muted rounded-full font-medium">
                        {issue.module}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3 opacity-80" />
                <p className="text-lg font-medium">No Integrity Issues Found</p>
                <p className="text-sm text-muted-foreground">The database is completely healthy and balanced.</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}