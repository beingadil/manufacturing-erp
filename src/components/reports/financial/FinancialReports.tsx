
import { GeneralLedgerReport } from './GeneralLedgerReport';
import { CashbookReport } from './CashbookReport';
import { BankBookReport } from './BankBookReport';
import { TrialBalanceReport } from './TrialBalanceReport';
import { ProfitLossReport } from './ProfitLossReport';
import { BalanceSheetReport } from './BalanceSheetReport';
import { CashFlowReport } from './CashFlowReport';
import { JournalRegisterReport } from './JournalRegisterReport';
import { VoucherRegisterReport } from './VoucherRegisterReport';
import { AccountSummaryReport } from './AccountSummaryReport';
import { ReceivableAgingReport } from './ReceivableAgingReport';
import { PayableAgingReport } from './PayableAgingReport';
import { ExpenseAnalysis } from './ExpenseAnalysis';
import { RevenueAnalysis } from './RevenueAnalysis';

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
