import { ArrowDownLeft, ArrowUpRight, BookOpen, FileText, Link as LinkIcon, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AccountingEngine } from '../../../lib/accounting/AccountingEngine';
import { isDebitNormalAccount } from '../../../lib/accounting/accountClassification';
import { FinancialReportService } from '../../../lib/reporting/FinancialReportService';
import { formatCurrency, formatDate, formatDateISO } from '../../../lib/utils';
import { useERPStore } from '../../../store/useERPStore';
import { LedgerStatement, ledgerBalanceSide, type LedgerStatementRow } from '../../ledger/LedgerStatement';
import { SearchableSelect } from '../../SearchableSelect';
import { VoucherDetailModal } from '../../VoucherDetailModal';
import { GenericReportTemplate } from '../common/GenericReportTemplate';

const STATEMENT_COLUMNS = [
  { header: 'Date', dataKey: 'date' },
  { header: 'Voucher', dataKey: 'referenceNo' },
  { header: 'Narration', dataKey: 'description' },
  { header: 'Debit (Dr)', dataKey: 'debit' },
  { header: 'Credit (Cr)', dataKey: 'credit' },
  { header: 'Balance', dataKey: 'balance' },
];

const REGISTER_COLUMNS = [
  { header: 'Date', dataKey: 'date' },
  { header: 'Voucher', dataKey: 'voucherNo' },
  { header: 'Account', dataKey: 'account' },
  { header: 'Party', dataKey: 'party' },
  { header: 'Narration', dataKey: 'description' },
  { header: 'Debit (Dr)', dataKey: 'debit' },
  { header: 'Credit (Cr)', dataKey: 'credit' },
];

