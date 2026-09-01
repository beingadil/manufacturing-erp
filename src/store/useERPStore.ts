import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SQLiteStorageAdapter } from '../database/sqlite/SQLiteStorageAdapter';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';
import { getSystemAccountBySubtype, getSystemCOGSAccount, getSystemInventoryAccount } from '../lib/accounting/accountClassification';
import { DocumentNumberingService } from '../lib/business/DocumentNumberingService';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { UnitConversionService } from '../lib/business/UnitConversionService';import {Account, 
  AccountSubtype, 
  Batch, 
  CompanySettings, Customer, DocumentSettings, InventoryMovement, JournalEntry, 
  MaterialCategory, ProcessingReceipt, ProcessingSend, ProcessingStage,Processor, ProcessorBill, Product, 
  Purchase, RawMaterial, Sale,Supplier, Voucher 
} from '../types/erp';
import { createCRUDActions } from './crudActions';
import { databaseMiddleware } from './databaseMiddleware';
import { migrateERPState } from './erpMigration';

export interface ERPState {
  inventoryThreshold: number;
  companySettings: CompanySettings;
  documentSettings: DocumentSettings;
  currentUser: { name: string; email: string; role: string } | null;
  setInventoryThreshold: (threshold: number) => void;
  updateCompanySettings: (settings: Partial<CompanySettings>) => void;
  updateDocumentSettings: (settings: Partial<DocumentSettings>) => void;
  setCurrentUser: (user: { name: string; email: string; role: string } | null) => void;

  categories: MaterialCategory[];
  materials: RawMaterial[];
  processors: Processor[];
  suppliers: Supplier[];
  customers: Customer[];
  purchases: Purchase[];
  processingSends: ProcessingSend[];
  processingReceipts: ProcessingReceipt[];
  processorBills: ProcessorBill[];
  processingStages: ProcessingStage[];
  products: Product[];
  sales: Sale[];
  batches: Batch[];
  inventoryMovements: InventoryMovement[];
  
  // Accounting
  accountSubtypes: AccountSubtype[];
  accounts: Account[];
  vouchers: Voucher[];
  addModuleItem: (table: string, item: any) => void;
  updateModuleItem: (table: string, id: string, item: any) => void;
  removeModuleItem: (table: string, id: string) => void;
  journalEntries: JournalEntry[];
  
  // Entity Add Actions
  addCategory: (data: Omit<MaterialCategory, 'id'>) => string;
  updateCategory: (id: string, data: Partial<MaterialCategory>) => void;
  addProcessingStage: (data: Omit<ProcessingStage, 'id'>) => string;
  updateProcessingStage: (id: string, data: Partial<ProcessingStage>) => void;
  deleteProcessingStage: (id: string) => void;
  addProcessor: (data: Omit<Processor, 'id' | 'balancePayable'>) => string;
  addSupplier: (data: Omit<Supplier, 'id' | 'balancePayable'>) => string;
  addCustomer: (data: Omit<Customer, 'id' | 'balanceReceivable'>) => string;
  addRawMaterial: (data: Omit<RawMaterial, 'id' | 'stockPcs' | 'processedStockPcs'>) => string;
  addProduct: (data: Omit<Product, 'id'>) => string;

  // Transaction Actions
  
  updatePurchase: (id: string, data: Partial<Purchase>) => void;
  deletePurchase: (id: string) => void;
  updateSale: (id: string, data: Partial<Sale>) => void;
  deleteSale: (id: string) => void;
  updateProcessingSend: (id: string, data: Partial<ProcessingSend>) => void;
  deleteProcessingSend: (id: string) => void;
  updateProcessingReceipt: (id: string, data: Partial<ProcessingReceipt>) => void;
  deleteProcessingReceipt: (id: string) => void;
  updateProcessorBill: (id: string, data: Partial<ProcessorBill>) => void;
  deleteProcessorBill: (id: string) => void;
  updateAccount: (id: string, data: Partial<Account>) => void;
  updateSupplier: (id: string, data: Partial<Supplier>) => void;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  updateProcessor: (id: string, data: Partial<Processor>) => void;
  deleteAccount: (id: string) => void;

  addPurchase: (data: Omit<Purchase, 'id' | 'purchaseNo' | 'calculatedPcs' | 'amount'>) => void;
  addProcessingSend: (data: Omit<ProcessingSend, 'id' | 'dispatchNo' | 'pcsReceived' | 'status'>, adjustSendIds?: string[]) => void;
  addProcessingReceipt: (data: Omit<ProcessingReceipt, 'id' | 'receiveNo' | 'billAmount'>) => void;
  addProcessorBill: (data: Omit<ProcessorBill, 'id' | 'billNo' | 'totalAmount'>) => void;
  recordProcessingLoss: (sendId: string, quantity: number, date?: string, remarks?: string) => void;
  addSale: (data: Omit<Sale, 'id' | 'invoiceNo' | 'totalAmount'>) => void;
  
  // Accounting Actions
  addAccountSubtype: (data: Omit<AccountSubtype, 'id'>) => string;
  addAccount: (data: Omit<Account, 'id' | 'code'> & { code?: string }) => string;
  addVoucher: (voucher: Omit<Voucher, 'id' | 'voucherNo' | 'createdAt'>, entries: Omit<JournalEntry, 'id' | 'voucherId'>[]) => string;
  updateVoucher: (voucherId: string, voucherData: Partial<Voucher>, newEntries: Omit<JournalEntry, 'id' | 'voucherId'>[]) => void;
  deleteVoucher: (voucherId: string) => void;
  cancelVoucher: (voucherId: string, reason?: string) => void;
  wipeAllData: () => void;
  wipeModules: (moduleIds: string[]) => void;
}

/**
 * Per-module wipe map. Each id clears exactly the store keys that belong to
 * that module — master-data modules (categories, materials, ...) clear only
 * their own records, while transaction modules also clear their ledger trail.
 */
export const MODULE_WIPE_KEYS: Record<string, (keyof ERPState)[]> = {
  categories: ['categories'],
  materials: ['materials'],
  products: ['products'],
  suppliers: ['suppliers'],
  customers: ['customers'],
  processors: ['processors'],
  purchases: ['purchases'],
  sales: ['sales'],
  processing: ['processingSends', 'processingReceipts', 'processorBills'],
  inventory: ['batches', 'inventoryMovements'],
  accounting: ['vouchers', 'journalEntries', 'accounts', 'accountSubtypes'],
};

