
import { AccountSummaryReport } from './AccountSummaryReport';
import { BalanceSheetReport } from './BalanceSheetReport';
import { BankBookReport } from './BankBookReport';
import { CashbookReport } from './CashbookReport';
import { CashFlowReport } from './CashFlowReport';
import { ExpenseAnalysis } from './ExpenseAnalysis';
import { GeneralLedgerReport } from './GeneralLedgerReport';
import { JournalRegisterReport } from './JournalRegisterReport';
import { PayableAgingReport } from './PayableAgingReport';
import { ProfitLossReport } from './ProfitLossReport';
import { ReceivableAgingReport } from './ReceivableAgingReport';
import { RevenueAnalysis } from './RevenueAnalysis';
import { TrialBalanceReport } from './TrialBalanceReport';
import { VoucherRegisterReport } from './VoucherRegisterReport';

export function FinancialReports({ activeReport }: { activeReport: string }) {
  switch (activeReport) {
    case 'general-ledger': return <GeneralLedgerReport />;
    case 'cashbook': return <CashbookReport />;
    case 'bank-book': return <BankBookReport />;
    case 'trial-balance': return <TrialBalanceReport />;
    case 'profit-loss': return <ProfitLossReport />;
    case 'balance-sheet': return <BalanceSheetReport />;
    case 'cash-flow': return <CashFlowReport />;
    case 'journal-register': return <JournalRegisterReport />;
    case 'voucher-register': return <VoucherRegisterReport />;
    case 'account-summary': return <AccountSummaryReport />;
    case 'receivable-aging': return <ReceivableAgingReport />;
    case 'payable-aging': return <PayableAgingReport />;
    case 'expense-analysis': return <ExpenseAnalysis />;
    case 'revenue-analysis': return <RevenueAnalysis />;
    default: return null;
  }
}
