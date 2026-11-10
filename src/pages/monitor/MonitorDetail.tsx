import {
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type Column } from '../../components/DataTable';
import { VoucherDetailModal } from '../../components/VoucherDetailModal';
import { generateEnterpriseDocument } from '../../lib/pdfEngine';
import { exportToCSV } from '../../lib/exportUtils';
import {
  InventoryCalculationService,
} from '../../lib/business/InventoryCalculationService';
import { cn, formatCurrency, formatNumber } from '../../lib/utils';
import { useERPStore } from '../../store/useERPStore';
import { inRange } from '../../lib/monitor/monitorRange';
import type { MonitorRange } from '../../lib/monitor/monitorRange';
import {
  deltaFraction,
  purchaseTotal,
  saleTotal,
  sumInRange,
} from '../../lib/monitor/monitorMetrics';


/* ────────────────────────────────────────────── helpers ─────────────────── */

const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`);

function ExportButtons({ title, columns, rows }: {
  title: string;
  columns: { header: string; dataKey: string; align?: 'left' | 'right' }[];
  rows: Record<string, unknown>[];
}) {
  const filename = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => exportToCSV({ filename: `${filename}.csv`, data: rows, columns: columns.map(c => ({ header: c.header, dataKey: c.dataKey })) })}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        CSV
      </button>
      <button
        onClick={() => generateEnterpriseDocument({
          title,
          filters: [{ label: 'Date Range', value: 'as filtered' }],
          tables: [{ columns: columns.map(c => ({ header: c.header, dataKey: c.dataKey, align: c.align ?? 'left' })), rows }],
        })}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <FileText className="h-3.5 w-3.5" /> PDF
      </button>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const good = delta >= 0;
  return (
    <span className={cn('text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md', good ? 'text-success bg-success/10' : 'text-destructive bg-destructive/10')}>
      {pct(delta)}
    </span>
  );
}

function StatStrip({ items }: { items: React.ReactNode[] }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-border bg-card px-6 py-4 shadow-sm">
      {items}
    </div>
  );
}

function Stat({ label, value, hint, tone, delta }: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'foreground' | 'success' | 'destructive';
  delta?: number | null;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        'mt-1 flex items-baseline gap-2 text-2xl font-bold tracking-tight tabular-nums',
        tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : 'text-foreground',
      )}>
        {value}
        {delta !== undefined && <DeltaChip delta={delta} />}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* ────────────────────────────────────────── revenue detail ───────────────── */

export function RevenueDetail({ range }: { range: MonitorRange }) {
  const { sales, customers, products } = useERPStore();

  const rows = useMemo(() => sales
    .filter(s => inRange(s.date, range.from, range.to))
    .map(s => ({
      id: s.id,
      date: s.date,
      invoiceNo: s.invoiceNo,
      customerName: customers.find(c => c.id === s.customerId)?.name ?? 'Unknown',
      productName: products.find(p => p.id === s.productId)?.name ?? 'Unknown',
      pcs: s.pcsSold,
      amount: s.totalAmount,
    })),
    [sales, customers, products, range.from, range.to]);

  const cur = sumInRange(sales, saleTotal, range.from, range.to);
  const prior = sumInRange(sales, saleTotal, range.prior.from, range.prior.to);

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'date', label: 'Date', sortable: true, render: r => <span className="text-muted-foreground">{new Date(r.date).toLocaleDateString()}</span> },
    { key: 'invoiceNo', label: 'Invoice', sortable: true, render: r => <span className="font-mono text-xs font-semibold">{r.invoiceNo}</span> },
    { key: 'customerName', label: 'Customer', sortable: true },
    { key: 'productName', label: 'Product', sortable: true },
    { key: 'pcs', label: 'PCS', align: 'right', sortable: true, render: r => <span className="tabular-nums font-medium">{formatNumber(r.pcs)}</span> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: r => <span className="tabular-nums font-semibold text-success">{formatCurrency(r.amount)}</span> },
  ];

  return (
    <>
      <StatStrip items={[
        <Stat label="Revenue in range" value={formatCurrency(cur)} tone="success" delta={deltaFraction(cur, prior)} hint={`${range.label} · ${rows.length} sales`} />,
        <Stat label="Avg sale" value={formatCurrency(rows.length ? cur / rows.length : 0)} hint="Per invoice" />,
        <Stat label="Prior window" value={formatCurrency(prior)} hint={`${range.prior.from} → ${range.prior.to}`} />,
      ]} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Sales in range</h2>
        <ExportButtons title="Revenue" columns={[
          { header: 'Date', dataKey: 'date' }, { header: 'Invoice', dataKey: 'invoiceNo' },
          { header: 'Customer', dataKey: 'customerName' }, { header: 'Product', dataKey: 'productName' },
          { header: 'PCS', dataKey: 'pcs', align: 'right' }, { header: 'Amount', dataKey: 'amount', align: 'right' },
        ]} rows={rows as unknown as Record<string, unknown>[]} />
      </div>
      <DataTable data={rows} columns={columns} searchKeys={['invoiceNo', 'customerName', 'productName']} searchPlaceholder="Search sales…" persistKey="monitor-revenue" defaultSortKey="date" defaultSortDirection="desc" density="compact" />
    </>
  );
}

/* ──────────────────────────────────────── purchases detail ──────────────── */

export function PurchasesDetail({ range }: { range: MonitorRange }) {
  const { purchases, suppliers, materials } = useERPStore();

  const rows = useMemo(() => purchases
    .filter(p => inRange(p.date, range.from, range.to))
    .map(p => ({
      id: p.id,
      date: p.date,
      purchaseNo: p.purchaseNo,
      supplierName: suppliers.find(s => s.id === p.supplierId)?.name ?? 'Unknown',
      materialName: materials.find(m => m.id === p.materialId)?.name ?? 'Unknown',
      amount: purchaseTotal(p),
      pcs: p.calculatedPcs,
    })),
    [purchases, suppliers, materials, range.from, range.to]);

  const cur = sumInRange(purchases, purchaseTotal, range.from, range.to);
  const prior = sumInRange(purchases, purchaseTotal, range.prior.from, range.prior.to);

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'date', label: 'Date', sortable: true, render: r => <span className="text-muted-foreground">{new Date(r.date).toLocaleDateString()}</span> },
    { key: 'purchaseNo', label: 'PO No', sortable: true, render: r => <span className="font-mono text-xs font-semibold">{r.purchaseNo}</span> },
    { key: 'supplierName', label: 'Supplier', sortable: true },
    { key: 'materialName', label: 'Material', sortable: true },
    { key: 'pcs', label: 'PCS', align: 'right', sortable: true, render: r => <span className="tabular-nums font-medium">{formatNumber(r.pcs ?? 0)}</span> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: r => <span className="tabular-nums font-semibold text-destructive">{formatCurrency(r.amount)}</span> },
  ];

  return (
    <>
      <StatStrip items={[
        <Stat label="Purchases in range" value={formatCurrency(cur)} tone="destructive" delta={deltaFraction(cur, prior)} hint={`${range.label} · ${rows.length} purchases`} />,
        <Stat label="Avg purchase" value={formatCurrency(rows.length ? cur / rows.length : 0)} hint="Per purchase" />,
        <Stat label="Prior window" value={formatCurrency(prior)} hint={`${range.prior.from} → ${range.prior.to}`} />,
      ]} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Purchases in range</h2>
        <ExportButtons title="Purchases" columns={[
          { header: 'Date', dataKey: 'date' }, { header: 'PO No', dataKey: 'purchaseNo' },
          { header: 'Supplier', dataKey: 'supplierName' }, { header: 'Material', dataKey: 'materialName' },
          { header: 'PCS', dataKey: 'pcs', align: 'right' }, { header: 'Amount', dataKey: 'amount', align: 'right' },
        ]} rows={rows as unknown as Record<string, unknown>[]} />
      </div>
      <DataTable data={rows} columns={columns} searchKeys={['purchaseNo', 'supplierName', 'materialName']} searchPlaceholder="Search purchases…" persistKey="monitor-purchases" defaultSortKey="date" defaultSortDirection="desc" density="compact" />
    </>
  );
}

/* ────────────────────────────────────────────── stock detail ───────────── */

export function StockDetail(_: { range: MonitorRange }) {
  const { materials, batches } = useERPStore();

  const rows = useMemo(() => materials.map(m => {
    const stages = InventoryCalculationService.getMaterialStageValues(m.id, batches || []);
    const onHand = stages.raw.pcs + stages.atProcessor.pcs + stages.finished.pcs;
    return {
      id: m.id,
      name: m.name,
      code: m.code ?? '—',
      rawPcs: stages.raw.pcs,
      wipPcs: stages.atProcessor.pcs,
      finishedPcs: stages.finished.pcs,
      onHand,
      value: stages.raw.value + stages.atProcessor.value + stages.finished.value,
      minStockLevel: m.minStockLevel ?? 0,
      low: (m.minStockLevel ?? 0) > 0 && stages.raw.pcs < (m.minStockLevel ?? 0),
    };
  }), [materials, batches]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalPcs = rows.reduce((s, r) => s + r.onHand, 0);
  const lowCount = rows.filter(r => r.low).length;

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'name', label: 'Material', sortable: true, render: r => <Link to={`/materials/${r.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{r.name}</Link> },
    { key: 'code', label: 'No.', sortable: true, render: r => <span className="font-mono text-xs text-muted-foreground">{r.code}</span> },
    { key: 'rawPcs', label: 'Raw', align: 'right', sortable: true, render: r => <span className="tabular-nums">{formatNumber(r.rawPcs)}</span> },
    { key: 'wipPcs', label: 'WIP', align: 'right', sortable: true, render: r => <span className={cn('tabular-nums', r.wipPcs > 0 && 'text-amber-600 font-medium')}>{formatNumber(r.wipPcs)}</span> },
    { key: 'finishedPcs', label: 'Finished', align: 'right', sortable: true, render: r => <span className="tabular-nums text-success">{formatNumber(r.finishedPcs)}</span> },
    { key: 'onHand', label: 'On hand', align: 'right', sortable: true, render: r => <span className="tabular-nums font-semibold">{formatNumber(r.onHand)}</span> },
    { key: 'value', label: 'Value', align: 'right', sortable: true, render: r => <span className="tabular-nums font-medium">{formatCurrency(r.value)}</span> },
    { key: 'minStockLevel', label: 'Min', align: 'right', sortable: true, render: r => <span className="tabular-nums text-muted-foreground">{formatNumber(r.minStockLevel)}</span> },
    { key: 'low', label: 'Status', render: r => r.low ? <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive"><AlertTriangle className="h-3 w-3" />Low</span> : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">OK</span> },
  ];

  return (
    <>
      <StatStrip items={[
        <Stat label="Stock value (all stages)" value={formatCurrency(totalValue)} hint="At purchase cost, incl. WIP" />,
        <Stat label="PCS on hand" value={formatNumber(totalPcs)} hint={`${rows.length} materials`} />,
        <Stat label="Below min" value={formatNumber(lowCount)} tone={lowCount > 0 ? 'destructive' : 'success'} hint="Raw stock below min level" />,
      ]} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Stock by material</h2>
        <ExportButtons title="Stock" columns={[
          { header: 'Material', dataKey: 'name' }, { header: 'No', dataKey: 'code' },
          { header: 'Raw', dataKey: 'rawPcs', align: 'right' }, { header: 'WIP', dataKey: 'wipPcs', align: 'right' },
          { header: 'Finished', dataKey: 'finishedPcs', align: 'right' }, { header: 'On hand', dataKey: 'onHand', align: 'right' },
          { header: 'Value', dataKey: 'value', align: 'right' },
        ]} rows={rows as unknown as Record<string, unknown>[]} />
      </div>
      <DataTable data={rows} columns={columns} searchKeys={['name', 'code']} searchPlaceholder="Search materials…" persistKey="monitor-stock" defaultSortKey="value" defaultSortDirection="desc" density="compact" />
    </>
  );
}