export const WIPE_MODULE_LABELS: Record<string, string> = {
  categories: 'Categories',
  materials: 'Raw Materials',
  products: 'Products / Finished Goods',
  suppliers: 'Suppliers',
  customers: 'Customers',
  processors: 'Processors',
  purchases: 'Purchases',
  sales: 'Sales',
  processing: 'Processing (Sends / Receipts / Bills)',
  inventory: 'Batches & Inventory Movements',
  accounting: 'Accounting (Vouchers / Journal / Chart of Accounts)',
};

/**
 * Sort stages by sequence and rewire each stage's `nextStageId` to the stage
 * that follows it in the chain. The chain is derived from `sequence`, never
 * stored independently, so reordering / adding / deleting a stage keeps the
 * chain consistent (the live engine and migration both read `nextStageId`).
 */
function rewireStageChain(stages: ProcessingStage[]): ProcessingStage[] {
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);
  return ordered.map((s, i) => {
    const next = ordered[i + 1];
    return next ? { ...s, nextStageId: next.id } : { ...s, nextStageId: undefined };
  });
}

export const useERPStore = create<ERPState>()(
  persist(
    databaseMiddleware((set, get) => ({
      inventoryThreshold: 100,
      companySettings: {
        name: 'W-RAW ERP PROFESSIONAL',
        address: '123 Industrial Area, Metal District',
        phone: '+1 234 567 8900',
        email: 'info@wrawerp.com',
        website: 'www.wrawerp.com',
        taxNumber: 'TAX-987654321',
      },
      documentSettings: {
        footerText: 'This document is computer generated and does not require a signature.',
        showSignatureDisclaimer: true,
        defaultOrientation: 'Portrait',
      },
      currentUser: { name: 'System Admin', email: 'admin@miaoda.com', role: 'Admin' },
      
      setInventoryThreshold: (inventoryThreshold) => set({ inventoryThreshold }),
      updateCompanySettings: (settings) => set((state) => ({ companySettings: { ...state.companySettings, ...settings } })),
      updateDocumentSettings: (settings) => set((state) => ({ documentSettings: { ...state.documentSettings, ...settings } })),
      setCurrentUser: (user) => set({ currentUser: user }),

      categories: [],
      materials: [],
      processors: [],
      suppliers: [],
      customers: [],
      purchases: [],
      processingSends: [],
      processingReceipts: [],
      processorBills: [],
      processingStages: [],
      products: [],
      sales: [],
      batches: [],
      inventoryMovements: [],
      
      accountSubtypes: [],
      accounts: [],
      vouchers: [],
      journalEntries: [],

            // Party balances are re-derived from the COMPLETE ledger after every
            // purchase/sale/bill create·edit·delete via this callback (spec §14).
            ...createCRUDActions(set, get, () => AccountingEngine.recomputePartyBalances()),

      wipeAllData: () => {
        try {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('erp-storage');
            localStorage.removeItem('erp-settings');
          }
        } catch (e) {
          console.warn('Failed to clear localStorage during wipe', e);
        }
        set({
          inventoryThreshold: 100,
          categories: [],
          materials: [],
          processors: [],
          suppliers: [],
          customers: [],
          purchases: [],
          processingSends: [],
          processingReceipts: [],
          processorBills: [],
          processingStages: [],
          products: [],
          sales: [],
          batches: [],
          inventoryMovements: [],
          accountSubtypes: [],
          accounts: [],
          vouchers: [],
          journalEntries: []
        });
      },

      wipeModules: (moduleIds) => set((state) => {
        const moduleSet = new Set(moduleIds);
        const patch: Partial<ERPState> = {};
        const wipeAccounting = moduleSet.has('accounting');
        const wipeInventory = moduleSet.has('inventory');

        // 1. Clear each module's own arrays (accounting/inventory handled below).
        for (const id of moduleIds) {
          for (const key of MODULE_WIPE_KEYS[id] || []) {
            if (key === 'vouchers' || key === 'journalEntries' || key === 'batches' || key === 'inventoryMovements') continue;
            (patch as any)[key] = [];
          }
        }

        // 2. Cascade: wiping a transaction module also clears the batches and
        //    inventory movements it created, so no orphan trail remains.
        if (moduleSet.has('purchases') || moduleSet.has('sales') || moduleSet.has('processing')) {
          if (!wipeInventory) {
            const removedPurchaseIds = moduleSet.has('purchases')
              ? new Set(state.purchases.map(p => p.id))
              : null;
            const movementModules = new Set<string>();
            if (moduleSet.has('purchases')) movementModules.add('Purchase');
            if (moduleSet.has('sales')) movementModules.add('Sale');
            if (moduleSet.has('processing')) { movementModules.add('Dispatch'); movementModules.add('Receive'); }

            if (removedPurchaseIds) {
              patch.batches = state.batches.filter(b => !removedPurchaseIds.has(b.purchaseId));
            }
            patch.inventoryMovements = state.inventoryMovements.filter(m =>
              !movementModules.has(m.module)
              && !(removedPurchaseIds && m.batchId && removedPurchaseIds.has(m.batchId))
            );
          }

          // 3. Also remove the auto-generated vouchers + journal entries of those
          //    modules (unless the whole accounting module is being wiped).
          if (!wipeAccounting) {
            const sources = new Set<string>();
            if (moduleSet.has('purchases')) sources.add('Purchase');
            if (moduleSet.has('sales')) sources.add('Sales');
            if (moduleSet.has('processing')) sources.add('Processing');
            const removedVoucherIds = new Set(
              state.vouchers.filter(v => sources.has(v.sourceModule || '')).map(v => v.id)
            );
            patch.vouchers = state.vouchers.filter(v => !sources.has(v.sourceModule || ''));
            patch.journalEntries = state.journalEntries.filter(je => !removedVoucherIds.has(je.voucherId));
          }
        }

        if (wipeInventory) {
          patch.batches = [];
          patch.inventoryMovements = [];
        }
        if (wipeAccounting) {
          patch.vouchers = [];
          patch.journalEntries = [];
        }

        return patch as Partial<ERPState>;
      }),
      addModuleItem: (table, item) => set((state) => {
        // Map postgres table name to zustand store key
        const keyMap: Record<string, keyof ERPState> = {
          'categories': 'categories',
          'materials': 'materials',
          'products': 'products',
          'customers': 'customers',
          'suppliers': 'suppliers',
          'processors': 'processors',
          'purchases': 'purchases',
          'sales': 'sales'
        };
        const key = keyMap[table];
        if (!key) return state;

        const currentArray = state[key] as any[];
        const exists = currentArray.find(x => x.id === item.id);
        if (exists) {
          return { [key]: currentArray.map(x => x.id === item.id ? { ...x, ...item, isOptimistic: false } : x) };
        }
        return { [key]: [item, ...currentArray] };
      }),

      updateModuleItem: (table, id, item) => set((state) => {
        const keyMap: Record<string, keyof ERPState> = {
          'categories': 'categories',
          'materials': 'materials',
          'products': 'products',
          'customers': 'customers',
          'suppliers': 'suppliers',
          'processors': 'processors',
          'purchases': 'purchases',
          'sales': 'sales'
        };
        const key = keyMap[table];
        if (!key) return state;

        const currentArray = state[key] as any[];
        return { [key]: currentArray.map(x => x.id === id ? { ...x, ...item, isOptimistic: item.isOptimistic } : x) };
      }),

      removeModuleItem: (table, id) => set((state) => {
        const keyMap: Record<string, keyof ERPState> = {
          'categories': 'categories',
          'materials': 'materials',
          'products': 'products',
          'customers': 'customers',
          'suppliers': 'suppliers',
          'processors': 'processors',
          'purchases': 'purchases',
          'sales': 'sales'
        };
        const key = keyMap[table];
        if (!key) return state;

        const currentArray = state[key] as any[];
        return { [key]: currentArray.filter(x => x.id !== id) };
      }),

      addAccountSubtype: (data) => {
        const id = uuidv4();
        set((state) => ({ accountSubtypes: [...state.accountSubtypes, { ...data, id }] }));
        return id;
      },

      addAccount: (data) => {
        const id = uuidv4();
        set((state) => {
          let code = data.code;
          if (!code) {
            const sameTypeCount = state.accounts.filter(a => a.type === data.type).length;
            code = DocumentNumberingService.generateAccountCode(data.type, sameTypeCount);
          }
          
          return { accounts: [...state.accounts, { ...data, id, code }] };
        });
        return id;
      },

      addVoucher: (voucherData, entries) => {
        const id = uuidv4();
        const state = get();
        
        // Auto-generate voucher number — max-based, scoped to the voucher's own
        // date year, gap-free even after deletions (spec: numbering audit)
        const voucherNo = DocumentNumberingService.nextVoucherNumber(state.vouchers, voucherData.type, voucherData.date);
        
        const newVoucher: Voucher = {
          ...voucherData,
          id,
          voucherNo,
          createdAt: new Date().toISOString(),
          versionHistory: [{
            id: uuidv4(),
            modifiedAt: new Date().toISOString(),
            action: 'Created',
            reason: 'Manual Entry'
          }]
        };

        const newEntries = entries.map(e => ({ ...e, id: uuidv4(), voucherId: id }));

        set((state) => ({
          vouchers: [newVoucher, ...state.vouchers],
          journalEntries: [...newEntries, ...state.journalEntries]
        }));
        
        return id;
      },

      updateVoucher: (voucherId, voucherData, newEntries) => set((state) => {
        const existingVoucher = state.vouchers.find(v => v.id === voucherId);
        if (!existingVoucher) return state;

        // If the voucher's date moved to a different year (yearly reset ON),
        // re-scope its number into the new year's sequence. Same-year edits
        // keep the existing number.
        const nextDate = voucherData.date || existingVoucher.date;
        const renumber = DocumentNumberingService.isYearlyResetEnabled()
          && nextDate.slice(0, 4) !== existingVoucher.date.slice(0, 4);
        const nextVoucherNo = renumber
          ? DocumentNumberingService.nextVoucherNumber(
              state.vouchers.filter(v => v.id !== voucherId),
              existingVoucher.type,
              nextDate
            )
          : existingVoucher.voucherNo;

        const updatedVouchers = state.vouchers.map(v => {
          if (v.id === voucherId) {
            const auditEntry = {
              id: uuidv4(),
              modifiedAt: new Date().toISOString(),
              action: 'Updated' as const,
              reason: renumber ? 'Date moved to another year — renumbered' : 'User Edit',
              previousValues: { ...v, versionHistory: undefined },
              updatedValues: renumber ? { ...voucherData, voucherNo: nextVoucherNo } : { ...voucherData }
            };
            return {
              ...v,
              ...voucherData,
              ...(renumber ? { voucherNo: nextVoucherNo } : {}),
              versionHistory: [...(v.versionHistory || []), auditEntry]
            };
          }
          return v;
        });
        
        const filteredEntries = state.journalEntries.filter(e => e.voucherId !== voucherId);
        const addedEntries = newEntries.map(e => ({ ...e, id: uuidv4(), voucherId }));
        
        return {
          vouchers: updatedVouchers,
          journalEntries: [...filteredEntries, ...addedEntries]
        };
      }),

      deleteVoucher: (voucherId) => set((state) => {
        const voucher = state.vouchers.find(v => v.id === voucherId);
        if (!voucher) return state;

        return {
          vouchers: state.vouchers.filter(v => v.id !== voucherId),
          journalEntries: state.journalEntries.filter(je => je.voucherId !== voucherId)
        };
      }),

      cancelVoucher: (voucherId, reason) => set((state) => {
        const voucher = state.vouchers.find(v => v.id === voucherId);
        if (!voucher) return state;

        return {
          vouchers: state.vouchers.map(v => {
            if (v.id !== voucherId) return v;
            const auditEntry = {
              id: uuidv4(),
              modifiedAt: new Date().toISOString(),
              action: 'Cancelled' as const,
              reason: reason || 'Voided by user',
              previousValues: { ...v, versionHistory: undefined },
            };
            return {
              ...v,
              status: 'Cancelled' as const,
              versionHistory: [...(v.versionHistory || []), auditEntry]
            };
          })
        };
      }),

      addCategory: (data) => {
        const id = uuidv4();
        set((state) => ({ categories: [{ ...data, id }, ...state.categories] }));
        return id;
      },

      updateCategory: (id, data) => set((state) => ({
        categories: state.categories.map(c => c.id === id ? { ...c, ...data } : c)
      })),

      addProcessingStage: (data) => {
        const id = uuidv4();
        set((state) => {
          const next = [...state.processingStages, { ...data, id }];
          return { processingStages: rewireStageChain(next) };
        });
        return id;
      },

      updateProcessingStage: (id, data) => set((state) => {
        const next = state.processingStages.map(s => s.id === id ? { ...s, ...data } : s);
        return { processingStages: rewireStageChain(next) };
      }),

      deleteProcessingStage: (id) => set((state) => {
        // Guard: a stage with movements cannot be deleted — it is part of the
        // historical chain. Only unused stages can be removed.
        const hasMovements = state.processingSends.some(s => s.stageId === id)
          || state.processingReceipts.some(r => r.stageId === id);
        if (hasMovements) return state;
        return { processingStages: rewireStageChain(state.processingStages.filter(s => s.id !== id)) };
      }),

      addProcessor: (data) => {
        const id = uuidv4();
        set((state) => {
          const accountSubtype = state.accountSubtypes.find(s => s.name === 'Accounts Payable');
          const sameTypeCount = state.accounts.filter(a => a.type === 'Liabilities').length;
          const code = DocumentNumberingService.generateAccountCode('Liabilities', sameTypeCount);
          // Nest under the system AP control account (spec §15)
          const control = state.accounts.find(a => a.subtypeId === accountSubtype?.id && a.isSystem);
          const account: Account = {
            id: uuidv4(),
            code,
            name: data.name,
            subtypeId: accountSubtype?.id || '',
            type: 'Liabilities',
            openingBalance: 0,
            openingBalanceType: 'Credit',
            status: 'Active',
            isSystem: false,
            linkedEntityId: id,
            parentId: control?.id
          };

          return { 
            processors: [{ ...data, id, balancePayable: 0, accountId: account.id }, ...state.processors],
            accounts: [...state.accounts, account]
          };
        });
        return id;
      },

      addSupplier: (data) => {
        const id = uuidv4();
        set((state) => {
          const accountSubtype = state.accountSubtypes.find(s => s.name === 'Accounts Payable');
          const sameTypeCount = state.accounts.filter(a => a.type === 'Liabilities').length;
          const code = DocumentNumberingService.generateAccountCode('Liabilities', sameTypeCount);
          // Nest under the system AP control account (spec §15)
          const control = state.accounts.find(a => a.subtypeId === accountSubtype?.id && a.isSystem);
          const account: Account = {
            id: uuidv4(),
            code,
            name: data.name,
            subtypeId: accountSubtype?.id || '',
            type: 'Liabilities',
            openingBalance: 0,
            openingBalanceType: 'Credit',
            status: 'Active',
            isSystem: false,
            linkedEntityId: id,
            parentId: control?.id
          };

          return { 
            suppliers: [{ ...data, id, balancePayable: 0, accountId: account.id }, ...state.suppliers],
            accounts: [...state.accounts, account]
          };
        });
        return id;
      },

      addCustomer: (data) => {
        const id = uuidv4();
        set((state) => {
          const accountSubtype = state.accountSubtypes.find(s => s.name === 'Accounts Receivable');
          const sameTypeCount = state.accounts.filter(a => a.type === 'Assets').length;
          const code = DocumentNumberingService.generateAccountCode('Assets', sameTypeCount);
          // Nest under the system AR control account (spec §15)
          const control = state.accounts.find(a => a.subtypeId === accountSubtype?.id && a.isSystem);
          const account: Account = {
            id: uuidv4(),
            code,
            name: data.name,
            subtypeId: accountSubtype?.id || '',
            type: 'Assets',
            openingBalance: 0,
            openingBalanceType: 'Debit',
            status: 'Active',
            isSystem: false,
            linkedEntityId: id,
            parentId: control?.id
          };

          return { 
            customers: [{ ...data, id, balanceReceivable: 0, accountId: account.id }, ...state.customers],
            accounts: [...state.accounts, account]
          };
        });
        return id;
      },

      addRawMaterial: (data) => {
        const id = uuidv4();
        set((state) => ({ materials: [{ ...data, id, stockPcs: 0, processedStockPcs: 0 }, ...state.materials] }));
        return id;
      },

      addProduct: (data) => {
        const id = uuidv4();
        set((state) => ({ products: [{ ...data, id }, ...state.products] }));
        return id;
      },

      addPurchase: (data) => {
        set((state) => {
        const purchaseNo = DocumentNumberingService.nextDocumentNumber(state.purchases, 'purchaseNo', 'PO', data.date);
        const calculatedPcs = UnitConversionService.calculatePcsFromWeight(data.weight, data.weightUnit, data.weightPerPiece);
        const amount = data.weight * data.ratePerUnit;

        const purchaseId = uuidv4();
        const newPurchase: Purchase = {
          ...data,
          id: purchaseId,
          purchaseNo,
          calculatedPcs,
          amount
        };

        const batchId = uuidv4();
        const batchNo = `BATCH-${purchaseNo}`;
        const newBatch: Batch = {
          id: batchId,
          batchNo,
          purchaseId,
          supplierId: data.supplierId,
          materialId: data.materialId,
          date: data.date,
          weight: data.weight,
          weightUnit: data.weightUnit,
          ratePerUnit: data.ratePerUnit,
          weightPerPiece: data.weightPerPiece,
          initialPcs: calculatedPcs,
          remainingPcs: calculatedPcs,
          amount,
          status: "Active"
        };

        const currentMaterial = state.materials.find(m => m.id === data.materialId);
        const currentStock = currentMaterial?.stockPcs || 0;
        const newStock = currentStock + calculatedPcs;

        const updatedMaterials = state.materials.map(m =>
          m.id === data.materialId ? { ...m, stockPcs: newStock } : m
        );

        const movement: InventoryMovement = {
          id: uuidv4(),
          materialId: data.materialId,
          batchId,
          date: data.date,
          referenceNo: purchaseNo,
          module: "Purchase",
          transactionType: "IN",
          quantity: calculatedPcs,
          runningBalance: newStock,
          remarks: data.remarks
        };

        // NOTE: the supplier's balancePayable is NOT incremented here — it is
        // derived from the linked account's COMPLETE ledger via
        // AccountingEngine.recomputePartyBalances() right after this set, so the
        // listing balance can never drift from the ledger closing balance.

        // Automatic Voucher Generation (spec §25 — resolve accounts by subtype, never by name)
        // Purchases increase raw-material INVENTORY (an asset) — the purchase is
        // NOT an expense yet. Cost of goods sold is recognized only when the
        // goods are actually sold, so the Balance Sheet shows the stock we hold.
        const purchaseAccount = getSystemInventoryAccount(state.accounts, state.accountSubtypes, 'Raw Material Inventory');
        const payableAccount = state.accounts.find(a => a.linkedEntityId === data.supplierId) 
          || getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Accounts Payable');
        
        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;

        if (purchaseAccount && payableAccount) {
          const voucherId = uuidv4();
          const voucherNo = DocumentNumberingService.nextVoucherNumber(state.vouchers, 'Purchase Voucher', data.date);
          
          const newVoucher: Voucher = {
            id: voucherId,
            voucherNo,
            date: data.date,
            type: 'Purchase Voucher',
            referenceNo: purchaseNo,
            sourceModule: 'Purchase',
            sourceId: purchaseId,
            narration: `Purchase of ${data.weight} ${data.weightUnit} from Supplier`,
            totalDebit: amount,
            totalCredit: amount,
            createdAt: new Date().toISOString(),
            status: 'Posted',
            versionHistory: [{
              id: uuidv4(),
              modifiedAt: new Date().toISOString(),
              action: 'Created',
              reason: 'Auto-generated from Purchase'
            }]
          };
          
          const debitEntry: JournalEntry = {
            id: uuidv4(),
            voucherId,
            accountId: purchaseAccount.id,
            debit: amount,
            credit: 0
          };
          
          const creditEntry: JournalEntry = {
            id: uuidv4(),
            voucherId,
            accountId: payableAccount.id,
            debit: 0,
            credit: amount
          };
          
          updatedVouchers = [newVoucher, ...state.vouchers];
          updatedJournalEntries = [debitEntry, creditEntry, ...state.journalEntries];
        }

        return {
          purchases: [newPurchase, ...state.purchases],
          batches: [newBatch, ...(state.batches || [])],
          inventoryMovements: [movement, ...(state.inventoryMovements || [])],
          materials: updatedMaterials,
          vouchers: updatedVouchers,
          journalEntries: updatedJournalEntries
        };
        });
        AccountingEngine.recomputePartyBalances();
      },

      addProcessingSend: (data, adjustSendIds) => set((state) => {
        const dispatchNo = DocumentNumberingService.nextDocumentNumber(state.processingSends, 'dispatchNo', 'DSP', data.date);
        const newSendId = uuidv4();
        
        const newSend: ProcessingSend = {
          ...data,
          id: newSendId,
          dispatchNo,
          pcsReceived: 0,
          status: 'Pending'
        };

        // Stage-aware dispatch (spec §6): a stage-1 / legacy dispatch draws from
        // RAW stock (raw → WIP); an intermediate-stage dispatch moves pcs that
        // are ALREADY in WIP (WIP → WIP) and must NOT touch the raw counters or
        // the batch buckets — the same economic pcs are never counted twice.
        const consumesRaw = InventoryCalculationService.sendConsumesRaw(data.stageId, state.processingStages || []);

        if (!consumesRaw) {
          // Intermediate stage dispatch: pieces move from 'available at previous
          // stage' to 'in transit at target stage'. Consume from the batch's
          // stageAvailablePcs and advance its currentStageId to the target stage.
          // Also update atProcessorPcs on the material (these pcs are now at a
          // processor).
          
          let updatedBatches: Batch[] = state.batches || [];
          let consumedBatchId = data.batchId;

          if (data.batchId) {
            // Guard: reject over-send at the batch level
            const batch = updatedBatches.find(b => b.id === data.batchId);
            const available = (batch?.stageAvailablePcs || 0);
            if (data.pcsSent <= 0 || data.pcsSent > available) return state;
            updatedBatches = updatedBatches.map(b => {
              if (b.id === data.batchId) {
                return {
                  ...b,
                  stageAvailablePcs: Math.max(0, (b.stageAvailablePcs || 0) - data.pcsSent),
                  currentStageId: data.stageId || b.currentStageId,
                };
              }
              return b;
            });
          } else {
            // No explicit batch ('Auto / Any Batch'): FIFO-attribute the send
            // across the source stage's available pcs so the batch trail moves
            // in lockstep — the same pcs can never be sent to a stage twice.
            const attributed = InventoryCalculationService.attributeStageDispatchFIFO(
              data.materialId,
              data.pcsSent,
              data.stageId,
              state.processingStages || [],
              updatedBatches
            );
            // Reject unless the ENTIRE quantity was attributed — partial
            // attribution means there aren't enough pcs available at the source
            // stage, so the dispatch cannot be recorded without double-sending.
            if (data.pcsSent <= 0 || attributed.attributedPcs < data.pcsSent) return state;
            updatedBatches = attributed.batches;
            consumedBatchId = attributed.usedBatchIds[0] || data.batchId;
          }

          // PCS remain in WIP (atProcessorPcs unchanged) — same economic pcs, just relocated.
          const movement: InventoryMovement = {
            id: uuidv4(),
            materialId: data.materialId,
            batchId: consumedBatchId,
            date: data.date,
            referenceNo: dispatchNo,
            module: "Dispatch",
            transactionType: "OUT",
            quantity: data.pcsSent,
            runningBalance: 0,
            remarks: data.remarks
          };
          // Link the dispatch to the batch it physically drew from so the
          // receipt handler can attribute the return correctly.
          newSend.batchId = consumedBatchId;
          return {
            processingSends: [newSend, ...state.processingSends],
            inventoryMovements: [movement, ...(state.inventoryMovements || [])],
            batches: updatedBatches,
          };
        }

        const currentMaterial = state.materials.find(m => m.id === data.materialId);
        const currentStock = currentMaterial?.stockPcs || 0;

        // ── Store-level guard (spec §7, §21): over-send rejected HERE — the
        // authoritative layer can never dispatch more raw pcs than are on hand.
        if (data.pcsSent <= 0 || data.pcsSent > currentStock) return state;

        const newStock = currentStock - data.pcsSent;
        const currentAtProcessor = currentMaterial?.atProcessorPcs || 0;

        let totalAdjustedPcs = 0;
        const updatedSends = state.processingSends.map(s => {
          if (adjustSendIds?.includes(s.id)) {
            const pending = s.pcsSent - s.pcsReceived;
            totalAdjustedPcs += pending;
            return { ...s, status: "Adjusted" as const, adjustedToDispatchId: newSendId, remarks: `${s.remarks || ''} (Adjusted ${pending} PCS into ${dispatchNo})` };
          }
          return s;
        });

        // Link adjusted pieces to the new dispatch so they can be received together
        newSend.pcsSent += totalAdjustedPcs;

        const updatedMaterials = state.materials.map(m =>
          m.id === data.materialId ? {
            ...m,
            stockPcs: newStock,
            atProcessorPcs: currentAtProcessor + data.pcsSent // only the new pcs being physically sent
          } : m
        );

        // The batch trail ALWAYS moves with the physical stock: if no batch was
        // selected ('Any Batch / General Stock'), consume FIFO (oldest batch
        // first) so the same economic pcs are never counted as both raw and WIP.
        const attributed = InventoryCalculationService.attributeDispatchFIFO(
          data.materialId,
          data.pcsSent,
          state.batches || [],
          data.batchId
        );
        const consumedBatchId = attributed.usedBatchIds[0] || data.batchId;
        // Mark the consumed batch as being at the target stage so the receipt
        // handler and Send form can track stage progression correctly.
        const updatedBatches = attributed.batches.map(b =>
          b.id === consumedBatchId
            ? { ...b, currentStageId: data.stageId || b.currentStageId }
            : b
        );

        const movement: InventoryMovement = {
          id: uuidv4(),
          materialId: data.materialId,
          batchId: consumedBatchId,
          date: data.date,
          referenceNo: dispatchNo,
          module: "Dispatch",
          transactionType: "OUT",
          quantity: data.pcsSent,
          runningBalance: newStock,
          remarks: data.remarks
        };

        // Link the dispatch to the batch it physically drew from (when the user
        // picked 'Any Batch', we attribute FIFO and record it for the receipt).
        newSend.batchId = consumedBatchId;

        return { 
          processingSends: [newSend, ...updatedSends],
          materials: updatedMaterials,
          inventoryMovements: [movement, ...(state.inventoryMovements || [])],
          batches: updatedBatches
        };
      }),

      addProcessingReceipt: (data) => set((state) => {
        const receiveNo = DocumentNumberingService.nextDocumentNumber(state.processingReceipts, 'receiveNo', 'REC', data.date);
        const send = state.processingSends.find(s => s.id === data.sendId);
        if (!send) return state;

        // ── Store-level guards (spec §7, §21): over-receipt and duplicate
        // receipt are rejected HERE, not just in the UI/validators, so the
        // authoritative layer can never be bypassed. The over-receipt guard
        // inherently blocks a second receipt of the same pcs (pending becomes 0).
        const pending = send.pcsSent - send.pcsReceived - (send.lossQuantity || 0);
        if (data.pcsReceived <= 0 || data.pcsReceived > pending) return state;

        // Stage-aware receipt (spec §6): only a receipt from the configured
        // FINAL stage (or a legacy stage-less receipt) produces Finished Goods
        // (WIP → finished). Intermediate receipts move WIP → WIP and must NOT
        // touch the finished counters or the batch buckets.
        const stageId = data.stageId ?? send.stageId;
        const producesFinished = InventoryCalculationService.receiptProducesFinished(stageId, state.processingStages || []);

        // Per-stage billing (spec §9, §10): per_piece = qty × rate;
        // per_kg = qty × weightPerPiece(kg) × rate (e.g. 32 KG × Rs 32 = Rs 1,024).
        const stage = (state.processingStages || []).find(s => s.id === stageId);
        const rateMethod = data.rateMethod ?? stage?.rateMethod ?? 'per_piece';
        const batch = send.batchId ? state.batches.find(b => b.id === send.batchId) : undefined;
        const billAmount = rateMethod === 'per_kg'
          ? data.pcsReceived * (batch?.weightPerPiece || 0) * send.ratePerPiece
          : data.pcsReceived * send.ratePerPiece;

        const newReceipt: ProcessingReceipt = {
          ...data,
          id: uuidv4(),
          receiveNo,
          billAmount,
          billedStatus: "Unbilled",
          stageId,
          rateMethod,
          billingUnit: data.billingUnit ?? stage?.billingUnit,
        };

        const updatedSends = state.processingSends.map(s => {
          if (s.id === data.sendId) {
            const newReceived = s.pcsReceived + data.pcsReceived;
            const status = newReceived >= s.pcsSent ? 'Closed' : (newReceived > 0 ? 'Partial' : 'Pending');
            return { ...s, pcsReceived: newReceived, status: status as "Closed" | "Partial" | "Pending" | "Adjusted" };
          }
          return s;
        });

        const currentMaterial = state.materials.find(m => m.id === data.materialId);
        const currentAtProcessor = currentMaterial?.atProcessorPcs || 0;

        let updatedMaterials = state.materials;
        let updatedBatches = state.batches;

        if (producesFinished) {
          updatedMaterials = state.materials.map(m =>
            m.id === data.materialId ? {
              ...m,
              atProcessorPcs: Math.max(0, currentAtProcessor - data.pcsReceived),
              processedStockPcs: m.processedStockPcs + data.pcsReceived
            } : m
          );

          // Move the received pcs from the WIP stage to the finished stage so
          // finished stock is valued at the actual purchase rate of the batch it
          // was dispatched from. The batch trail ALWAYS moves in lockstep with the
          // material counters (FIFO, preferring the send's batch) so the same pcs
          // are never counted as both WIP and finished goods.
          updatedBatches = InventoryCalculationService.attributeReceiptFIFO(
            data.materialId,
            data.pcsReceived,
            state.batches || [],
            send.batchId
          );
        } else {
          // Non-final stage receipt: pieces are received back from the processor
          // and become AVAILABLE to send to the NEXT stage in the chain.
          // The batch stays at its CURRENT stage — the send handler advances
          // currentStageId when it actually dispatches to the next stage.
          // stageAvailablePcs tracks how many pcs are ready for the next send.

          // PCS remain in WIP (atProcessorPcs unchanged) — marked available for next stage.
          updatedBatches = (state.batches || []).map(b => {
            if (b.id === send.batchId) {
              return {
                ...b,
                stageAvailablePcs: (b.stageAvailablePcs || 0) + data.pcsReceived,
              };
            }
            return b;
          });
        }

        const movement: InventoryMovement = {
          id: uuidv4(),
          materialId: data.materialId,
          batchId: send.batchId,
          date: data.date,
          referenceNo: receiveNo,
          module: "Receive",
          transactionType: "IN",
          quantity: data.pcsReceived,
          runningBalance: currentMaterial ? (currentMaterial.stockPcs + currentMaterial.processedStockPcs + data.pcsReceived) : 0,
          remarks: data.remarks
        };

        return {
          processingReceipts: [newReceipt, ...state.processingReceipts],
          processingSends: updatedSends,
          materials: updatedMaterials,
          batches: updatedBatches,
          inventoryMovements: [movement, ...(state.inventoryMovements || [])]
        };
      }),

      recordProcessingLoss: (sendId, quantity, date, remarks) => set((state) => {
        const send = state.processingSends.find(s => s.id === sendId);
        if (!send) return state;

        // Explicit loss only (spec §8): pending pcs can be received OR recorded
        // as loss — never automatic. Reject over-loss and negative/zero loss.
        const pending = send.pcsSent - send.pcsReceived - (send.lossQuantity || 0);
        if (quantity <= 0 || quantity > pending) return state;

        const lossDate = date || new Date().toISOString().split('T')[0];
        const updatedSends = state.processingSends.map(s =>
          s.id === sendId ? { ...s, lossQuantity: (s.lossQuantity || 0) + quantity } : s
        );

        // The lost pcs leave the WIP stage entirely — real shrinkage. Material
        // counter and batch trail both drop by exactly `quantity` (FIFO,
        // preferring the dispatch's batch), so total inventory value decreases
        // by the lost pcs at purchase cost and is never double-counted.
        const updatedMaterials = state.materials.map(m =>
          m.id === send.materialId
            ? { ...m, atProcessorPcs: Math.max(0, (m.atProcessorPcs || 0) - quantity) }
            : m
        );
        const updatedBatches = InventoryCalculationService.attributeLossFIFO(
          send.materialId,
          quantity,
          state.batches || [],
          send.batchId
        );

        const movement: InventoryMovement = {
          id: uuidv4(),
          materialId: send.materialId,
          batchId: send.batchId,
          date: lossDate,
          referenceNo: send.dispatchNo,
          module: "Loss",
          transactionType: "OUT",
          quantity,
          runningBalance: Math.max(0, (state.materials.find(m => m.id === send.materialId)?.atProcessorPcs || 0) - quantity),
          remarks: remarks || `Loss recorded against ${send.dispatchNo}`
        };

        return {
          processingSends: updatedSends,
          materials: updatedMaterials,
          batches: updatedBatches,
          inventoryMovements: [movement, ...(state.inventoryMovements || [])]
        };
      }),

      addProcessorBill: (data) => {
        set((state) => {
        const billNo = DocumentNumberingService.nextDocumentNumber(state.processorBills, 'billNo', 'BILL', data.date);
        const receiptsToBill = state.processingReceipts.filter(r => data.receiptIds.includes(r.id));

        // ── Store-level guard: duplicate billing (spec §7, §21) — a receipt
        // that is already Billed cannot be billed again, so the authoritative
        // layer can never double-pay a stage.
        if (receiptsToBill.some(r => r.billedStatus === 'Billed')) return state;

        // Line-level billing (spec §10): when the bill carries explicit
        // per-receipt amounts (rate finalized at bill time), the total is the
        // sum of those overrides. Otherwise it defaults to each receipt's
        // computed billAmount (dispatch rate) — unchanged legacy behaviour.
        const { lineAmounts, ...billData } = data;
        const totalAmount = receiptsToBill.reduce((sum, r) => sum + (lineAmounts?.[r.id] ?? r.billAmount), 0);

        const billId = uuidv4();
        const newBill: ProcessorBill = {
          ...billData,
          id: billId,
          billNo,
          totalAmount,
          ...(lineAmounts ? { lineAmounts } : {}),
        };

        const updatedReceipts = state.processingReceipts.map(r => {
          if (data.receiptIds.includes(r.id)) {
            return { ...r, billedStatus: "Billed" as const };
          }
          return r;
        });

        // NOTE: processor balancePayable is derived from the linked account's
        // COMPLETE ledger via AccountingEngine.recomputePartyBalances() after
        // this set — never incremented here (spec §14).

        // Automatic Voucher Generation (spec §25 — resolve accounts by subtype, never by name).
        // Per the approved policy, stage bills post DR Processing Expense /
        // CR worker AP — the same mechanism as the existing processor bill.
        const processingExpenseAccount = getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Processing Expense');
        const payableAccount = state.accounts.find(a => a.linkedEntityId === data.processorId)
          || getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Accounts Payable');
        
        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;

        if (processingExpenseAccount && payableAccount) {
          const voucherId = uuidv4();
          const voucherNo = DocumentNumberingService.nextVoucherNumber(state.vouchers, 'Journal Voucher', data.date);
          
          const newVoucher: Voucher = {
            id: voucherId,
            voucherNo,
            date: data.date,
            type: 'Journal Voucher',
            referenceNo: billNo,
            sourceModule: 'Processing',
            sourceId: billId,
            narration: `Processing Bill for ${receiptsToBill.length} receipts`,
            totalDebit: totalAmount,
            totalCredit: totalAmount,
            createdAt: new Date().toISOString(),
            status: 'Posted',
            versionHistory: [{
              id: uuidv4(),
              modifiedAt: new Date().toISOString(),
              action: 'Created',
              reason: 'Auto-generated from Processing Bill'
            }]
          };
          
          const debitEntry: JournalEntry = {
            id: uuidv4(),
            voucherId,
            accountId: processingExpenseAccount.id,
            debit: totalAmount,
            credit: 0
          };
          
          const creditEntry: JournalEntry = {
            id: uuidv4(),
            voucherId,
            accountId: payableAccount.id,
            debit: 0,
            credit: totalAmount
          };
          
          updatedVouchers = [newVoucher, ...state.vouchers];
          updatedJournalEntries = [debitEntry, creditEntry, ...state.journalEntries];
        }

        return {
          processorBills: [newBill, ...state.processorBills],
          processingReceipts: updatedReceipts,
          vouchers: updatedVouchers,
          journalEntries: updatedJournalEntries
        };
        });
        AccountingEngine.recomputePartyBalances();
      },

      addSale: (data) => {
        set((state) => {
        const invoiceNo = DocumentNumberingService.nextDocumentNumber(state.sales, 'invoiceNo', 'INV', data.date);
        const totalAmount = data.pcsSold * data.pricePerPiece;
        
        const saleId = uuidv4();
        const newSale: Sale = {
          ...data,
          id: saleId,
          invoiceNo,
          totalAmount
        };

        const selectedProduct = state.products.find(p => p.id === data.productId);
        
        let movement: InventoryMovement | null = null;

        const updatedMaterials = state.materials.map(m => {
          if (selectedProduct && m.id === selectedProduct.materialId) {
            const newProcessed = m.processedStockPcs - data.pcsSold;
            movement = {
              id: uuidv4(),
              materialId: m.id,
              batchId: data.batchId,
              date: data.date,
              referenceNo: invoiceNo,
              module: "Sale",
              transactionType: "OUT",
              quantity: data.pcsSold,
              runningBalance: newProcessed, // processed-stock balance after this sale
              remarks: `Sold as product: ${selectedProduct.name}`
            };
            return { ...m, processedStockPcs: newProcessed };
          }
          return m;
        });

        // NOTE: the customer's balanceReceivable is derived from the linked
        // account's COMPLETE ledger via AccountingEngine.recomputePartyBalances()
        // after this set — never incremented here (spec §14).
        
        const nextMovements = movement ? [movement, ...(state.inventoryMovements || [])] : (state.inventoryMovements || []);

        // Automatic Voucher Generation (spec §25 — resolve accounts by subtype, never by name)
        const receivableAccount = state.accounts.find(a => a.linkedEntityId === data.customerId)
          || getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Accounts Receivable');
        const salesAccount = getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Sales');
        
        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;

        if (receivableAccount && salesAccount) {
          const voucherId = uuidv4();
          const voucherNo = DocumentNumberingService.nextVoucherNumber(state.vouchers, 'Sales Voucher', data.date);
          
          // COGS at ACTUAL purchase cost, recognized at the moment of sale — FIFO
          // across the batches that produced the finished goods (oldest batch
          // first, each at its own purchase rate). Profit = selling − purchase.
          const fifo = selectedProduct?.materialId
            ? InventoryCalculationService.getFIFOCOGSForSale(selectedProduct.materialId, data.pcsSold, state.batches || [])
            : { cogs: 0 };
          const cogsAmount = fifo.cogs;
          const cogsAccount = getSystemCOGSAccount(state.accounts, state.accountSubtypes);
          const finishedGoodsAccount = getSystemInventoryAccount(state.accounts, state.accountSubtypes, 'Finished Goods Inventory');
          const hasCogsLeg = cogsAmount > 0 && !!cogsAccount && !!finishedGoodsAccount;
          const voucherTotal = totalAmount + (hasCogsLeg ? cogsAmount : 0);
          
          const newVoucher: Voucher = {
            id: voucherId,
            voucherNo,
            date: data.date,
            type: 'Sales Voucher',
            referenceNo: invoiceNo,
            sourceModule: 'Sales',
            sourceId: saleId,
            narration: `Sale Invoice for ${data.pcsSold} PCS`,
            totalDebit: voucherTotal,
            totalCredit: voucherTotal,
            createdAt: new Date().toISOString(),
            status: 'Posted',
            versionHistory: [{
              id: uuidv4(),
              modifiedAt: new Date().toISOString(),
              action: 'Created',
              reason: 'Auto-generated from Sale'
            }]
          };
          
          const saleEntries: JournalEntry[] = [
            { id: uuidv4(), voucherId, accountId: receivableAccount.id, debit: totalAmount, credit: 0 },
            { id: uuidv4(), voucherId, accountId: salesAccount.id, debit: 0, credit: totalAmount }
          ];
          if (hasCogsLeg) {
            saleEntries.push(
              { id: uuidv4(), voucherId, accountId: cogsAccount!.id, debit: cogsAmount, credit: 0 },
              { id: uuidv4(), voucherId, accountId: finishedGoodsAccount!.id, debit: 0, credit: cogsAmount }
            );
          }
          
          updatedVouchers = [newVoucher, ...state.vouchers];
          updatedJournalEntries = [...saleEntries, ...state.journalEntries];
        }

        // Reduce finished pcs on the actual batches sold (FIFO — oldest first) so
        // each remaining batch keeps its own purchase-rate cost for valuation.
        const updatedBatches = selectedProduct?.materialId
          ? InventoryCalculationService.consumeFinishedFIFO(selectedProduct.materialId, data.pcsSold, state.batches || [])
          : state.batches;

        return {
          sales: [newSale, ...state.sales],
          materials: updatedMaterials,
          batches: updatedBatches,
          inventoryMovements: nextMovements,
          vouchers: updatedVouchers,
          journalEntries: updatedJournalEntries
        };
        });
        AccountingEngine.recomputePartyBalances();
      }
    })),
    {
      name: 'erp-storage',
      version: 3,
      // skipHydration:true prevents Zustand from calling getItem() during store creation
      // (DB isn't initialized yet at that point). Instead, bootstrap() in main.tsx
      // manually rehydrates the store after DB init by reading key_value_store directly
      // (running migrateERPState there).
      skipHydration: true,
      migrate: (persisted: any, version: number) => {
        if (version < 3) {
          return migrateERPState(persisted);
        }
        return persisted as ERPState;
      },
      storage: createJSONStorage(() => SQLiteStorageAdapter)
    }
  )
);
