import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SQLiteStorageAdapter } from '../database/sqlite/SQLiteStorageAdapter';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';
import { getSystemAccountBySubtype, getSystemCOGSAccount, getSystemInventoryAccount } from '../lib/accounting/accountClassification';
import { DocumentNumberingService } from '../lib/business/DocumentNumberingService';
import { batchAvailableAtSource, batchTotalPcs, InsufficientStockError, InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { UnitConversionService } from '../lib/business/UnitConversionService';
import { AppError } from '../lib/errorHandler';import {Account, 
  AccountSubtype, 
  Batch, 
  CompanySettings, Customer, DocumentSettings, InventoryMovement, JournalEntry, 
  MaterialCategory, ProcessingReceipt, ProcessingSend, ProcessingStage,Processor, ProcessorBill, Product, 
  Purchase, RawMaterial, Sale,Supplier, Voucher 
} from '../types/erp';
import { createCRUDActions } from './crudActions';
import { databaseMiddleware } from './databaseMiddleware';
import { migrateERPState } from './erpMigration';

/** LAW 3 helper: total pcs across every bucket of one material's Active batches. */
function batchTotalPcsBatch(materialId: string, batches: Batch[]): number {
  return batches
    .filter(b => b.materialId === materialId && b.status === 'Active')
    .reduce((s, b) => s + batchTotalPcs(b), 0);
}

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

      addProcessingSend: (data, adjustSendIds) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            // ── Stage-worker guard: a processor assigned to a stage can only
            // work that stage (general workers can work any).
            const worker = state.processors.find(p => p.id === data.processorId);
            if (worker?.stageId && data.stageId && worker.stageId !== data.stageId) {
              throw new AppError('This processor does not work the selected stage.');
            }
            if (!data.pcsSent || data.pcsSent <= 0) {
              throw new AppError('Quantity must be a positive whole number of PCS.');
            }

            const dispatchNo = DocumentNumberingService.nextDocumentNumber(state.processingSends, 'dispatchNo', 'DSP', data.date);
            const newSendId = uuidv4();

            const newSend: ProcessingSend = {
              ...data,
              id: newSendId,
              dispatchNo,
              pcsReceived: 0,
              status: 'Pending'
            };

            const stages = state.processingStages || [];
            const consumesRaw = InventoryCalculationService.sendConsumesRaw(data.stageId, stages);
            // ══ MOVEMENT MAP: the ONLY legal source bucket for this target ══
            // Stage 1 draws RAW; stage N draws the availability produced by
            // stage N−1. Anything else is rejected — stage-skipping and
            // re-processing already-processed pcs are physically impossible.
            const sourceStageId = consumesRaw
              ? 'raw' as const
              : InventoryCalculationService.requiredSourceForTarget(data.stageId!, stages);

            let updatedBatches: Batch[] = state.batches || [];
            let consumedBatchId = data.batchId;

            // Adjusted sends merge their pending pcs into this dispatch. Only
            // the PHYSICAL pcs move here — adjusted pcs are already in WIP
            // (their original dispatch moved them); merging reassigns their
            // pending receipt target without touching any bucket twice.
            let totalAdjustedPcs = 0;
            const updatedSends = state.processingSends.map(s => {
              if (adjustSendIds?.includes(s.id)) {
                const adjPending = s.pcsSent - s.pcsReceived;
                totalAdjustedPcs += adjPending;
                return { ...s, status: "Adjusted" as const, adjustedToDispatchId: newSendId, remarks: `${s.remarks || ''} (Adjusted ${adjPending} PCS into ${dispatchNo})` };
              }
              return s;
            });

            try {
              const res = consumesRaw
                ? InventoryCalculationService.moveRawToProcessor(data.materialId, data.pcsSent, updatedBatches, data.batchId || undefined)
                : InventoryCalculationService.moveAvailableToProcessor(data.materialId, sourceStageId, data.pcsSent, updatedBatches, data.batchId || undefined);
              updatedBatches = res.batches;
              consumedBatchId = res.usedBatchIds[0] || data.batchId;
              // Display metadata via the shared helper — identical to replay.
              updatedBatches = InventoryCalculationService.advanceDrainedBatches(
                updatedBatches, res.usedBatchIds, data.stageId, consumesRaw
              );
            } catch (e) {
              if (e instanceof InsufficientStockError) {
                const available = (state.batches || [])
                  .filter(b => b.materialId === data.materialId && b.status === 'Active')
                  .reduce((s, b) => s + (consumesRaw
                    ? InventoryCalculationService.batchRawAvailable(b)
                    : batchAvailableAtSource(b, sourceStageId)), 0);
                throw new AppError(`Only ${available} PCS are available${consumesRaw ? ' in raw stock' : ' from this stage'}.`);
              }
              throw e;
            }

            newSend.pcsSent = data.pcsSent + totalAdjustedPcs;
            newSend.batchId = consumedBatchId;

            const currentMaterial = state.materials.find(m => m.id === data.materialId);
            const currentStock = currentMaterial?.stockPcs || 0;
            const currentAtProcessor = currentMaterial?.atProcessorPcs || 0;

            const movement: InventoryMovement = {
              id: uuidv4(),
              materialId: data.materialId,
              batchId: consumedBatchId,
              date: data.date,
              referenceNo: dispatchNo,
              module: "Dispatch",
              transactionType: "OUT",
              quantity: newSend.pcsSent,
              runningBalance: batchTotalPcsBatch(data.materialId, updatedBatches),
              remarks: data.remarks
            };

            // LAW 3: the whole update commits only if pcs are conserved.
            InventoryCalculationService.assertConservation(data.materialId, state.batches || [], updatedBatches);

            return {
              processingSends: [newSend, ...updatedSends],
              materials: state.materials.map(m =>
                m.id === data.materialId
                  ? {
                      ...m,
                      stockPcs: consumesRaw ? Math.max(0, currentStock - data.pcsSent) : m.stockPcs,
                      // Pipeline semantics: a RAW send adds new pcs to the
                      // processing pipeline. An intermediate send moves pcs
                      // availability → at-processor — both already counted in
                      // the pipeline, so the counter does not move.
                      atProcessorPcs: consumesRaw ? currentAtProcessor + data.pcsSent : currentAtProcessor,
                    }
                  : m
              ),
              inventoryMovements: [movement, ...(state.inventoryMovements || [])],
              batches: updatedBatches,
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Dispatch failed.');
            return state;
          }
        });
        if (failure) throw failure;
      },
      addProcessingReceipt: (data) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            const receiveNo = DocumentNumberingService.nextDocumentNumber(state.processingReceipts, 'receiveNo', 'REC', data.date);
            const send = state.processingSends.find(s => s.id === data.sendId);
            if (!send) throw new AppError('Dispatch not found.');

            // ── Guards: over-receipt and duplicate receipt are rejected HERE,
            // not just in the UI, so the authoritative layer can never be
            // bypassed. Pending is ALWAYS computed, never stored (LAW 2).
            const pending = send.pcsSent - send.pcsReceived - (send.lossQuantity || 0);
            if (!data.pcsReceived || data.pcsReceived <= 0) throw new AppError('Quantity must be a positive whole number of PCS.');
            if (data.pcsReceived > pending) {
              throw new AppError(pending <= 0
                ? 'This dispatch is already fully received.'
                : `Only ${pending} PCS are pending on this dispatch.`);
            }

            const stageId = data.stageId ?? send.stageId;
            const stages = state.processingStages || [];
            const producesFinished = InventoryCalculationService.receiptProducesFinished(stageId, stages);

            // Per-stage billing: per_piece = qty × rate; per_kg = qty × weightPerPiece(kg) × rate.
            const stage = stages.find(s => s.id === stageId);
            const rateMethod = data.rateMethod ?? stage?.rateMethod ?? 'per_piece';
            const batch = send.batchId ? state.batches.find(b => b.id === send.batchId) : undefined;
            const billAmount = InventoryCalculationService.computeReceiptBillAmount(data.pcsReceived, rateMethod, send, batch, stage);

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
            let updatedBatches: Batch[] = state.batches || [];

            if (producesFinished) {
              // LAW 2 transfer: AT_final → FINISHED.
              updatedMaterials = state.materials.map(m =>
                m.id === data.materialId ? {
                  ...m,
                  atProcessorPcs: Math.max(0, currentAtProcessor - data.pcsReceived),
                  processedStockPcs: (m.processedStockPcs || 0) + data.pcsReceived
                } : m
              );
              updatedBatches = InventoryCalculationService.attributeReceiptFIFO(
                data.materialId, data.pcsReceived, updatedBatches, send.batchId || undefined
              );
            } else {
              // LAW 2 transfer: AT_stage → AVAILABLE(source = this stage).
              // atProcessorPcs DECREASES — buckets stay disjoint so the same
              // pcs are never counted in two places, and pcs that came back
              // from DIFFERENT stages keep SEPARATE availability entries
              // (they can never be merged or routed to the wrong next stage).
              try {
                updatedBatches = InventoryCalculationService.moveProcessorToAvailable(
                  data.materialId, stageId || 'legacy', data.pcsReceived, updatedBatches, send.batchId || undefined
                ).batches;
              } catch (e) {
                if (e instanceof InsufficientStockError) {
                  throw new AppError("This dispatch's pcs are not traceable in the batch trail — receive was rolled back.");
                }
                throw e;
              }
              // Material roll-up semantics: atProcessorPcs counts the whole
              // processing pipeline (at a processor OR waiting for the next
              // stage). The pcs moved AT→availability, both counted — the
              // pipeline total is unchanged, so the material counter does not
              // move here (same basis as syncMaterialCounters).
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
              runningBalance: batchTotalPcsBatch(data.materialId, updatedBatches),
              remarks: data.remarks
            };

            // LAW 3: the whole update commits only if pcs are conserved.
            InventoryCalculationService.assertConservation(data.materialId, state.batches || [], updatedBatches);

            return {
              processingReceipts: [newReceipt, ...state.processingReceipts],
              processingSends: updatedSends,
              materials: updatedMaterials,
              batches: updatedBatches,
              inventoryMovements: [movement, ...(state.inventoryMovements || [])]
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Receive failed.');
            return state;
          }
        });
        if (failure) throw failure;
      },
      recordProcessingLoss: (sendId, quantity, date, remarks) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            const send = state.processingSends.find(s => s.id === sendId);
            if (!send) throw new AppError('Dispatch not found.');

            // Explicit loss only: pending pcs can be received OR recorded as
            // loss — never automatic. Reject over-loss and non-positive loss.
            const pending = send.pcsSent - send.pcsReceived - (send.lossQuantity || 0);
            if (!quantity || quantity <= 0) throw new AppError('Loss quantity must be a positive whole number of PCS.');
            if (quantity > pending) throw new AppError(`Only ${pending} PCS are pending on this dispatch.`);

            const lossDate = date || new Date().toISOString().split('T')[0];
            const updatedSends = state.processingSends.map(s =>
              s.id === sendId ? { ...s, lossQuantity: (s.lossQuantity || 0) + quantity } : s
            );

            // LAW 2 shrinkage: the lost pcs leave the trail entirely. They may
            // sit at the processor (not yet received) or in the stage's
            // availability bucket (received back, reported lost later) —
            // consumeLoss takes them from whichever holds them.
            const { batches: updatedBatches, fromProcessor, fromAvailable } = InventoryCalculationService.consumeLoss(
              send.materialId, send.stageId, quantity, state.batches || [], send.batchId || undefined
            );
            // Pipeline semantics: the counter spans atProcessor + availability,
            // so a loss from either bucket shrinks it.
            const updatedMaterials = state.materials.map(m =>
              m.id === send.materialId
                ? { ...m, atProcessorPcs: Math.max(0, (m.atProcessorPcs || 0) - fromProcessor - fromAvailable) }
                : m
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
              runningBalance: batchTotalPcsBatch(send.materialId, updatedBatches),
              remarks: remarks || `Loss recorded against ${send.dispatchNo}`
            };

            // LAW 3 with the expected shrinkage delta — anything other than
            // exactly −quantity aborts the whole update.
            InventoryCalculationService.assertConservation(send.materialId, state.batches || [], updatedBatches, -quantity);

            return {
              processingSends: updatedSends,
              materials: updatedMaterials,
              batches: updatedBatches,
              inventoryMovements: [movement, ...(state.inventoryMovements || [])]
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Loss recording failed.');
            return state;
          }
        });
        if (failure) throw failure;
      },
      addProcessorBill: (data) => {
        set((state) => {
        const billNo = DocumentNumberingService.nextDocumentNumber(state.processorBills, 'billNo', 'BILL', data.date);
        const receiptsToBill = state.processingReceipts.filter(r => data.receiptIds.includes(r.id));

        // ── Store-level guard: duplicate billing (spec §7, §21) — a receipt
        // that is already Billed cannot be billed again, so the authoritative
        // layer can never double-pay a stage. LOUD rejection: throws so no
        // silent no-op can hide it (uniform with every other guard).
        if (receiptsToBill.some(r => r.billedStatus === 'Billed')) {
          throw new AppError('One or more receipts on this bill are already billed — duplicate billing is blocked.');
        }

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
