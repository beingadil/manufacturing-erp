import { DocumentNumberingService } from '../lib/business/DocumentNumberingService';
import { UnitConversionService } from '../lib/business/UnitConversionService';
import { createCRUDActions } from './crudActions';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SQLiteStorageAdapter } from '../database/sqlite/SQLiteStorageAdapter';
import { v4 as uuidv4 } from 'uuid';
import { databaseMiddleware } from './databaseMiddleware';
import { 
  MaterialCategory, RawMaterial, Processor, Supplier, Customer, 
  Purchase, ProcessingSend, ProcessingReceipt, Product, Sale, LedgerEntry,
  Batch, InventoryMovement, ProcessorBill,
  AccountSubtype, Account, Voucher, JournalEntry, AccountType,
  CompanySettings, DocumentSettings
} from '../types/erp';

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
  products: Product[];
  sales: Sale[];
  ledgerEntries: LedgerEntry[];
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
  addSale: (data: Omit<Sale, 'id' | 'invoiceNo' | 'totalAmount'>) => void;
  
  // Accounting Actions
  addAccountSubtype: (data: Omit<AccountSubtype, 'id'>) => string;
  addAccount: (data: Omit<Account, 'id' | 'code'> & { code?: string }) => string;
  addVoucher: (voucher: Omit<Voucher, 'id' | 'voucherNo' | 'createdAt'>, entries: Omit<JournalEntry, 'id' | 'voucherId'>[]) => string;
  updateVoucher: (voucherId: string, voucherData: Partial<Voucher>, newEntries: Omit<JournalEntry, 'id' | 'voucherId'>[]) => void;
  deleteVoucher: (voucherId: string) => void;
  wipeAllData: () => void;
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
      products: [],
      sales: [],
      ledgerEntries: [],
      batches: [],
      inventoryMovements: [],
      
      accountSubtypes: [],
      accounts: [],
      vouchers: [],
      journalEntries: [],

            ...createCRUDActions(set, get),

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
          products: [],
          sales: [],
          ledgerEntries: [],
          batches: [],
          inventoryMovements: [],
          accountSubtypes: [],
          accounts: [],
          vouchers: [],
          journalEntries: []
        });
      },
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
        
        // Auto-generate voucher number with yearly reset
        const prefix = DocumentNumberingService.getVoucherPrefix(voucherData.type);
        const yearCount = DocumentNumberingService.countByType(state.vouchers, voucherData.type);
        const voucherNo = DocumentNumberingService.generateVoucherNumber(prefix, yearCount);
        
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

        const updatedVouchers = state.vouchers.map(v => {
          if (v.id === voucherId) {
            const auditEntry = {
              id: uuidv4(),
              modifiedAt: new Date().toISOString(),
              action: 'Updated' as const,
              reason: 'User Edit',
              previousValues: { ...v, versionHistory: undefined },
              updatedValues: { ...voucherData }
            };
            return {
              ...v,
              ...voucherData,
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

      addCategory: (data) => {
        const id = uuidv4();
        set((state) => ({ categories: [{ ...data, id }, ...state.categories] }));
        return id;
      },

      updateCategory: (id, data) => set((state) => ({
        categories: state.categories.map(c => c.id === id ? { ...c, ...data } : c)
      })),

      addProcessor: (data) => {
        const id = uuidv4();
        set((state) => {
          const accountSubtype = state.accountSubtypes.find(s => s.name === 'Accounts Payable');
          const sameTypeCount = state.accounts.filter(a => a.type === 'Liabilities').length;
          const code = DocumentNumberingService.generateAccountCode('Liabilities', sameTypeCount);
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
            linkedEntityId: id
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
            linkedEntityId: id
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
            linkedEntityId: id
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

      addPurchase: (data) => set((state) => {
        const purchaseNo = DocumentNumberingService.generateDocumentNumber('PO', state.purchases.length);
        const weightInKg = UnitConversionService.convertToKg(data.weight, data.weightUnit);
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

        const updatedSuppliers = state.suppliers.map(s => 
          s.id === data.supplierId ? { ...s, balancePayable: s.balancePayable + amount } : s
        );

        const ledgerEntry: LedgerEntry = {
          id: uuidv4(),
          date: data.date,
          partyId: data.supplierId,
          partyType: 'Supplier',
          type: 'Credit',
          amount: amount,
          referenceNo: purchaseNo,
          description: `Purchase of ${data.weight} ${data.weightUnit}`
        };

        // Automatic Voucher Generation
        const purchaseAccount = state.accounts.find(a => a.name === 'Purchases' && a.isSystem);
        const payableAccount = state.accounts.find(a => a.linkedEntityId === data.supplierId) 
          || state.accounts.find(a => a.name === 'Accounts Payable' && a.isSystem);
        
        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;

        if (purchaseAccount && payableAccount) {
          const voucherId = uuidv4();
          const prefix = DocumentNumberingService.getVoucherPrefix('Purchase Voucher');
          const yearCount = DocumentNumberingService.countByType(state.vouchers, 'Purchase Voucher');
          const voucherNo = DocumentNumberingService.generateVoucherNumber(prefix, yearCount);
          
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
          suppliers: updatedSuppliers,
          ledgerEntries: [ledgerEntry, ...state.ledgerEntries],
          vouchers: updatedVouchers,
          journalEntries: updatedJournalEntries
        };
      }),

      addProcessingSend: (data, adjustSendIds) => set((state) => {
        const dispatchNo = DocumentNumberingService.generateDocumentNumber('DSP', state.processingSends.length);
        const newSendId = uuidv4();
        
        const newSend: ProcessingSend = {
          ...data,
          id: newSendId,
          dispatchNo,
          pcsReceived: 0,
          status: 'Pending'
        };

        const currentMaterial = state.materials.find(m => m.id === data.materialId);
        const currentStock = currentMaterial?.stockPcs || 0;
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

        let updatedBatches = state.batches;
        if (data.batchId) {
          updatedBatches = (state.batches || []).map(b => 
            b.id === data.batchId ? {
              ...b,
              remainingPcs: b.remainingPcs - data.pcsSent
            } : b
          );
        }

        const movement: InventoryMovement = {
          id: uuidv4(),
          materialId: data.materialId,
          batchId: data.batchId,
          date: data.date,
          referenceNo: dispatchNo,
          module: "Dispatch",
          transactionType: "OUT",
          quantity: data.pcsSent,
          runningBalance: newStock,
          remarks: data.remarks
        };

        return { 
          processingSends: [newSend, ...updatedSends],
          materials: updatedMaterials,
          inventoryMovements: [movement, ...(state.inventoryMovements || [])],
          batches: updatedBatches
        };
      }),

      addProcessingReceipt: (data) => set((state) => {
        const receiveNo = DocumentNumberingService.generateDocumentNumber('REC', state.processingReceipts.length);
        const send = state.processingSends.find(s => s.id === data.sendId);
        if (!send) return state;

        const billAmount = data.pcsReceived * send.ratePerPiece;
        
        const newReceipt: ProcessingReceipt = {
          ...data,
          id: uuidv4(),
          receiveNo,
          billAmount,
          billedStatus: "Unbilled"
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

        const updatedMaterials = state.materials.map(m =>
          m.id === data.materialId ? {
            ...m,
            atProcessorPcs: Math.max(0, currentAtProcessor - data.pcsReceived),
            processedStockPcs: m.processedStockPcs + data.pcsReceived
          } : m
        );

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
          inventoryMovements: [movement, ...(state.inventoryMovements || [])]
        };
      }),

      addProcessorBill: (data) => set((state) => {
        const billNo = DocumentNumberingService.generateDocumentNumber('BILL', state.processorBills.length);
        const receiptsToBill = state.processingReceipts.filter(r => data.receiptIds.includes(r.id));
        const totalAmount = receiptsToBill.reduce((sum, r) => sum + r.billAmount, 0);

        const billId = uuidv4();
        const newBill: ProcessorBill = {
          ...data,
          id: billId,
          billNo,
          totalAmount
        };

        const updatedReceipts = state.processingReceipts.map(r => {
          if (data.receiptIds.includes(r.id)) {
            return { ...r, billedStatus: "Billed" as const };
          }
          return r;
        });

        const updatedProcessors = state.processors.map(p =>
          p.id === data.processorId ? { ...p, balancePayable: p.balancePayable + totalAmount } : p
        );

        const ledgerEntry: LedgerEntry = {
          id: uuidv4(),
          date: data.date,
          partyId: data.processorId,
          partyType: 'Processor',
          type: 'Credit',
          amount: totalAmount,
          referenceNo: billNo,
          description: `Processing Bill for ${receiptsToBill.length} receipts`
        };

        // Automatic Voucher Generation
        const processingExpenseAccount = state.accounts.find(a => a.name === 'Processing Expense' && a.isSystem);
        const payableAccount = state.accounts.find(a => a.linkedEntityId === data.processorId)
          || state.accounts.find(a => a.name === 'Accounts Payable' && a.isSystem);
        
        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;

        if (processingExpenseAccount && payableAccount) {
          const voucherId = uuidv4();
          const prefix = DocumentNumberingService.getVoucherPrefix('Journal Voucher');
          const yearCount = DocumentNumberingService.countByType(state.vouchers, 'Journal Voucher');
          const voucherNo = DocumentNumberingService.generateVoucherNumber(prefix, yearCount);
          
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
          processors: updatedProcessors,
          ledgerEntries: [ledgerEntry, ...state.ledgerEntries],
          vouchers: updatedVouchers,
          journalEntries: updatedJournalEntries
        };
      }),

      addSale: (data) => set((state) => {
        const invoiceNo = DocumentNumberingService.generateDocumentNumber('INV', state.sales.length);
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
              runningBalance: m.stockPcs, // keeping stockPcs as the main balance for raw materials
              remarks: `Sold as product: ${selectedProduct.name}`
            };
            return { ...m, processedStockPcs: newProcessed };
          }
          return m;
        });

        const updatedCustomers = state.customers.map(c => 
          c.id === data.customerId ? { ...c, balanceReceivable: c.balanceReceivable + totalAmount } : c
        );

        const ledgerEntry: LedgerEntry = {
          id: uuidv4(),
          date: data.date,
          partyId: data.customerId,
          partyType: 'Customer',
          type: 'Debit',
          amount: totalAmount,
          referenceNo: invoiceNo,
          description: `Sale Invoice for ${data.pcsSold} PCS`
        };
        
        const nextMovements = movement ? [movement, ...(state.inventoryMovements || [])] : (state.inventoryMovements || []);

        // Automatic Voucher Generation
        const receivableAccount = state.accounts.find(a => a.linkedEntityId === data.customerId)
          || state.accounts.find(a => a.name === 'Accounts Receivable' && a.isSystem);
        const salesAccount = state.accounts.find(a => a.name === 'Sales Revenue' && a.isSystem);
        
        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;

        if (receivableAccount && salesAccount) {
          const voucherId = uuidv4();
          const prefix = DocumentNumberingService.getVoucherPrefix('Sales Voucher');
          const yearCount = DocumentNumberingService.countByType(state.vouchers, 'Sales Voucher');
          const voucherNo = DocumentNumberingService.generateVoucherNumber(prefix, yearCount);
          
          const newVoucher: Voucher = {
            id: voucherId,
            voucherNo,
            date: data.date,
            type: 'Sales Voucher',
            referenceNo: invoiceNo,
            sourceModule: 'Sales',
            sourceId: saleId,
            narration: `Sale Invoice for ${data.pcsSold} PCS`,
            totalDebit: totalAmount,
            totalCredit: totalAmount,
            createdAt: new Date().toISOString(),
            status: 'Posted',
            versionHistory: [{
              id: uuidv4(),
              modifiedAt: new Date().toISOString(),
              action: 'Created',
              reason: 'Auto-generated from Sale'
            }]
          };
          
          const debitEntry: JournalEntry = {
            id: uuidv4(),
            voucherId,
            accountId: receivableAccount.id,
            debit: totalAmount,
            credit: 0
          };
          
          const creditEntry: JournalEntry = {
            id: uuidv4(),
            voucherId,
            accountId: salesAccount.id,
            debit: 0,
            credit: totalAmount
          };
          
          updatedVouchers = [newVoucher, ...state.vouchers];
          updatedJournalEntries = [debitEntry, creditEntry, ...state.journalEntries];
        }

        return {
          sales: [newSale, ...state.sales],
          materials: updatedMaterials,
          customers: updatedCustomers,
          ledgerEntries: [ledgerEntry, ...state.ledgerEntries],
          inventoryMovements: nextMovements,
          vouchers: updatedVouchers,
          journalEntries: updatedJournalEntries
        };
      })
    })),
    {
      name: 'erp-storage',
      version: 2,
      // skipHydration:true prevents Zustand from calling getItem() during store creation
      // (DB isn't initialized yet at that point). Instead, bootstrap() in main.tsx
      // manually rehydrates the store after DB init by reading key_value_store directly.
      skipHydration: true,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          return {
            ...persisted,
            inventoryMovements: persisted.inventoryMovements || [],
            batches: persisted.batches || [],
          };
        }
        return persisted as ERPState;
      },
      storage: createJSONStorage(() => SQLiteStorageAdapter)
    }
  )
);