/* ────────────────────────────────────────────── wip detail ─────────────── */

export function WipDetail({ range }: { range: MonitorRange }) {
  const { processingSends, processors } = useERPStore();

  const sendsInRange = useMemo(
    () => processingSends.filter(s => inRange(s.date, range.from, range.to)),
    [processingSends, range.from, range.to],
  );

  // Holdings per processor — point-in-time, from the full processing trail
  // (sent − received − loss), independent of the chosen date range.
  const holdings = useMemo(() => processors.map(p => {
    const mine = processingSends.filter(s => s.processorId === p.id);
    const sent = mine.reduce((sum, s) => sum + (s.pcsSent || 0), 0);
    const recv = mine.reduce((sum, s) => sum + (s.pcsReceived || 0), 0);
    const loss = mine.reduce((sum, s) => sum + (s.lossQuantity || 0), 0);
    const rangeSends = mine.filter(s => inRange(s.date, range.from, range.to));
    return {
      id: p.id,
      name: p.name,
      dispatchedInRange: rangeSends.length,
      holding: Math.max(0, sent - recv - loss),
      balance: p.balancePayable || 0,
    };
  }), [processors, processingSends, range.from, range.to]);

  const totalHolding = holdings.reduce((s, h) => s + h.holding, 0);

  const columns: Column<(typeof holdings)[number]>[] = [
    { key: 'name', label: 'Processor', sortable: true, render: r => <Link to={`/ledgers?id=${r.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{r.name}</Link> },
    { key: 'dispatchedInRange', label: 'Dispatched in range', align: 'right', sortable: true, render: r => <span className="tabular-nums">{r.dispatchedInRange}</span> },
    { key: 'holding', label: 'Holding (PCS)', align: 'right', sortable: true, render: r => <span className={cn('tabular-nums font-semibold', r.holding > 5000 ? 'text-warning' : 'text-foreground')}>{formatNumber(r.holding)}</span> },
    { key: 'balance', label: 'A/P balance', align: 'right', sortable: true, render: r => <span className="tabular-nums text-destructive">{formatCurrency(r.balance)}</span> },
  ];

  return (
    <>
      <StatStrip items={[
        <Stat label="Holding at processors" value={formatNumber(totalHolding)} hint="Point-in-time, full trail" />,
        <Stat label="Dispatches in range" value={String(sendsInRange.length)} hint={range.label} />,
        <Stat label="Processors with holdings" value={String(holdings.filter(h => h.holding > 0).length)} hint="Across active processors" />,
      ]} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Processor holdings</h2>
        <ExportButtons title="WIP" columns={[
          { header: 'Processor', dataKey: 'name' },
          { header: 'Holding', dataKey: 'holding', align: 'right' },
          { header: 'A/P', dataKey: 'balance', align: 'right' },
        ]} rows={holdings as unknown as Record<string, unknown>[]} />
      </div>
      <DataTable data={holdings} columns={columns} searchKeys={['name']} searchPlaceholder="Search processors…" persistKey="monitor-wip" defaultSortKey="holding" defaultSortDirection="desc" density="compact" />
    </>
  );
}

/* ────────────────────────────────────────────── a/r detail ─────────────── */

export function ArDetail({ range }: { range: MonitorRange }) {
  const { customers, sales } = useERPStore();

  const rows = useMemo(() => customers
    .filter(c => (c.balanceReceivable || 0) > 0)
    .map(c => {
      const salesInRange = sales.filter(s => s.customerId === c.id && inRange(s.date, range.from, range.to));
      return {
        id: c.id,
        name: c.name,
        code: c.code ?? '—',
        balance: c.balanceReceivable || 0,
        salesInRange: salesInRange.length,
        amountInRange: salesInRange.reduce((s, x) => s + (x.totalAmount || 0), 0),
      };
    })
    .sort((a, b) => b.balance - a.balance),
    [customers, sales, range.from, range.to]);

  const total = rows.reduce((s, r) => s + r.balance, 0);
  const inRangeTotal = rows.reduce((s, r) => s + r.amountInRange, 0);

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'name', label: 'Customer', sortable: true, render: r => <Link to={`/ledgers?id=${r.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{r.name}</Link> },
    { key: 'code', label: 'Code', sortable: true, render: r => <span className="font-mono text-xs text-muted-foreground">{r.code}</span> },
    { key: 'salesInRange', label: 'Sales in range', align: 'right', sortable: true, render: r => <span className="tabular-nums">{r.salesInRange}</span> },
    { key: 'amountInRange', label: 'Billed in range', align: 'right', sortable: true, render: r => <span className="tabular-nums text-success">{formatCurrency(r.amountInRange)}</span> },
    { key: 'balance', label: 'Balance', align: 'right', sortable: true, render: r => <span className="tabular-nums font-semibold text-destructive">{formatCurrency(r.balance)}</span> },
  ];

  return (
    <>
      <StatStrip items={[
        <Stat label="Total receivable" value={formatCurrency(total)} tone="destructive" hint={`${rows.length} customers with balance`} />,
        <Stat label="Billed in range" value={formatCurrency(inRangeTotal)} tone="success" hint={`${range.label}`} />,
      ]} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Customers with balance</h2>
        <ExportButtons title="Accounts_Receivable" columns={[
          { header: 'Customer', dataKey: 'name' }, { header: 'Code', dataKey: 'code' },
          { header: 'Sales in range', dataKey: 'salesInRange', align: 'right' },
          { header: 'Billed in range', dataKey: 'amountInRange', align: 'right' },
          { header: 'Balance', dataKey: 'balance', align: 'right' },
        ]} rows={rows as unknown as Record<string, unknown>[]} />
      </div>
      <DataTable data={rows} columns={columns} searchKeys={['name', 'code']} searchPlaceholder="Search customers…" persistKey="monitor-ar" defaultSortKey="balance" defaultSortDirection="desc" density="compact" />
    </>
  );
}

/* ────────────────────────────────────────────── a/p detail ─────────────── */

export function ApDetail({ range }: { range: MonitorRange }) {
  const { suppliers, processors, purchases, processingReceipts } = useERPStore();

  const rows = useMemo(() => {
    const supplierRows = suppliers
      .filter(s => (s.balancePayable || 0) > 0)
      .map(s => {
        const myPurchases = purchases.filter(p => p.supplierId === s.id && inRange(p.date, range.from, range.to));
        return {
          id: `s-${s.id}`,
          kind: 'Supplier' as const,
          name: s.name,
          code: s.code ?? '—',
          balance: s.balancePayable || 0,
          countInRange: myPurchases.length,
          amountInRange: myPurchases.reduce((sum, p) => sum + purchaseTotal(p), 0),
        };
      });
    const processorRows = processors
      .filter(p => (p.balancePayable || 0) > 0)
      .map(p => {
        const myReceipts = processingReceipts.filter(r => r.processorId === p.id && inRange(r.date, range.from, range.to));
        return {
          id: `p-${p.id}`,
          kind: 'Processor' as const,
          name: p.name,
          code: p.code ?? '—',
          balance: p.balancePayable || 0,
          countInRange: myReceipts.length,
          amountInRange: myReceipts.reduce((sum, r) => sum + (r.billAmount || 0), 0),
        };
      });
    return [...supplierRows, ...processorRows].sort((a, b) => b.balance - a.balance);
  }, [suppliers, processors, purchases, processingReceipts, range.from, range.to]);

  const total = rows.reduce((s, r) => s + r.balance, 0);
  const inRangeTotal = rows.reduce((s, r) => s + r.amountInRange, 0);

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'kind', label: 'Type', sortable: true, render: r => <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{r.kind}</span> },
    { key: 'name', label: 'Name', sortable: true, render: r => <Link to={`/ledgers?id=${r.id.replace(/^[sp]-/, '')}`} className="font-medium text-foreground hover:text-primary hover:underline">{r.name}</Link> },
    { key: 'countInRange', label: 'In range', align: 'right', sortable: true, render: r => <span className="tabular-nums">{r.countInRange}</span> },
    { key: 'amountInRange', label: 'Amount in range', align: 'right', sortable: true, render: r => <span className="tabular-nums">{formatCurrency(r.amountInRange)}</span> },
    { key: 'balance', label: 'Balance', align: 'right', sortable: true, render: r => <span className="tabular-nums font-semibold text-destructive">{formatCurrency(r.balance)}</span> },
  ];

  return (
    <>
      <StatStrip items={[
        <Stat label="Total payable" value={formatCurrency(total)} tone="destructive" hint={`${rows.length} parties (suppliers + processors)`} />,
        <Stat label="Amount in range" value={formatCurrency(inRangeTotal)} hint={`${range.label}`} />,
      ]} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Payables parties</h2>
        <ExportButtons title="Accounts_Payable" columns={[
          { header: 'Type', dataKey: 'kind' }, { header: 'Name', dataKey: 'name' },
          { header: 'Amount in range', dataKey: 'amountInRange', align: 'right' },
          { header: 'Balance', dataKey: 'balance', align: 'right' },
        ]} rows={rows as unknown as Record<string, unknown>[]} />
      </div>
      <DataTable data={rows} columns={columns} searchKeys={['name', 'code']} searchPlaceholder="Search parties…" persistKey="monitor-ap" defaultSortKey="balance" defaultSortDirection="desc" density="compact" />
    </>
  );
}

