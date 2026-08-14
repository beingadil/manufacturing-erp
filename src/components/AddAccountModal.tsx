import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useERPStore } from '../store/useERPStore';
import { AccountType, } from '../types/erp';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editAccountId?: string;
  quickAddType?: {type?: AccountType, subtypeName?: string};
}

const TYPES: AccountType[] = ["Assets", "Liabilities", "Equity", "Revenue", "Cost of Goods Sold", "Expenses", "Other Income", "Other Expenses"];

export function AddAccountModal({ isOpen, onClose, onSave, editAccountId, quickAddType }: Props) {
  const { addAccount, updateAccount, accountSubtypes, accounts } = useERPStore();
  
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('Assets');
  const [subtypeId, setSubtypeId] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [openingBalanceType, setOpeningBalanceType] = useState<'Debit' | 'Credit'>('Debit');
  const [parentId, setParentId] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editAccountId) {
        const acc = accounts.find(a => a.id === editAccountId);
        if (acc) {
          setName(acc.name);
          setType(acc.type);
          setSubtypeId(acc.subtypeId);
          setOpeningBalance(acc.openingBalance);
          setOpeningBalanceType(acc.openingBalanceType);
          setParentId(acc.parentId || '');
          setCode(acc.code || '');
        }
      } else {
        setName('');
        setType(quickAddType?.type || 'Assets');
        setCode('');
        
        let initialSubId = '';
        if (quickAddType) {
          const sub = accountSubtypes.find(s => s.type === quickAddType.type && s.name === quickAddType.subtypeName);
          if (sub) initialSubId = sub.id;
        }
        setSubtypeId(initialSubId);
        
        setOpeningBalance(0);
        setOpeningBalanceType(quickAddType?.type === 'Liabilities' || quickAddType?.type === 'Equity' || quickAddType?.type === 'Revenue' ? 'Credit' : 'Debit');
        setParentId('');
      }
    }
  }, [isOpen, editAccountId, accounts, quickAddType, accountSubtypes]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subtypeId) return;

    if (editAccountId) {
      updateAccount(editAccountId, {
        name,
        code: code || undefined,
        type,
        subtypeId,
        openingBalance,
        openingBalanceType,
        parentId: parentId || undefined
      });
    } else {
      addAccount({
        status: 'Active',
        name,
        code: code || undefined,
        type,
        subtypeId,
        openingBalance,
        openingBalanceType,
        isSystem: false,
        parentId: parentId || undefined
      } as any);
    }

    setName('');
    setType('Assets');
    setSubtypeId('');
    setOpeningBalance(0);
    setOpeningBalanceType('Debit');
    setParentId('');
    setCode('');
    onSave();
  };

  const validSubtypes = accountSubtypes.filter(st => st.type === type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
        <div className="p-6 border-b border-border/50 flex justify-between items-center">
          <h2 className="text-xl font-bold text-foreground">{editAccountId ? 'Edit Account' : 'Add New Account'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Account Code (Optional)</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" placeholder="Auto-generated if blank" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Account Name</label>
              <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" placeholder="e.g. Cash in Hand" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Account Type</label>
              <select required value={type} onChange={e => { setType(e.target.value as AccountType); setSubtypeId(''); }} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground">
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Sub-Type</label>
              <select required value={subtypeId} onChange={e => setSubtypeId(e.target.value)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground">
                <option value="">Select Subtype...</option>
                {validSubtypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Parent Account (Optional)</label>
              <select value={parentId} onChange={e => setParentId(e.target.value)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground">
                <option value="">None (Top Level)</option>
                {accounts.filter(a => a.type === type && a.id !== editAccountId).map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Opening Balance</label>
              <input type="number" min="0" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(Number(e.target.value))} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Balance Type</label>
              <select value={openingBalanceType} onChange={e => setOpeningBalanceType(e.target.value as 'Debit' | 'Credit')} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary bg-background text-foreground">
                <option value="Debit">Debit (Dr)</option>
                <option value="Credit">Credit (Cr)</option>
              </select>
            </div>
          </div>
          
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border hover:bg-muted/50 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-colors">
              {editAccountId ? 'Update Account' : 'Save Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
