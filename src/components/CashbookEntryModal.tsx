import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { ErrorManagement } from '../lib/validation';
import { AccountingService } from '../services/AccountingService';
import { useERPStore } from '../store/useERPStore';
import { SearchableSelect } from './SearchableSelect';
import { cn } from '../lib/utils';
import { AddAccountModal } from './AddAccountModal';
import { AccountType } from '../types/erp';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  defaultAccountId?: string;
  editVoucherId?: string;
}

export function CashbookEntryModal({ isOpen, onClose, onSave, defaultAccountId, editVoucherId }: Props) {
  const { accounts, suppliers, customers, processors, accountSubtypes } = useERPStore();
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryType, setEntryType] = useState<'Payment' | 'Receipt' | 'Contra' | 'Journal'>('Payment');
  const [cashAccountId, setCashAccountId] = useState(defaultAccountId || '');
  const [counterpartyType, setCounterpartyType] = useState<'supplier' | 'customer' | 'processor' | 'expense' | 'income' | 'cash' | 'account'>('supplier');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [narration, setNarration] = useState('');

  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addAccountTypeFilter, setAddAccountTypeFilter] = useState<{type?: AccountType, subtypeName?: string} | undefined>();

  // Reset counterparty type when entry type changes (for new entries)
  useEffect(() => {
    if (editVoucherId) return; // Don't override when editing
    if (entryType === 'Payment') setCounterpartyType('supplier');
    else if (entryType === 'Receipt') setCounterpartyType('customer');
    else if (entryType === 'Contra') setCounterpartyType('cash');
    else setCounterpartyType('account');
    setCounterpartyId('');
  }, [entryType, editVoucherId]);

  // Pre-fill form when editing an existing voucher
  useEffect(() => {
    if (!isOpen) return;
    if (editVoucherId) {
      const v = useERPStore.getState().vouchers.find(v => v.id === editVoucherId);
      const jes = useERPStore.getState().journalEntries.filter(je => je.voucherId === editVoucherId);
      if (v) {
        setDate(v.date);
        setReferenceNo(v.referenceNo || '');
        setNarration(v.narration || '');

        // Determine entry type from voucher type
        if (v.type === 'Cash Receipt' || v.type === 'Bank Receipt' || v.type === 'Receipt Voucher') setEntryType('Receipt');
        else if (v.type === 'Cash Payment' || v.type === 'Bank Payment' || v.type === 'Payment Voucher') setEntryType('Payment');
        else if (v.type === 'Contra Voucher') setEntryType('Contra');
        else setEntryType('Journal');

        // Map credit/debit entries to cash account + counterparty
        const creditEntry = jes.find(je => je.credit > 0);
        const debitEntry = jes.find(je => je.debit > 0);
        
        if (creditEntry && debitEntry) {
          const creditAcc = accounts.find(a => a.id === creditEntry.accountId);
          const debitAcc = accounts.find(a => a.id === debitEntry.accountId);
          const isCashCredit = isCashOrBankAccount(creditAcc);
          const isCashDebit = isCashOrBankAccount(debitAcc);

          if (isCashCredit && !isCashDebit) {
            // Payment: cash is credit, counterparty is debit
            setCashAccountId(creditEntry.accountId);
            setCounterpartyId(findCounterpartyId(debitEntry.accountId));
            setAmount(creditEntry.credit);
            setCounterpartyTypeFromAccount(debitEntry.accountId);
          } else if (isCashDebit && !isCashCredit) {
            // Receipt: cash is debit, counterparty is credit
            setCashAccountId(debitEntry.accountId);
            setCounterpartyId(findCounterpartyId(creditEntry.accountId));
            setAmount(debitEntry.debit);
            setCounterpartyTypeFromAccount(creditEntry.accountId);
          } else if (isCashCredit && isCashDebit) {
            // Contra: both are cash accounts
            setCashAccountId(creditEntry.accountId);
            setCounterpartyId(debitEntry.accountId);
            setAmount(creditEntry.credit);
            setCounterpartyType('cash');
          } else {
            // Journal: neither is cash — use credit as primary
            setCashAccountId(creditEntry.accountId);
            setCounterpartyId(debitEntry.accountId);
            setAmount(creditEntry.credit);
            setCounterpartyType('account');
          }
        }
      }
    } else {
      setCashAccountId(defaultAccountId || '');
      setCounterpartyId('');
      setDate(new Date().toISOString().split('T')[0]);
      setEntryType('Payment');
      setCounterpartyType('supplier');
      setAmount('');
      setReferenceNo('');
      setNarration('');
    }
  }, [isOpen, editVoucherId, defaultAccountId, accounts]);

  // Determine if an account is a cash/bank account
  const isCashOrBankAccount = (acc: any) => {
    if (!acc) return false;
    const subtype = accountSubtypes?.find(s => s.id === acc.subtypeId);
    return subtype?.name === 'Cash' || subtype?.name === 'Bank' || 
           acc.name?.toLowerCase().includes('cash') || acc.name?.toLowerCase().includes('bank');
  };

  // Given an account ID, find the best counterparty type match
  const setCounterpartyTypeFromAccount = (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;
    if (acc.linkedEntityId) {
      const sup = suppliers.find(s => s.id === acc.linkedEntityId);
      if (sup) { setCounterpartyType('supplier'); return; }
      const cus = customers.find(c => c.id === acc.linkedEntityId);
      if (cus) { setCounterpartyType('customer'); return; }
      const proc = processors.find(p => p.id === acc.linkedEntityId);
      if (proc) { setCounterpartyType('processor'); return; }
    }
    if (acc.type === 'Expenses' || acc.type === 'Cost of Goods Sold' || acc.type === 'Other Expenses') {
      setCounterpartyType('expense');
      return;
    }
    if (acc.type === 'Revenue' || acc.type === 'Other Income') {
      setCounterpartyType('income');
      return;
    }
    if (isCashOrBankAccount(acc)) {
      setCounterpartyType('cash');
      return;
    }
    setCounterpartyType('account');
  };

  // Find the counterparty ID for a given account — could be a linked entity ID or the account itself
  const findCounterpartyId = (accountId: string): string => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return accountId;
    if (acc.linkedEntityId) return acc.linkedEntityId;
    return accountId;
  };

  // Get cash and bank accounts
  const cashAccounts = accounts.filter(a => 
    accountSubtypes?.find(s => s.id === a.subtypeId)?.name === 'Cash' ||
    accountSubtypes?.find(s => s.id === a.subtypeId)?.name === 'Bank' ||
    a.name.toLowerCase().includes('cash') || 
    a.name.toLowerCase().includes('bank')
  );

  // Get counterparty options based on type
  const counterpartyOptions = (): { id: string; label: string; accountId: string | null }[] => {
    switch (counterpartyType) {
      case 'supplier':
        return suppliers.map(s => ({
          id: s.id,
          label: `${s.name} — Balance: PKR ${(s.balancePayable || 0).toLocaleString()}`,
          accountId: accounts.find(a => a.linkedEntityId === s.id)?.id || null,
        }));
      case 'customer':
        return customers.map(c => ({
          id: c.id,
          label: `${c.name} — Balance: PKR ${(c.balanceReceivable || 0).toLocaleString()}`,
          accountId: accounts.find(a => a.linkedEntityId === c.id)?.id || null,
        }));
      case 'processor':
        return processors.map(p => ({
          id: p.id,
          label: `${p.name} — Balance: PKR ${(p.balancePayable || 0).toLocaleString()}`,
          accountId: accounts.find(a => a.linkedEntityId === p.id)?.id || null,
        }));
      case 'expense':
        return accounts
          .filter(a => a.type === 'Expenses' || a.type === 'Cost of Goods Sold' || a.type === 'Other Expenses')
          .map(a => ({ id: a.id, label: `${a.code} - ${a.name}`, accountId: a.id }));
      case 'income':
        return accounts
          .filter(a => a.type === 'Revenue' || a.type === 'Other Income')
          .map(a => ({ id: a.id, label: `${a.code} - ${a.name}`, accountId: a.id }));
      case 'cash':
        return cashAccounts
          .filter(a => a.id !== cashAccountId)
          .map(a => ({ id: a.id, label: `${a.code} - ${a.name}`, accountId: a.id }));
      case 'account':
        return accounts.map(a => ({
          id: a.id,
          label: `${a.code} - ${a.name}`,
          accountId: a.id,
        }));
      default:
        return [];
    }
  };

  const getCounterpartyLabel = () => {
    switch (entryType) {
      case 'Payment':
        switch (counterpartyType) {
          case 'supplier': return 'Pay to Supplier';
          case 'processor': return 'Pay to Processor';
          case 'expense': return 'Expense Account (Debit)';
          default: return 'Counter-party';
        }
      case 'Receipt':
        switch (counterpartyType) {
          case 'customer': return 'Receive from Customer';
          case 'income': return 'Income Account (Credit)';
          default: return 'Counter-party';
        }
      case 'Contra': return 'Transfer to Account (Debit)';
      case 'Journal': return 'Counter Account (Debit)';
      default: return 'Counter-party';
    }
  };

  const getCounterpartyTypes = () => {
    if (entryType === 'Payment') return [
      { value: 'supplier' as const, label: 'Supplier' },
      { value: 'processor' as const, label: 'Processor' },
      { value: 'expense' as const, label: 'Expense' },
    ];
    if (entryType === 'Receipt') return [
      { value: 'customer' as const, label: 'Customer' },
      { value: 'income' as const, label: 'Income' },
    ];
    return [];
  };

  // Derive from/to account IDs from user-friendly selections
  const deriveAccountIds = (): { fromAccountId: string; toAccountId: string } | null => {
    if (!cashAccountId || !counterpartyId || amount === '' || Number(amount) <= 0) return null;
    const options = counterpartyOptions();
    const selected = options.find(o => o.id === counterpartyId);
    if (!selected || !selected.accountId) return null;
    const counterpartyAccId = selected.accountId;
    switch (entryType) {
      case 'Payment': return { fromAccountId: cashAccountId, toAccountId: counterpartyAccId };
      case 'Receipt': return { fromAccountId: counterpartyAccId, toAccountId: cashAccountId };
      case 'Contra': return { fromAccountId: cashAccountId, toAccountId: counterpartyAccId };
      case 'Journal': return { fromAccountId: cashAccountId, toAccountId: counterpartyAccId };
      default: return null;
    }
  };

  const derived = deriveAccountIds();
  const isValid = derived !== null && narration && cashAccountId !== counterpartyId;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !derived) return;

    const { fromAccountId, toAccountId } = derived;
    const numAmount = Number(amount);
    const fromAcc = accounts.find(a => a.id === fromAccountId);
    const toAcc = accounts.find(a => a.id === toAccountId);

    // Validation for entity balances
    if (entryType === 'Payment' && toAcc?.linkedEntityId) {
       const sup = suppliers.find(s => s.id === toAcc.linkedEntityId);
       if (sup && numAmount > sup.balancePayable) {
           alert(`Cannot pay supplier beyond outstanding balance of PKR ${sup.balancePayable.toLocaleString()}.`);
           return;
       }
       const proc = processors.find(p => p.id === toAcc.linkedEntityId);
       if (proc && numAmount > proc.balancePayable) {
           alert(`Cannot pay processor beyond pending amount of PKR ${proc.balancePayable.toLocaleString()}.`);
           return;
       }
    }
    if (entryType === 'Receipt' && fromAcc?.linkedEntityId) {
       const cus = customers.find(c => c.id === fromAcc.linkedEntityId);
       if (cus && numAmount > cus.balanceReceivable) {
           alert(`Cannot receive beyond customer outstanding balance of PKR ${cus.balanceReceivable.toLocaleString()}.`);
           return;
       }
    }

    const jes = [
      {
        accountId: fromAccountId,
        debit: 0,
        credit: numAmount,
        description: narration
      },
      {
        accountId: toAccountId,
        debit: numAmount,
        credit: 0,
        description: narration
      }
    ];

    let voucherTypeStr = 'Journal Voucher';
    if (entryType === 'Payment') {
      const cashAcc = accounts.find(a => a.id === cashAccountId);
      const sub = accountSubtypes?.find(s => s.id === cashAcc?.subtypeId);
      voucherTypeStr = sub?.name === 'Cash' ? 'Cash Payment' : 'Bank Payment';
    } else if (entryType === 'Receipt') {
      const cashAcc = accounts.find(a => a.id === cashAccountId);
      const sub = accountSubtypes?.find(s => s.id === cashAcc?.subtypeId);
      voucherTypeStr = sub?.name === 'Cash' ? 'Cash Receipt' : 'Bank Receipt';
    } else if (entryType === 'Contra') {
      voucherTypeStr = 'Contra Voucher';
    }

    ErrorManagement.safeExecuteSync(() => {
      if (editVoucherId) {
        AccountingService.updateVoucher(editVoucherId, {
          date,
          referenceNo,
          narration
        }, jes);
      } else {
        AccountingService.createVoucher({
          date,
          type: voucherTypeStr as any,
          referenceNo,
          sourceModule: 'Cashbook',
          narration
        }, jes);
      }

      // Update entity balances
      if (entryType === 'Payment' && toAcc?.linkedEntityId && !editVoucherId) {
         const sup = suppliers.find(s => s.id === toAcc.linkedEntityId);
         if (sup) useERPStore.getState().updateSupplier(sup.id, { balancePayable: sup.balancePayable - numAmount });
         const proc = processors.find(p => p.id === toAcc.linkedEntityId);
         if (proc) useERPStore.getState().updateProcessor(proc.id, { balancePayable: proc.balancePayable - numAmount });
      }
      if (entryType === 'Receipt' && fromAcc?.linkedEntityId && !editVoucherId) {
         const cus = customers.find(c => c.id === fromAcc.linkedEntityId);
         if (cus) useERPStore.getState().updateCustomer(cus.id, { balanceReceivable: cus.balanceReceivable - numAmount });
      }

      onSave();
    }, 'Cashbook Save');
  };

  const cashAccountOptions = cashAccounts.map(a => ({
    id: a.id,
    label: `${a.code} - ${a.name}`,
    secondaryLabel: `Balance: ${a.openingBalanceType === 'Debit' ? 'Dr' : 'Cr'} ${a.openingBalance.toLocaleString()}`
  }));

  const cpOptions = counterpartyOptions().map(o => ({
    id: o.id,
    label: o.label,
    secondaryLabel: ''
  }));

  const cashAccName = cashAccounts.find(a => a.id === cashAccountId)?.name || 'Cash/Bank';
  const getNarrationPlaceholder = () => {
    if (entryType === 'Payment') return `e.g. Payment to supplier, expense payment via ${cashAccName}`;
    if (entryType === 'Receipt') return `e.g. Receipt from customer, income received via ${cashAccName}`;
    return `Description of the transaction`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-3xl rounded-2xl shadow-xl border border-border flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-border/50 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{editVoucherId ? 'Update Entry' : 'New Cashbook Entry'}</h2>
            <p className="text-sm text-muted-foreground mt-1">Record a payment, receipt, contra, or journal entry</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1">
          {/* Entry Type */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-muted-foreground mb-3">Transaction Type</label>
            <div className="grid grid-cols-4 gap-3">
              {(['Payment', 'Receipt', 'Contra', 'Journal'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setEntryType(type);
                    if (editVoucherId && type !== entryType) {
                      setCounterpartyId('');
                      if (type === 'Payment') setCounterpartyType('supplier');
                      else if (type === 'Receipt') setCounterpartyType('customer');
                      else if (type === 'Contra') setCounterpartyType('cash');
                      else setCounterpartyType('account');
                    }
                  }}
                  className={cn(
                    "px-4 py-3 text-sm font-semibold rounded-xl border-2 transition-all text-center",
                    entryType === type 
                      ? type === 'Payment' ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800' :
                        type === 'Receipt' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' :
                        type === 'Contra' ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' :
                        'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800'
                      : "bg-background border-border text-muted-foreground hover:border-muted-foreground/30"
                  )}
                >
                  <div className="text-lg mb-0.5">
                    {type === 'Payment' ? '💳' : type === 'Receipt' ? '💰' : type === 'Contra' ? '🔄' : '📝'}
                  </div>
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-muted/10 p-5 rounded-xl border border-border/50 space-y-5 mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Transaction Details</h3>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setAddAccountTypeFilter(undefined); setIsAddAccountModalOpen(true); }} className="text-xs flex items-center gap-1 text-primary hover:underline font-medium"><Plus className="h-3 w-3"/> Account</button>
                <button type="button" onClick={() => { setAddAccountTypeFilter({type: 'Assets', subtypeName: 'Bank'}); setIsAddAccountModalOpen(true); }} className="text-xs flex items-center gap-1 text-primary hover:underline font-medium"><Plus className="h-3 w-3"/> Bank</button>
                <button type="button" onClick={() => { setAddAccountTypeFilter({type: 'Assets', subtypeName: 'Cash'}); setIsAddAccountModalOpen(true); }} className="text-xs flex items-center gap-1 text-primary hover:underline font-medium"><Plus className="h-3 w-3"/> Cash</button>
              </div>
            </div>

            {/* Cash/Bank Account */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {entryType === 'Payment' ? 'Cash/Bank Account (Paying from)' :
                 entryType === 'Receipt' ? 'Cash/Bank Account (Receiving into)' :
                 entryType === 'Contra' ? 'Cash/Bank Account (Transfer from)' :
                 'Cash/Bank Account (Credit side)'}
              </label>
              <SearchableSelect
                options={cashAccountOptions}
                value={cashAccountId}
                onChange={setCashAccountId}
                placeholder="Select cash or bank account..."
                required
              />
            </div>

            {/* Counter-party Type selector */}
            {getCounterpartyTypes().length > 0 && (
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  {entryType === 'Payment' ? 'Pay To' : 'Receive From'}
                </label>
                <div className="flex gap-2 mb-3">
                  {getCounterpartyTypes().map(ct => (
                    <button
                      key={ct.value}
                      type="button"
                      onClick={() => { setCounterpartyType(ct.value); setCounterpartyId(''); }}
                      className={cn(
                        "px-4 py-2 text-sm font-medium rounded-lg border transition-all",
                        counterpartyType === ct.value
                          ? "bg-primary/10 text-primary border-primary"
                          : "bg-background border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Counter-party selector */}
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {getCounterpartyLabel()}
              </label>
              <SearchableSelect
                options={cpOptions}
                value={counterpartyId}
                onChange={setCounterpartyId}
                placeholder={entryType === 'Contra' ? 'Select destination account...' : `Select ${counterpartyType}...`}
                required
              />
            </div>

            {/* Amount & Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">PKR</span>
                  <input 
                    type="number" 
                    required 
                    min="0.01" 
                    step="0.01" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value ? Number(e.target.value) : '')} 
                    className="w-full rounded-xl border border-border pl-14 pr-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" 
                    placeholder="0.00" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Date</label>
                <input 
                  type="date" 
                  required 
                  value={date} 
                  onChange={e => setDate(e.target.value)} 
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" 
                />
              </div>
            </div>

            {/* Reference & Narration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Reference No (Optional)</label>
                <input 
                  type="text" 
                  value={referenceNo} 
                  onChange={e => setReferenceNo(e.target.value)} 
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" 
                  placeholder={entryType === 'Payment' ? 'e.g. Check #, Bank Ref' : 'e.g. Invoice #, Receipt #'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Narration</label>
                <textarea 
                  required 
                  value={narration} 
                  onChange={e => setNarration(e.target.value)} 
                  className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" 
                  placeholder={getNarrationPlaceholder()}
                  rows={2} 
                />
              </div>
            </div>
          </div>

          {/* Double-entry preview */}
          {derived && (
            <div className="p-4 bg-muted/20 rounded-xl border border-border/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Double-Entry Preview</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-400 shrink-0" />
                  <span className="text-muted-foreground">Credit:</span>
                  <span className="font-medium text-foreground">{accounts.find(a => a.id === derived.fromAccountId)?.name}</span>
                  <span className="text-muted-foreground">PKR {Number(amount).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-muted-foreground">Debit:</span>
                  <span className="font-medium text-foreground">{accounts.find(a => a.id === derived.toAccountId)?.name}</span>
                  <span className="text-muted-foreground">PKR {Number(amount).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </form>
        
        <div className="p-6 border-t border-border/50 bg-muted/10 shrink-0 flex justify-end gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-foreground bg-background border border-border hover:bg-muted/50 rounded-xl transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!isValid} className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {editVoucherId ? 'Update Entry' : 'Save Entry'}
          </button>
        </div>
      </div>
      
      <AddAccountModal 
        isOpen={isAddAccountModalOpen} 
        onClose={() => setIsAddAccountModalOpen(false)} 
        onSave={() => setIsAddAccountModalOpen(false)}
        quickAddType={addAccountTypeFilter}
      />
    </div>
  );
}