/* ────────────────────────────────────────── activity detail ────────────── */

export function ActivityDetail({ range }: { range: MonitorRange }) {
  const { vouchers, journalEntries, accounts } = useERPStore();
  const [moduleFilter, setModuleFilter] = useState<'' | string>('');
  const [viewVoucherId, setViewVoucherId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const postedInRange = vouchers.filter(v => v.status === 'Posted' && inRange(v.date, range.from, range.to));
    return postedInRange
      .filter(v => !moduleFilter || v.sourceModule === moduleFilter)
      .map(v => {
        const debit = journalEntries.filter(je => je.voucherId === v.id).reduce((s, je) => s + (je.debit || 0), 0);
        const credit = journalEntries.filter(je => je.voucherId === v.id).reduce((s, je) => s + (je.credit || 0), 0);
        return {
          id: v.id,
          date: v.date,
          voucherNo: v.voucherNo,
          type: v.type,
          module: v.sourceModule,
          narration: v.narration || '—',
          debit,
          credit,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.voucherNo.localeCompare(a.voucherNo));
  }, [vouchers, journalEntries, accounts, range.from, range.to, moduleFilter]);

  const moduleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vouchers.filter(v => v.status === 'Posted' && inRange(v.date, range.from, range.to))) {
      counts.set(v.sourceModule, (counts.get(v.sourceModule) || 0) + 1);
    }
    return counts;
  }, [vouchers, range.from, range.to]);

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'date', label: 'Date', sortable: true, render: r => <span className="text-muted-foreground">{new Date(r.date).toLocaleDateString()}</span> },
    { key: 'voucherNo', label: 'Voucher No', sortable: true, render: r => <button className="font-mono text-xs font-semibold text-primary hover:underline" onClick={() => setViewVoucherId(r.id)}>{r.voucherNo}</button> },
    { key: 'type', label: 'Type', sortable: true },
    { key: 'module', label: 'Module', sortable: true, render: r => <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{r.module}</span> },
    { key: 'narration', label: 'Narration', render: r => <span className="text-muted-foreground">{r.narration}</span> },
    { key: 'debit', label: 'Debit', align: 'right', sortable: true, render: r => <span className="tabular-nums text-success font-medium">{r.debit > 0 ? formatCurrency(r.debit) : ''}</span> },
    { key: 'credit', label: 'Credit', align: 'right', sortable: true, render: r => <span className="tabular-nums text-destructive font-medium">{r.credit > 0 ? formatCurrency(r.credit) : ''}</span> },
  ];

  const modules = ['Purchase', 'Sales', 'Processing', 'Cashbook', 'Manual', 'Manufacturing', 'Inventory Adjustment'];

  return (
    <>
      <StatStrip items={[
        <Stat label="Vouchers in range" value={String(rows.length)} hint={range.label} />,
        <Stat label="Total posted" value={String([...moduleCounts.values()].reduce((s, n) => s + n, 0))} hint="Across all modules" />,
      ]} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setModuleFilter('')}
            className={cn('h-9 rounded-lg border px-3 text-xs font-medium transition-colors', !moduleFilter ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted')}
          >
            All <span className="ml-1 tabular-nums">{[...moduleCounts.values()].reduce((s, n) => s + n, 0)}</span>
          </button>
          {modules.map(m => (
            <button
              key={m}
              onClick={() => setModuleFilter(m)}
              className={cn('h-9 rounded-lg border px-3 text-xs font-medium transition-colors', moduleFilter === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted')}
            >
              {m} <span className="ml-1 tabular-nums">{moduleCounts.get(m) ?? 0}</span>
            </button>
          ))}
        </div>
        <ExportButtons title="Posting_Activity" columns={[
          { header: 'Date', dataKey: 'date' }, { header: 'Voucher No', dataKey: 'voucherNo' },
          { header: 'Type', dataKey: 'type' }, { header: 'Module', dataKey: 'module' },
          { header: 'Narration', dataKey: 'narration' }, { header: 'Debit', dataKey: 'debit', align: 'right' }, { header: 'Credit', dataKey: 'credit', align: 'right' },
        ]} rows={rows as unknown as Record<string, unknown>[]} />
      </div>
      <DataTable data={rows} columns={columns} searchKeys={['voucherNo', 'narration', 'type']} searchPlaceholder="Search vouchers…" persistKey="monitor-activity" defaultSortKey="date" defaultSortDirection="desc" density="compact" />
      {viewVoucherId && <VoucherDetailModal voucherId={viewVoucherId} onClose={() => setViewVoucherId(null)} />}
    </>
  );
}

/* ────────────────────────────────────────── rankings detail ───────────── */

export function RankingsDetail({ range }: { range: MonitorRange }) {
  const { sales, purchases, customers, suppliers, products } = useERPStore();

  const productRows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; revenue: number; pcs: number }>();
    for (const s of sales.filter(s => inRange(s.date, range.from, range.to))) {
      const entry = map.get(s.productId) ?? { id: s.productId, name: products.find(p => p.id === s.productId)?.name ?? 'Unknown', revenue: 0, pcs: 0 };
      entry.revenue += s.totalAmount || 0;
      entry.pcs += s.pcsSold || 0;
      map.set(s.productId, entry);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [sales, products, range.from, range.to]);

  const customerRows = useMemo(() =>
    [...customers]
      .filter(c => (c.balanceReceivable || 0) > 0)
      .map(c => ({ id: c.id, name: c.name, balance: c.balanceReceivable || 0 }))
      .sort((a, b) => b.balance - a.balance),
    [customers]);

  const supplierRows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; amount: number }>();
    for (const p of purchases.filter(p => inRange(p.date, range.from, range.to))) {
      const entry = map.get(p.supplierId) ?? { id: p.supplierId, name: suppliers.find(s => s.id === p.supplierId)?.name ?? 'Unknown', amount: 0 };
      entry.amount += purchaseTotal(p);
      map.set(p.supplierId, entry);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [purchases, suppliers, range.from, range.to]);

  const table = (title: string, rows: { id: string; name: string; value: number; extra?: string }[], valueLabel: string, hrefFor?: (id: string) => string, format: (n: number) => string = formatCurrency) => (
    <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border/50 bg-muted/20 px-5 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{rows.length} rows</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">No data in this range.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">#</th>
              <th className="px-5 py-2.5 text-left font-medium">Name</th>
              <th className="px-5 py-2.5 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.slice(0, 25).map((r, i) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-5 py-2.5">
                  {hrefFor ? <Link to={hrefFor(r.id)} className="font-medium text-foreground hover:text-primary hover:underline">{r.name}</Link> : <span className="font-medium text-foreground">{r.name}</span>}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{format(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div>{table('Products by revenue', productRows.map(r => ({ id: r.id, name: r.name, value: r.revenue, extra: `${formatNumber(r.pcs)} pcs` })), 'Revenue', undefined)}</div>
      <div>{table('Customers by A/R', customerRows.map(r => ({ id: r.id, name: r.name, value: r.balance })), 'Balance', (id) => `/ledgers?id=${id}`)}</div>
      <div>{table('Suppliers by purchase', supplierRows.map(r => ({ id: r.id, name: r.name, value: r.amount })), 'Purchased', undefined)}</div>
    </div>
  );
}
