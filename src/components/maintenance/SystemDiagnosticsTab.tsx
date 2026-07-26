import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Desktop } from '@/lib/desktop/DesktopInterop';
import { useERPStore } from '@/store/useERPStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Server, Cpu, HardDrive, Database, ListOrdered, FileJson, Beaker, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { DataSimulator } from '@/lib/qa/DataSimulator';
import { toast } from 'sonner';
import { getVersionInfo, IS_PRODUCTION, ENVIRONMENT } from '@/config/version';

export function SystemDiagnosticsTab() {
  const [dbSize, setDbSize] = useState<string>('Calculating...');
  
  // QA & Simulation State
  const [simCustomers, setSimCustomers] = useState('100');
  const [simSuppliers, setSimSuppliers] = useState('50');
  const [simPurchases, setSimPurchases] = useState('500');
  const [simSales, setSimSales] = useState('500');
  const [simDays, setSimDays] = useState('365');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState<string[]>([]);
  const [isCertifying, setIsCertifying] = useState(false);

  const state = useERPStore();
  const settings = useSettingsStore();
  
  useEffect(() => {
    // Rough estimation of DB size in memory for browser
    const getDbSize = async () => {
      try {
        const erp = await Desktop.storage.getItem('erp-storage') || '';
        const access = await Desktop.storage.getItem('erp-access-storage') || '';
        const bytes = erp.length + access.length;
        if (bytes > 1024 * 1024) {
          setDbSize(`${(bytes / (1024 * 1024)).toFixed(2)} MB`);
        } else {
          setDbSize(`${(bytes / 1024).toFixed(2)} KB`);
        }
      } catch {
        setDbSize('Unknown');
      }
    };
    getDbSize();
  }, []);

  const stats = [
    { label: 'Company Name', value: settings.dashboardName },
    { label: 'Primary Color', value: settings.primaryColor },
    { label: 'App Version', value: getVersionInfo() },
    { label: 'Environment', value: IS_PRODUCTION ? 'Production' : 'Development' },
    { label: 'OS Platform', value: Desktop.platform.getOS().toUpperCase() },
    { label: 'Database Size (Est.)', value: dbSize },
  ];

  const recordCounts = [
    { label: 'Customers', value: state.customers.length },
    { label: 'Suppliers', value: state.suppliers.length },
    { label: 'Processors', value: state.processors.length },
    { label: 'Raw Materials', value: state.materials.length },
    { label: 'Finished Products', value: state.products.length },
    { label: 'Vouchers', value: state.vouchers.length },
    { label: 'Journal Entries', value: state.journalEntries.length },
    { label: 'Ledger Entries', value: state.ledgerEntries.length },
    { label: 'Inventory Movements', value: state.inventoryMovements.length },
    { label: 'Purchases', value: state.purchases.length },
    { label: 'Sales', value: state.sales.length },
    { label: 'Processing Dispatches', value: state.processingSends.length },
    { label: 'Processing Receipts', value: state.processingReceipts.length },
  ];

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    setSimProgress([]);
    const handleProgress = (msg: string) => {
      setSimProgress(prev => [...prev, msg]);
    };
    
    await DataSimulator.simulateData({
      customers: parseInt(simCustomers) || 0,
      suppliers: parseInt(simSuppliers) || 0,
      purchases: parseInt(simPurchases) || 0,
      sales: parseInt(simSales) || 0,
      daysRange: parseInt(simDays) || 30
    }, handleProgress);
    
    setIsSimulating(false);
    toast.success('Simulation Complete');
  };

  const handleRunCertification = async () => {
    setIsCertifying(true);
    setSimProgress([]);
    const handleProgress = (msg: string) => {
      setSimProgress(prev => [...prev, msg]);
    };
    
    await DataSimulator.runCertificationChecks(handleProgress);
    setIsCertifying(false);
    toast.success('Certification Complete');
  };

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            System Environment
          </CardTitle>
          <CardDescription>Current execution environment details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.map((stat, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  {i === 2 ? <Cpu className="h-4 w-4" /> : i === 4 ? <HardDrive className="h-4 w-4" /> : <FileJson className="h-4 w-4" />}
                  {stat.label}
                </span>
                <span className="text-sm font-medium">{stat.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Database Statistics
          </CardTitle>
          <CardDescription>Total record counts across all primary tables</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {recordCounts.map((record, i) => (
              <div key={i} className="flex justify-between items-center p-2 bg-muted/30 rounded-md">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <ListOrdered className="h-3 w-3" />
                  {record.label}
                </span>
                <span className="text-sm font-mono font-bold">{record.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Beaker className="h-5 w-5 text-primary" />
          Enterprise QA & Data Simulation
        </CardTitle>
        <CardDescription>Generate stress-testing data and run production certification (Phase 11)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Data Simulator</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs">Customers to Generate</label>
                <Input type="number" value={simCustomers} onChange={e => setSimCustomers(e.target.value)} disabled={isSimulating} />
              </div>
              <div className="space-y-2">
                <label className="text-xs">Suppliers to Generate</label>
                <Input type="number" value={simSuppliers} onChange={e => setSimSuppliers(e.target.value)} disabled={isSimulating} />
              </div>
              <div className="space-y-2">
                <label className="text-xs">Purchases to Generate</label>
                <Input type="number" value={simPurchases} onChange={e => setSimPurchases(e.target.value)} disabled={isSimulating} />
              </div>
              <div className="space-y-2">
                <label className="text-xs">Sales to Generate</label>
                <Input type="number" value={simSales} onChange={e => setSimSales(e.target.value)} disabled={isSimulating} />
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-xs">Spread across past days</label>
                <Input type="number" value={simDays} onChange={e => setSimDays(e.target.value)} disabled={isSimulating} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleRunSimulation} disabled={isSimulating || isCertifying} className="w-full">
                {isSimulating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Run Stress Test Simulation
              </Button>
            </div>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Enterprise Certification</h3>
            <p className="text-sm text-muted-foreground">
              Runs deep reconciliation checks across Accounting and Inventory engines to ensure no data anomalies exist.
            </p>
            <Button variant="outline" onClick={handleRunCertification} disabled={isSimulating || isCertifying} className="w-full border-primary/20 hover:bg-primary/5 text-primary">
              {isCertifying ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Run Full QA Certification
            </Button>

            <div className="mt-4 p-3 bg-muted/30 rounded-md border h-[180px] overflow-y-auto text-xs font-mono">
              {simProgress.length === 0 ? (
                <span className="text-muted-foreground">Output console...</span>
              ) : (
                simProgress.map((msg, i) => <div key={i} className="mb-1">{msg}</div>)
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}