export function GeneralLedgerReport() {
  const {
    accounts,
    journalEntries,
    vouchers,
    customers,
    suppliers,
    processors,
    accountSubtypes,
  } = useERPStore();

  const [dateRange, setDateRange] = useState({ start: '', end: '', label: 'This Month' });
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);

  const account = accounts.find(a => a.id === selectedAccountId);
  const dateFrom = dateRange.start ? formatDateISO(dateRange.start) : undefined;
  const dateTo = dateRange.end ? formatDateISO(dateRange.end) : undefined;

  // One account → a real statement with opening/running/closing balances.
  const ledger = useMemo(() => {
    if (!account) return null;
    return AccountingEngine.getLedger(
      account.id,
      accounts,
      journalEntries,
      vouchers,
      dateFrom,
      dateTo
    );
  }, [account, accounts, journalEntries, vouchers, dateFrom, dateTo]);

  // No account → the classic all-accounts register.
  const register = useMemo(() => {
    if (account) return [];
    return FinancialReportService.getGeneralLedger(dateRange, search);
  }, [account, dateRange, search, journalEntries, vouchers, accounts, customers, suppliers, processors]);

  const isDebitNormal = account ? isDebitNormalAccount(account) : true;

  const openVoucher = (voucherId?: string) => {
    if (voucherId) setSelectedVoucherId(voucherId);
  };

  const statementRows: LedgerStatementRow[] = useMemo(() => {
    if (!ledger) return [];
    const query = search.trim().toLowerCase();
    const source = query
      ? ledger.rows.filter(row => {
          const haystack = [
            row.voucher?.voucherNo,
            row.voucher?.type,
            row.narration,
            row.voucher?.narration,
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(query);
        })
      : ledger.rows;

    return source.map(row => ({
      id: row.id,
      date: row.voucher?.date || '',
      reference: row.voucher ? (
        <button
          type="button"
          onClick={() => openVoucher(row.voucher!.id)}
          className="inline-flex items-center gap-1.5 text-primary transition-colors hover:text-primary/80 hover:underline"
        >
          <LinkIcon className="h-3 w-3" aria-hidden="true" />
          {row.voucher.voucherNo}
        </button>
      ) : '—',
      description: row.narration || row.voucher?.narration || '—',
      badges: row.voucher?.type ? [{ label: row.voucher.type, tone: 'neutral' as const }] : [],
      debit: row.debit,
      credit: row.credit,
      balance: row.runningBalance,
    }));
  }, [ledger, search]);

  const registerRows: LedgerStatementRow[] = useMemo(
    () => register.map(entry => ({
      id: entry.id,
      date: entry.date,
      account: (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{entry.accountName || '—'}</div>
          <div className="truncate text-xs text-muted-foreground">
            {entry.accountCode}
            {entry.partyName && entry.partyName !== '-' ? ` · ${entry.partyName}` : ''}
          </div>
        </div>
      ),
      reference: (
        <button
          type="button"
          onClick={() => openVoucher(entry.voucherId)}
          className="inline-flex items-center gap-1.5 text-primary transition-colors hover:text-primary/80 hover:underline"
        >
          <LinkIcon className="h-3 w-3" aria-hidden="true" />
          {entry.voucherNo}
        </button>
      ),
      description: entry.description,
      badges: entry.voucherType ? [{ label: entry.voucherType, tone: 'neutral' as const }] : [],
      debit: entry.type === 'Debit' ? entry.amount : 0,
      credit: entry.type === 'Credit' ? entry.amount : 0,
    })),
    [register]
  );

  const totalDebit = account
    ? (ledger?.rows.reduce((sum, row) => sum + row.debit, 0) ?? 0)
    : registerRows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = account
    ? (ledger?.rows.reduce((sum, row) => sum + row.credit, 0) ?? 0)
    : registerRows.reduce((sum, row) => sum + row.credit, 0);

  const closingBalance = ledger
    ? (ledger.rows.length > 0
        ? ledger.rows[ledger.rows.length - 1].runningBalance
        : ledger.openingBalance)
    : 0;
  const showOpeningRow = !!ledger && (ledger.rows.length > 0 || Math.abs(ledger.openingBalance) > 0.005);

  const statementExportRows = useMemo<Record<string, any>[]>(() => {
    if (!ledger) return [];
    return [
      ...(showOpeningRow
        ? [{
            date: '',
            referenceNo: 'OPENING',
            description: 'Balance brought forward',
            debit: 0,
            credit: 0,
            balance: ledger.openingBalance,
          }]
        : []),
      ...ledger.rows.map(row => ({
        date: row.voucher?.date ? formatDate(row.voucher.date) : '-',
        referenceNo: row.voucher?.voucherNo || '-',
        description: row.narration || row.voucher?.narration || '-',
        debit: row.debit,
        credit: row.credit,
        balance: row.runningBalance,
      })),
    ];
  }, [ledger, showOpeningRow]);

  const registerExportRows = useMemo<Record<string, any>[]>(
    () => register.map(entry => ({
      date: entry.date ? formatDate(entry.date) : '-',
      voucherNo: entry.voucherNo,
      account: `${entry.accountCode} - ${entry.accountName}`.trim(),
      party: entry.partyName,
      description: entry.description,
      debit: entry.type === 'Debit' ? entry.amount : 0,
      credit: entry.type === 'Credit' ? entry.amount : 0,
    })),
    [register]
  );

  const kpis = account
    ? [
        { title: 'Opening Balance', value: `${formatCurrency(Math.abs(ledger?.openingBalance ?? 0))} ${ledgerBalanceSide(ledger?.openingBalance ?? 0, isDebitNormal)}`, icon: BookOpen },
        { title: 'Period Debit', value: formatCurrency(totalDebit), icon: ArrowDownLeft },
        { title: 'Period Credit', value: formatCurrency(totalCredit), icon: ArrowUpRight },
        { title: 'Closing Balance', value: `${formatCurrency(Math.abs(closingBalance))} ${ledgerBalanceSide(closingBalance, isDebitNormal)}`, icon: Scale },
      ]
    : [
        { title: 'Total Entries', value: register.length, icon: FileText },
        { title: 'Total Debit', value: formatCurrency(totalDebit), icon: ArrowDownLeft },
        { title: 'Total Credit', value: formatCurrency(totalCredit), icon: ArrowUpRight },
        { title: 'Net Movement', value: formatCurrency(totalDebit - totalCredit), icon: Scale },
      ];

  return (
    <>
      <GenericReportTemplate
        title={account ? `General Ledger — ${account.name}` : 'General Ledger'}
        data={account ? statementExportRows : registerExportRows}
        onDateRangeChange={setDateRange}
        onSearch={setSearch}
        kpis={kpis}
        columns={[]}
        customFilters={
          <div className="w-full sm:w-72">
            <SearchableSelect
              options={[
                {
                  id: '',
                  label: 'All Accounts',
                  secondaryLabel: 'Combined register',
                  searchValue: 'all accounts combined register',
                },
                ...accounts.map(a => {
                  let relatedParty = '';
                  if (a.linkedEntityId) {
                    const sup = suppliers?.find(s => s.id === a.linkedEntityId);
                    const cus = customers?.find(c => c.id === a.linkedEntityId);
                    const proc = processors?.find(p => p.id === a.linkedEntityId);
                    if (sup) relatedParty = `(Supplier: ${sup.name})`;
                    else if (cus) relatedParty = `(Customer: ${cus.name})`;
                    else if (proc) relatedParty = `(Processor: ${proc.name})`;
                  }
                  const subtype = accountSubtypes?.find(s => s.id === a.subtypeId)?.name || '';
                  return {
                    id: a.id,
                    label: `${a.code} - ${a.name}`,
                    secondaryLabel: `${a.type} ${subtype ? `• ${subtype}` : ''} ${relatedParty}`.trim(),
                    searchValue: `${a.type} ${subtype} ${relatedParty}`,
                  };
                }),
              ]}
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              placeholder="All accounts"
            />
          </div>
        }
        exportColumns={account ? STATEMENT_COLUMNS : REGISTER_COLUMNS}
        summaryRows={account
          ? [
              [{ description: 'TOTAL PERIOD ACTIVITY', debit: totalDebit, credit: totalCredit }],
              [{ description: 'CLOSING BALANCE', balance: closingBalance }],
            ]
          : [[{ description: 'TOTAL PERIOD ACTIVITY', debit: totalDebit, credit: totalCredit }]]}
        renderBody={
          <LedgerStatement
            rows={account ? statementRows : registerRows}
            openingBalance={showOpeningRow ? ledger?.openingBalance : undefined}
            closingBalance={account ? closingBalance : undefined}
            isDebitNormal={isDebitNormal}
            showBalance={!!account}
            emptyMessage={account
              ? 'No posted entries for this account in the selected period.'
              : 'No ledger entries match the selected filters.'}
          />
        }
      />
      {selectedVoucherId && (
        <VoucherDetailModal
          voucherId={selectedVoucherId}
          onClose={() => setSelectedVoucherId(null)}
        />
      )}
    </>
  );
}
