
import { PendingPCSReport } from './PendingPCSReport';
import { PendingProcessingReport } from './PendingProcessingReport';
import { ProcessingChargesReport } from './ProcessingChargesReport';
import { ProcessingDispatchReport } from './ProcessingDispatchReport';
import { ProcessingEfficiency } from './ProcessingEfficiency';
import { ProcessingLossReport } from './ProcessingLossReport';
import { ProcessingReceiveReport } from './ProcessingReceiveReport';
import { ProcessorBillingReport } from './ProcessorBillingReport';
import { ProcessorLedgerReport } from './ProcessorLedgerReport';
import { ProcessorPerformance } from './ProcessorPerformance';

export function ProcessingReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'processing-dispatch': return <ProcessingDispatchReport />;
    case 'processing-receive': return <ProcessingReceiveReport />;
    case 'pending-processing': return <PendingProcessingReport />;
    case 'processor-billing': return <ProcessorBillingReport />;
    case 'processor-ledger': return <ProcessorLedgerReport />;
    case 'processing-charges': return <ProcessingChargesReport />;
    case 'processing-efficiency': return <ProcessingEfficiency />;
    case 'processing-loss': return <ProcessingLossReport />;
    case 'processor-performance': return <ProcessorPerformance />;
    case 'pending-pcs': return <PendingPCSReport />;
    default: return null;
  }
}
