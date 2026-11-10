import { ArrowLeft } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { MonitorDetailShell } from './MonitorDetailShell';
import {
  ArDetail,
  ApDetail,
  ActivityDetail,
  RankingsDetail,
  RevenueDetail,
  PurchasesDetail,
  StockDetail,
  WipDetail,
} from './MonitorDetail';

const METRICS: Record<string, {
  title: string;
  subtitle: string;
  Component: (props: { range: import('../../lib/monitor/monitorRange').MonitorRange }) => React.JSX.Element;
}> = {
  revenue: { title: 'Revenue', subtitle: 'Every sale in the selected window', Component: RevenueDetail },
  purchases: { title: 'Purchases', subtitle: 'Every purchase in the selected window', Component: PurchasesDetail },
  stock: { title: 'Stock', subtitle: 'Where every piece of raw material physically sits', Component: StockDetail },
  wip: { title: 'WIP & processors', subtitle: 'What is out with processors right now', Component: WipDetail },
  ar: { title: 'Accounts receivable', subtitle: 'Customers who owe you money', Component: ArDetail },
  ap: { title: 'Accounts payable', subtitle: 'Suppliers and processors you owe', Component: ApDetail },
  activity: { title: 'Posting activity', subtitle: 'Vouchers posted in the selected window', Component: ActivityDetail },
  rankings: { title: 'Rankings', subtitle: 'Top products, customers and suppliers', Component: RankingsDetail },
};

export function MonitorMetric() {
  const { metric } = useParams<{ metric: string }>();
  const def = metric ? METRICS[metric] : undefined;

  if (!def) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8">
        <p className="text-lg font-semibold text-foreground">Unknown monitor page</p>
        <Link to="/monitor" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground underline">
          <ArrowLeft className="h-4 w-4" /> Back to Business Monitor
        </Link>
      </div>
    );
  }

  const { title, subtitle, Component } = def;
  return (
    <MonitorDetailShell title={title} subtitle={subtitle}>
      {(range) => <Component range={range} />}
    </MonitorDetailShell>
  );
}
