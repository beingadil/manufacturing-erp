import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SQLiteStorageAdapter } from '../database/sqlite/SQLiteStorageAdapter';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';
import { getSystemAccountBySubtype, getSystemCOGSAccount, getSystemInventoryAccount } from '../lib/accounting/accountClassification';
import {
  buildManufacturingCompletion,
  buildManufacturedSale,
  buildProcessingCostReclassification,
  buildProcessingLoss,
  buildProcessorBill,
  buildReceiptAccrual,
  PostingLine,
} from '../lib/accounting/manufacturingPosting';
import { previewProcessingCostReclassification } from '../lib/accounting/processingCostReclassification';
import { DocumentNumberingService } from '../lib/business/DocumentNumberingService';
import { batchAvailableAtSource, batchTotalPcs, InsufficientStockError, InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import {
  buildableQty,
  consumeComponentsForManufacturing,
  consumeLotsFIFO,
  isManufacturingEnabled,
  manufacturingOrderCost,
  snapshotBom,
} from '../lib/business/ManufacturingService';
import { findMaterialCodeConflict, isAssembled, perUnitRequirement, roundQty, validateComponents } from '../lib/business/ProductAssemblyService';
import { UnitConversionService } from '../lib/business/UnitConversionService';
import { AppError } from '../lib/errorHandler';import {Account, 
  AccountSubtype, 
  Batch, 
  CompanySettings, Customer, DocumentSettings, FinishedGoodsLot, InventoryMovement, JournalEntry, 
  ManufacturingOrder, MaterialCategory, ProcessingCostReclassification, ProcessingLossRecord, ProcessingReceipt, ProcessingSend, ProcessingStage,Processor, ProcessorBill, Product, 
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
  /** Persisted data-contract version. 4 = manufacturing/FG-lot redesign. */
  stateSchemaVersion?: number;
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
  manufacturingOrders: ManufacturingOrder[];
  finishedGoodsLots: FinishedGoodsLot[];
  processingLosses: ProcessingLossRecord[];
  /** One-time marker set after historical processing cost is capitalized. */
  processingCostReclassification?: ProcessingCostReclassification;
  
  // Accounting
  accountSubtypes: AccountSubtype[];
  accounts: Account[];
  vouchers: Voucher[];
  addModuleItem: (table: string, item: any) => void;
  updateModuleItem: (table: string, id: string, item: any) => void;
  removeModuleItem: (table: string, id: string) => void;
  journalEntries: JournalEntry[];

  // ── Product assembly ─────────────────────────────────────────────────────
  // A product made from several materials lists them here (Product.components);
  // a product made from one material just points at it (Product.materialId).
  // There is no separate recipe module — the recipe IS the product record.
  
  // Entity Add Actions
  addCategory: (data: Omit<MaterialCategory, 'id'>) => string;
  updateCategory: (id: string, data: Partial<MaterialCategory>) => void;
  addProcessingStage: (data: Omit<ProcessingStage, 'id'>) => string;
  updateProcessingStage: (id: string, data: Partial<ProcessingStage>) => void;
  deleteProcessingStage: (id: string) => void;
  reorderProcessingStages: (orderedIds: string[]) => void;
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
  /** Delete a processor only when nothing references it (jobs, bills, ledger). Referenced processors are deactivated instead. */
  deleteProcessor: (id: string) => { deleted: boolean; reason?: string };
  deleteAccount: (id: string) => void;

  addPurchase: (data: Omit<Purchase, 'id' | 'purchaseNo' | 'calculatedPcs' | 'amount'>) => void;
  addProcessingSend: (data: Omit<ProcessingSend, 'id' | 'dispatchNo' | 'pcsReceived' | 'status'>, adjustSendIds?: string[]) => void;
  addProcessingReceipt: (data: Omit<ProcessingReceipt, 'id' | 'receiveNo' | 'billAmount'>) => void;
  addProcessorBill: (data: Omit<ProcessorBill, 'id' | 'billNo' | 'totalAmount'>) => void;
  recordProcessingLoss: (sendId: string, quantity: number, date?: string, remarks?: string) => void;
  addSale: (data: Omit<Sale, 'id' | 'invoiceNo' | 'totalAmount'>) => void;
  addSaleGroup: (data: SaleGroupData) => void;

  // Manufacturing (v4)
  addManufacturingOrder: (data: {
    productId: string;
    date: string;
    plannedQty: number;
    productionCost?: number;
    remarks?: string;
  }) => string;
  updateManufacturingOrder: (id: string, data: Partial<Pick<ManufacturingOrder, 'date' | 'plannedQty' | 'productionCost' | 'remarks'>>) => void;
  startManufacturingOrder: (id: string) => void;
  completeManufacturingOrder: (id: string, data?: { finishedQty?: number; productionCost?: number; date?: string; remarks?: string }) => void;
  /**
   * One tap from the Products page: create and complete a manufacturing order
   * atomically for as many finishable units as the stock allows. The order is
   * created as Planned and completed in the same call; if completion fails
   * (e.g. a part runs short between the click and the consume), the Planned
   * shell is rolled back so no orphan orders ever appear.
   * Returns the finished-goods lot id + order number produced.
   */
  produceForProduct: (input: { productId: string; finishedQty?: number; date?: string; productionCost?: number; remarks?: string }) => { orderId: string; orderNo: string; lotId: string; lotNo: string; finishedQty: number };
  cancelManufacturingOrder: (id: string) => void;
  deleteManufacturingOrder: (id: string) => void;
  /** Capitalise the on-hand share of processing charges expensed before v4. */
  reclassifyProcessingCosts: () => { amount: number; voucherId: string; voucherNo: string };
  
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

export interface SaleGroupLine {
  productId: string;
  pcsSold: number;
  pricePerPiece: number;
  batchId?: string;
}

export interface SaleGroupData {
  customerId: string;
  date: string;
  lines: SaleGroupLine[];
}

/**
 * Build one posted voucher + its journal entries from an already-balanced
 * posting list. Callers pass the vouchers they have accumulated so far, so a
 * multi-line document gets gap-free sequential voucher numbers.
 */
function createVoucher(
  existingVouchers: Voucher[],
  opts: {
    date: string;
    type: Voucher['type'];
    referenceNo: string;
    sourceModule: Voucher['sourceModule'];
    sourceId: string;
    narration: string;
    lines: PostingLine[];
    createdBy?: string;
  },
): { voucher: Voucher; entries: JournalEntry[] } | null {
  const lines = opts.lines.filter(l => Math.abs(l.debit) > 0.0001 || Math.abs(l.credit) > 0.0001);
  if (lines.length === 0) return null;
  const total = Math.round(lines.reduce((sum, l) => sum + l.debit, 0) * 100) / 100;
  const voucherId = uuidv4();
  const voucher: Voucher = {
    id: voucherId,
    voucherNo: DocumentNumberingService.nextVoucherNumber(existingVouchers, opts.type, opts.date),
    date: opts.date,
    type: opts.type,
    referenceNo: opts.referenceNo,
    sourceModule: opts.sourceModule,
    sourceId: opts.sourceId,
    narration: opts.narration,
    totalDebit: total,
    totalCredit: total,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString(),
    status: 'Posted',
    versionHistory: [{
      id: uuidv4(),
      modifiedAt: new Date().toISOString(),
      action: 'Created',
      reason: 'Auto-generated',
    }],
  };
  const entries: JournalEntry[] = lines.map(l => ({
    id: uuidv4(),
    voucherId,
    accountId: l.accountId,
    debit: l.debit,
    credit: l.credit,
    narration: l.narration,
  }));
  return { voucher, entries };
}

/**
 * Per-module wipe map. Each id clears exactly the store keys that belong to
 * that module — master-data modules (categories, materials, ...) clear only
 * their own records, while transaction modules also clear their ledger trail.
 */
export const MODULE_WIPE_KEYS: Record<string, (keyof ERPState)[]> = {
  categories: ['categories'],
  materials: ['materials'],
  products: ['products', 'finishedGoodsLots', 'manufacturingOrders'],
  suppliers: ['suppliers'],
  customers: ['customers'],
  processors: ['processors'],
  purchases: ['purchases'],
  sales: ['sales'],
  processing: ['processingSends', 'processingReceipts', 'processorBills', 'processingLosses'],
  manufacturing: ['manufacturingOrders', 'finishedGoodsLots'],
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
  processing: 'Processing (Sends / Receipts / Bills / Losses)',
  manufacturing: 'Manufacturing Orders & FG Lots',
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
      manufacturingOrders: [],
      finishedGoodsLots: [],
      processingLosses: [],
      
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
          manufacturingOrders: [],
          finishedGoodsLots: [],
          processingLosses: [],
          processingCostReclassification: undefined,
          accountSubtypes: [],
          accounts: [],
          vouchers: [],
          journalEntries: []
        });
      },

      wipeModules: (moduleIds) => set((state) => {
        const moduleSet = new Set(moduleIds);
        const wipeAccounting = moduleSet.has('accounting');
        const wipeInventory = moduleSet.has('inventory');
        const wipeProcessing = moduleSet.has('processing');
        const wipePurchases = moduleSet.has('purchases');
        const wipeSales = moduleSet.has('sales');

        const patch: Partial<ERPState> = {};

        // 1. Clear each module's own arrays (accounting/inventory handled below).
        for (const id of moduleIds) {
          for (const key of MODULE_WIPE_KEYS[id] || []) {
            if (key === 'vouchers' || key === 'journalEntries' || key === 'batches' || key === 'inventoryMovements') continue;
            (patch as any)[key] = [];
          }
        }

        // 2. Cascade: wiping a transaction module also clears the batches and
        //    inventory movements it created, so no orphan trail remains.
        if (wipePurchases || wipeSales || wipeProcessing) {
          if (!wipeInventory) {
            const removedPurchaseIds = wipePurchases
              ? new Set(state.purchases.map(p => p.id))
              : null;
            const movementModules = new Set<string>();
            if (wipePurchases) movementModules.add('Purchase');
            if (wipeSales) movementModules.add('Sale');
            if (wipeProcessing) { movementModules.add('Dispatch'); movementModules.add('Receive'); }

            if (removedPurchaseIds) {
              patch.batches = state.batches.filter(b => !removedPurchaseIds.has(b.purchaseId));
            } else {
              patch.batches = state.batches;
            }
            patch.inventoryMovements = state.inventoryMovements.filter(m =>
              !movementModules.has(m.module)
              && !(removedPurchaseIds && m.batchId && removedPurchaseIds.has(m.batchId))
            );

            // 2b. When wiping processing, restore every processed/at-processor
            //     stock back to raw material (reset batch stage fields) so the
            //     inventory is not silently lost. Processor balances are
            //     recomputed from the remaining bills.
            if (wipeProcessing) {
              const baseBatches = patch.batches ?? state.batches;
              patch.batches = baseBatches.map(b => ({
                ...b,
                remainingPcs: b.initialPcs ?? b.remainingPcs,
                atProcessorPcs: 0,
                processedPcs: 0,
                stageAvailableBySource: {},
                currentStageId: undefined,
              }));
            }
          }

          // 3. Also remove the auto-generated vouchers + journal entries of those
          //    modules (unless the whole accounting module is being wiped).
          if (!wipeAccounting) {
            const sources = new Set<string>();
            if (wipePurchases) sources.add('Purchase');
            if (wipeSales) sources.add('Sales');
            if (wipeProcessing) sources.add('Processing');
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
          // The reclassification marker points at a voucher that no longer
          // exists; clearing it lets the engine repost against the fresh chart.
          patch.processingCostReclassification = undefined;
        }

        // 4. Recompute material counters from the (possibly restored) batches
        //    so stock shows correctly after the wipe.
        const finalBatches = patch.batches ?? state.batches;
        patch.materials = InventoryCalculationService.syncMaterialCounters(
          state.materials || [],
          finalBatches
        );

        // 5. When processing is wiped, mark processors as unbilled: remove their
        //    bills (already cleared) and recompute balancePayable from the
        //    remaining bills so billed -> unbilled is reflected.
        if (wipeProcessing) {
          const remainingBills = (patch.processorBills ?? []) as any[];
          patch.processors = (state.processors || []).map(p => ({
            ...p,
            balancePayable: remainingBills
              .filter(b => b.processorId === p.id)
              .reduce((s: number, b: any) => s + (b.totalAmount || 0), 0),
          }));
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

      updateModuleItem: (table, id, item) => {
        // A material's `No.` must stay unique across the list, so the rename is
        // validated here — the same place the create path checks it.
        if (table === 'materials' && item.code !== undefined) {
          const clash = findMaterialCodeConflict(useERPStore.getState().materials, item.code, id);
          if (clash) {
            throw new AppError(`No. "${item.code?.trim()}" is already used by "${clash}". Each No. must identify one material.`);
          }
        }

        // Same rule on the edit path, checking the parts the product will
        // actually end up with (the patch may leave `components` untouched).
        if (table === 'products' && (item as Partial<Product>).usageType === 'assembled') {
          const existing = useERPStore.getState().products.find(p => p.id === id);
          const effective = (item as Partial<Product>).components !== undefined
            ? (item as Partial<Product>).components
            : existing?.components;
          validateComponents(effective ?? []);
        }

        set((state) => {
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
        });
      },

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

      // Atomic reorder: pass the full chain in the NEW order (stage ids only).
      // Sequences are renumbered 1..N in one set() so live sends and the
      // movement map can never observe a half-swapped chain.
      reorderProcessingStages: (orderedIds) => set((state) => {
        const byId = new Map(state.processingStages.map(s => [s.id, s]));
        const reordered = orderedIds.map(id => byId.get(id)).filter((s): s is ProcessingStage => !!s);
        // Any stage missing from orderedIds (shouldn't happen) keeps its place at the end.
        if (reordered.length !== state.processingStages.length) {
          const missing = state.processingStages.filter(s => !orderedIds.includes(s.id));
          reordered.push(...missing);
        }
        return { processingStages: rewireStageChain(reordered.map((s, i) => ({ ...s, sequence: i + 1 }))) };
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
        // Checked before `set` so a duplicate `No.` is refused outright. The
        // check reads state directly rather than living in the updater because
        // databaseMiddleware runs that updater twice.
        const clash = findMaterialCodeConflict(useERPStore.getState().materials, data.code);
        if (clash) {
          throw new AppError(`No. "${data.code?.trim()}" is already used by "${clash}". Each No. must identify one material.`);
        }
        const id = uuidv4();
        set((state) => ({ materials: [{ ...data, id, stockPcs: 0, processedStockPcs: 0 }, ...state.materials] }));
        return id;
      },

      addProduct: (data) => {
        // An assembled product with no parts would be billed as "made from
        // several materials" while deducting nothing, so the shape is checked
        // here too — not only in the form that normally builds it.
        if (data.usageType === 'assembled') validateComponents(data.components ?? []);

        // SKU is never typed in — it is allocated here, year-scoped and
        // max-based (PRD-2026-0001 style), same discipline as PO/INV numbers.
        const today = new Date().toISOString().slice(0, 10);
        const id = uuidv4();
        set((state) => ({
          products: [
            {
              ...data,
              id,
              sku: data.sku ?? DocumentNumberingService.nextDocumentNumber(state.products, 'sku', 'PRD', today),
              // Every new product is manufactured into finished-goods lots
              // before it can be sold. The recipe revision starts at 1 and is
              // increased by the product form when the BOM changes.
              bomVersion: data.bomVersion ?? 1,
              stockModel: data.stockModel ?? 'manufactured',
            },
            ...state.products,
          ],
        }));
        return id;
      },

      addManufacturingOrder: (data) => {
        let orderId = '';
        let failure: AppError | null = null;
        set((state) => {
          try {
            const product = state.products.find(p => p.id === data.productId);
            const plannedQty = Math.round(Number(data.plannedQty));
            if (!Number.isFinite(plannedQty) || plannedQty <= 0) {
              throw new AppError('Planned quantity must be a whole number greater than zero.');
            }
            const components = snapshotBom(product, plannedQty);
            const orderNo = DocumentNumberingService.nextDocumentNumber(
              state.manufacturingOrders || [], 'orderNo', 'MO', data.date,
            );
            orderId = uuidv4();
            const order: ManufacturingOrder = {
              id: orderId,
              orderNo,
              productId: data.productId,
              date: data.date,
              plannedQty,
              status: 'Planned',
              components,
              productionCost: Math.max(0, Number(data.productionCost) || 0),
              remarks: data.remarks,
              createdAt: new Date().toISOString(),
            };
            return { manufacturingOrders: [order, ...(state.manufacturingOrders || [])] };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Could not create manufacturing order.');
            return state;
          }
        });
        if (failure) throw failure;
        return orderId;
      },

      updateManufacturingOrder: (id, data) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            const order = (state.manufacturingOrders || []).find(o => o.id === id);
            if (!order) throw new AppError('Manufacturing order not found.');
            if (order.status !== 'Planned') {
              throw new AppError('Only a planned manufacturing order can be edited. Started orders are locked so their costs cannot drift.');
            }
            const plannedQty = data.plannedQty !== undefined ? Math.round(Number(data.plannedQty)) : order.plannedQty;
            if (!Number.isFinite(plannedQty) || plannedQty <= 0) {
              throw new AppError('Planned quantity must be a whole number greater than zero.');
            }
            const product = state.products.find(p => p.id === order.productId);
            const components = plannedQty !== order.plannedQty || data.plannedQty !== undefined
              ? snapshotBom(product, plannedQty)
              : order.components;
            return {
              manufacturingOrders: (state.manufacturingOrders || []).map(o =>
                o.id === id
                  ? {
                      ...o,
                      ...data,
                      plannedQty,
                      productionCost: data.productionCost !== undefined
                        ? Math.max(0, Number(data.productionCost) || 0)
                        : o.productionCost,
                      components,
                    }
                  : o
              ),
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Could not update manufacturing order.');
            return state;
          }
        });
        if (failure) throw failure;
      },

      startManufacturingOrder: (id) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            const order = (state.manufacturingOrders || []).find(o => o.id === id);
            if (!order) throw new AppError('Manufacturing order not found.');
            if (order.status !== 'Planned') {
              throw new AppError(order.status === 'In Progress'
                ? 'This manufacturing order has already started.'
                : `A ${order.status.toLowerCase()} order cannot be started.`);
            }
            return {
              manufacturingOrders: (state.manufacturingOrders || []).map(o =>
                o.id === id ? { ...o, status: 'In Progress' as const } : o
              ),
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Could not start manufacturing order.');
            return state;
          }
        });
        if (failure) throw failure;
      },

      completeManufacturingOrder: (id, data) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            const order = (state.manufacturingOrders || []).find(o => o.id === id);
            if (!order) throw new AppError('Manufacturing order not found.');
            if (order.status === 'Completed') throw new AppError('This manufacturing order is already completed — completed costs are immutable.');
            if (order.status === 'Cancelled') throw new AppError('A cancelled manufacturing order cannot be completed.');

            const finishedQty = data?.finishedQty !== undefined ? Math.round(Number(data.finishedQty)) : order.plannedQty;
            if (!Number.isFinite(finishedQty) || finishedQty <= 0) {
              throw new AppError('Finished quantity must be a whole number greater than zero.');
            }
            if (finishedQty > order.plannedQty) {
              throw new AppError(`Finished quantity cannot exceed the planned ${order.plannedQty} PCS.`);
            }

            const productionCost = data?.productionCost !== undefined
              ? Math.max(0, Number(data.productionCost) || 0)
              : Math.max(0, Number(order.productionCost) || 0);

            // Components are consumed in FULL for the planned quantity. When the
            // output is short, the same cost is spread over fewer good units —
            // the shortfall is absorbed into the surviving unit cost.
            const requirements = order.components.map(c => ({ materialId: c.materialId, pcs: c.plannedQuantity }));
            const drawn = consumeComponentsForManufacturing(state.batches || [], requirements);
            if (drawn.shortage) {
              const materialName = state.materials.find(m => m.id === drawn.shortage!.materialId)?.name || drawn.shortage.materialId;
              throw new AppError(
                `Not enough ${materialName} to complete ${order.orderNo}: ` +
                `needs ${drawn.shortage.required} PCS but only ${drawn.shortage.available} are on hand. ` +
                'Components stay reserved until completion, so nothing has been consumed.',
              );
            }

            const costed = manufacturingOrderCost(
              drawn.draws.map(d => ({
                materialId: d.materialId,
                batchId: d.batchId,
                pcs: d.pcs,
                costPerPiece: d.costPerPiece,
                cost: d.cost,
              })),
              productionCost,
            );
            const costPerPiece = costed.totalCost / finishedQty;
            const completionDate = data?.date || new Date().toISOString().slice(0, 10);
            const product = state.products.find(p => p.id === order.productId);
            const lotNo = DocumentNumberingService.nextDocumentNumber(
              state.finishedGoodsLots || [], 'lotNo', 'LOT', completionDate,
            );
            const lot: FinishedGoodsLot = {
              id: uuidv4(),
              lotNo,
              productId: order.productId,
              manufacturingOrderId: order.id,
              date: completionDate,
              pcsProduced: finishedQty,
              pcsRemaining: finishedQty,
              costPerPiece,
              totalCost: costed.totalCost,
              status: 'Active',
              remarks: data?.remarks || order.remarks,
            };

            const completedOrder: ManufacturingOrder = {
              ...order,
              status: 'Completed',
              finishedQty,
              productionCost: costed.productionCost,
              lotId: lot.id,
              materialCost: costed.materialCost,
              totalCost: costed.totalCost,
              costPerPiece,
              consumptions: drawn.draws,
              completedAt: new Date().toISOString(),
              completedBy: state.currentUser?.name,
            };

            const vouchers = state.vouchers;
            const journalEntries = state.journalEntries;
            let voucherPatch: { vouchers: Voucher[]; journalEntries: JournalEntry[] } = { vouchers, journalEntries };
            const posting = buildManufacturingCompletion(
              state.accounts,
              state.accountSubtypes,
              costed.materialCost,
              costed.productionCost,
              `Manufacturing ${order.orderNo} — ${finishedQty} × ${product?.name || 'product'}`,
            );
            if (posting.length > 0) {
              const built = createVoucher(vouchers, {
                date: completionDate,
                type: 'Journal Voucher',
                referenceNo: order.orderNo,
                sourceModule: 'Manufacturing',
                sourceId: order.id,
                narration: `Manufacturing completion ${order.orderNo}`,
                lines: posting,
                createdBy: state.currentUser?.name,
              });
              if (built) {
                voucherPatch = { vouchers: [built.voucher, ...vouchers], journalEntries: [...built.entries, ...journalEntries] };
              }
            }

            const componentMovements: InventoryMovement[] = drawn.draws.map(d => ({
              id: uuidv4(),
              materialId: d.materialId,
              batchId: d.batchId,
              date: completionDate,
              referenceNo: order.orderNo,
              module: 'Manufacture',
              transactionType: 'OUT',
              quantity: d.pcs,
              runningBalance: InventoryCalculationService.calculateSaleStock(d.materialId, drawn.batches),
              remarks: `Consumed in ${order.orderNo}`,
              manufacturingOrderId: order.id,
            }));
            const fgBalance = (state.finishedGoodsLots || [])
              .filter(l => l.productId === order.productId)
              .reduce((sum, l) => sum + (l.pcsRemaining || 0), 0) + finishedQty;
            const outputMovement: InventoryMovement = {
              id: uuidv4(),
              materialId: product?.materialId || '',
              productId: order.productId,
              date: completionDate,
              referenceNo: order.orderNo,
              module: 'Manufacture',
              transactionType: 'IN',
              quantity: finishedQty,
              runningBalance: fgBalance,
              remarks: `Finished goods produced — ${lot.lotNo}`,
              manufacturingOrderId: order.id,
            };

            return {
              manufacturingOrders: (state.manufacturingOrders || []).map(o => (o.id === order.id ? completedOrder : o)),
              finishedGoodsLots: [lot, ...(state.finishedGoodsLots || [])],
              batches: drawn.batches,
              materials: InventoryCalculationService.syncMaterialCounters(state.materials || [], drawn.batches),
              inventoryMovements: [...componentMovements, outputMovement, ...(state.inventoryMovements || [])],
              ...voucherPatch,
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Could not complete manufacturing order.');
            return state;
          }
        });
        if (failure) throw failure;
      },

      produceForProduct: (input) => {
        const state = get();
        const product = (state.products || []).find(p => p.id === input.productId);
        if (!product) throw new AppError('Product not found.');
        const { buildable } = buildableQty(product, state.batches || []);
        const finishedQty = input.finishedQty !== undefined ? Math.round(Number(input.finishedQty)) : buildable;
        if (!Number.isFinite(finishedQty) || finishedQty <= 0) {
          throw new AppError('Nothing can be produced yet — required parts are short.');
        }
        if (finishedQty > buildable) {
          throw new AppError(`Cannot produce ${finishedQty} — only ${buildable} PCS can be built from the parts on hand.`);
        }
        const date = input.date || new Date().toISOString().slice(0, 10);

        // Create the order and complete it in one breath. The order's planned
        // qty IS the finished qty (no partial-planning UI); if completion fails
        // for any reason, the Planned shell is rolled back so no orphan remains.
        const orderId = get().addManufacturingOrder({
          productId: product.id,
          plannedQty: finishedQty,
          date,
          productionCost: Math.max(0, Number(input.productionCost) || 0),
          remarks: input.remarks,
        });
        try {
          get().completeManufacturingOrder(orderId, {
            finishedQty,
            date,
            productionCost: Math.max(0, Number(input.productionCost) || 0),
            remarks: input.remarks,
          });
        } catch (e) {
          try { get().deleteManufacturingOrder(orderId); } catch { /* best effort rollback */ }
          throw e;
        }

        const after = get();
        const order = (after.manufacturingOrders || []).find(o => o.id === orderId);
        const lot = (after.finishedGoodsLots || []).find(l => l.manufacturingOrderId === orderId);
        return {
          orderId,
          orderNo: order?.orderNo || '',
          lotId: lot?.id || order?.lotId || '',
          lotNo: lot?.lotNo || '',
          finishedQty,
        };
      },

      cancelManufacturingOrder: (id) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            const order = (state.manufacturingOrders || []).find(o => o.id === id);
            if (!order) throw new AppError('Manufacturing order not found.');
            if (order.status === 'Completed') throw new AppError('A completed manufacturing order cannot be cancelled — its stock and cost are already posted.');
            if (order.status === 'Cancelled') return state;
            return {
              manufacturingOrders: (state.manufacturingOrders || []).map(o =>
                o.id === id ? { ...o, status: 'Cancelled' as const } : o
              ),
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Could not cancel manufacturing order.');
            return state;
          }
        });
        if (failure) throw failure;
      },

      deleteManufacturingOrder: (id) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            const order = (state.manufacturingOrders || []).find(o => o.id === id);
            if (!order) throw new AppError('Manufacturing order not found.');
            if (order.status === 'Completed') {
              throw new AppError('A completed manufacturing order cannot be deleted — its finished-goods lot is part of the stock trail.');
            }
            return {
              manufacturingOrders: (state.manufacturingOrders || []).filter(o => o.id !== id),
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Could not delete manufacturing order.');
            return state;
          }
        });
        if (failure) throw failure;
      },

      reclassifyProcessingCosts: () => {
        let failure: AppError | null = null;
        let result: { amount: number; voucherId: string; voucherNo: string } | null = null;
        set((state) => {
          try {
            const preview = previewProcessingCostReclassification(state);
            if (!(preview.amount >= 0.01)) {
              throw new AppError('There is no historical processing cost left to capitalise.');
            }
            const date = new Date().toISOString().slice(0, 10);
            const narration =
              `Capitalise historical processing cost still in stock (${preview.batchCount} batch${preview.batchCount === 1 ? '' : 'es'})`;
            const posting = buildProcessingCostReclassification(
              state.accounts,
              state.accountSubtypes,
              preview.amount,
              narration,
            );
            const referenceNo = 'PROC-RECLASS';
            const built = createVoucher(state.vouchers, {
              date,
              type: 'Journal Voucher',
              referenceNo,
              sourceModule: 'Manufacturing',
              sourceId: `reclassify-${date}`,
              narration,
              lines: posting,
              createdBy: state.currentUser?.name,
            });
            if (!built) throw new AppError('Could not build the reclassification voucher.');

            const stamp: ProcessingCostReclassification = {
              amount: preview.amount,
              voucherId: built.voucher.id,
              voucherNo: built.voucher.voucherNo,
              reclassifiedAt: new Date().toISOString(),
              batchCount: preview.batchCount,
            };
            result = {
              amount: preview.amount,
              voucherId: built.voucher.id,
              voucherNo: built.voucher.voucherNo,
            };
            return {
              processingCostReclassification: stamp,
              vouchers: [built.voucher, ...state.vouchers],
              journalEntries: [...built.entries, ...state.journalEntries],
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Could not reclassify processing cost.');
            return state;
          }
        });
        if (failure) throw failure;
        if (!result) throw new AppError('Could not reclassify processing cost.');
        return result;
      },

      addPurchase: (data) => {
        set((state) => {
        const purchaseNo = DocumentNumberingService.nextDocumentNumber(state.purchases, 'purchaseNo', 'PO', data.date);
        // Ready-made purchases enter pcs DIRECTLY (directPcs mode — no weight math);
        // every other purchase derives pcs from weight ÷ weightPerPiece.
        const material = state.materials.find(m => m.id === data.materialId);
        const isReadyMade = (material?.processingPath ?? 'full_chain') === 'ready_made';
        const calculatedPcs = isReadyMade && data.directPcs
          ? Math.max(0, Math.round(data.directPcs))
          : UnitConversionService.calculatePcsFromWeight(data.weight, data.weightUnit, data.weightPerPiece);
        const amount = isReadyMade && data.directPcs
          ? Math.round(data.directPcs) * data.ratePerUnit
          : data.weight * data.ratePerUnit;

        const purchaseId = uuidv4();
        const newPurchase: Purchase = {
          ...data,
          id: purchaseId,
          purchaseNo,
          calculatedPcs,
          amount
        };

        const batchId = uuidv4();
        // {SUPPLIER-FIRST}-{purchaseNo} (AHMED-PO-2026-0003) by default — the
        // batches of one material stay tellable apart by eye; Settings can
        // switch back to the BATCH- prefix.
        const batchNo = DocumentNumberingService.buildBatchNo(
          state.suppliers.find(s => s.id === data.supplierId)?.name,
          purchaseNo,
        );
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
          // Ready-made goods are FINISHED at purchase — write the batch into
          // the finished bucket (remainingPcs 0) so the LIVE state matches
          // what the restart replay derives, and sales FIFO consumes them.
          remainingPcs: isReadyMade ? 0 : calculatedPcs,
          ...(isReadyMade ? { processedPcs: calculatedPcs } : {}),
          amount,
          status: "Active",
          // Path snapshot: the trail must replay under the path pcs were BOUGHT
          // under, even if the material's path is edited later.
          processingPath: material?.processingPath ?? 'full_chain',
          fixedStageId: material?.fixedStageId,
          allowedStageIds: material?.allowedStageIds,
        };

        const currentMaterial = state.materials.find(m => m.id === data.materialId);
        const currentStock = currentMaterial?.stockPcs || 0;
        const newStock = currentStock + calculatedPcs;

        // Ready-made pcs are ALREADY finished — they land in the sellable
        // finished pool (processedStockPcs), never in raw stock.
        const updatedMaterials = state.materials.map(m =>
          m.id === data.materialId
            ? isReadyMade
              ? { ...m, processedStockPcs: (m.processedStockPcs || 0) + calculatedPcs }
              : { ...m, stockPcs: newStock }
            : m
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
          // Ready-made purchases raise the finished counter, not raw.
          runningBalance: isReadyMade ? (currentMaterial?.processedStockPcs || 0) + calculatedPcs : newStock,
          remarks: data.remarks
        };

        // NOTE: the supplier's balancePayable is NOT incremented here — it is
        // derived from the linked account's COMPLETE ledger via
        // AccountingEngine.recomputePartyBalances() right after this set, so the
        // listing balance can never drift from the ledger closing balance.

        // Automatic Voucher Generation (spec §25 — resolve accounts by subtype, never by name)
        // Purchases increase INVENTORY (an asset) — the purchase is NOT an
        // expense yet. Ready-made goods are already finished, so they debit
        // Finished Goods; everything else debits Raw Material Inventory.
        const purchaseAccount = getSystemInventoryAccount(
          state.accounts,
          state.accountSubtypes,
          isReadyMade ? 'Finished Goods Inventory' : 'Raw Material Inventory'
        );
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
            narration: isReadyMade
              ? `Ready-made purchase: ${calculatedPcs} PCS from Supplier`
              : `Purchase of ${data.weight} ${data.weightUnit} from Supplier`,
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
            // ── Processing-path guards (BEFORE the worker guard: a single-stage
            // material's designated stage must not be masked by a worker-binding
            // error — the material's path is the primary constraint).
            const sendMaterial = state.materials.find(m => m.id === data.materialId);
            const sendPath = sendMaterial?.processingPath ?? 'full_chain';
            if (sendPath === 'ready_made') {
              throw new AppError(`"${sendMaterial?.name || 'This material'}" is a ready-made product — it needs no processing.`);
            }
            if (sendPath === 'single_stage' && data.stageId !== sendMaterial?.fixedStageId) {
              const fixedStage = state.processingStages.find(s => s.id === sendMaterial?.fixedStageId);
              throw new AppError(`"${sendMaterial?.name || 'This material'}" only processes at ${fixedStage?.name || 'its designated stage'}.`);
            }
            if (sendPath === 'custom_stages') {
              const allowed = sendMaterial?.allowedStageIds || [];
              if (!data.stageId || !allowed.includes(data.stageId)) {
                const allowedNames = allowed
                  .map(id => state.processingStages.find(s => s.id === id)?.name)
                  .filter(Boolean).join(', ') || 'its selected stages';
                throw new AppError(`"${sendMaterial?.name || 'This material'}" only processes at: ${allowedNames}.`);
              }
            }

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
            // Path-aware: a single_stage material draws RAW at its fixed stage
            // (wherever it sits in the chain); full_chain follows the sequence map.
            const consumesRaw = InventoryCalculationService.sendConsumesRaw(data.stageId, stages, sendMaterial);
            // ══ MOVEMENT MAP: the ONLY legal source bucket for this target ══
            // Stage 1 draws RAW; stage N draws the availability produced by
            // stage N−1. Anything else is rejected — stage-skipping and
            // re-processing already-processed pcs are physically impossible.
            const sourceStageId = consumesRaw
              ? 'raw' as const
              : InventoryCalculationService.requiredSourceForTargetForPath(data.stageId!, stages, sendMaterial);

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
            // Path-aware: single-stage materials finish at their ONE fixed stage
            // regardless of where it sits in the chain.
            const receiveMaterial = state.materials.find(m => m.id === data.materialId);
            const producesFinished = InventoryCalculationService.receiptProducesFinished(stageId, stages, receiveMaterial);

            // Per-stage billing: per_piece = qty × rate; per_kg = qty × weightPerPiece(kg) × rate.
            const stage = stages.find(s => s.id === stageId);
            const rateMethod = data.rateMethod ?? stage?.rateMethod ?? 'per_piece';
            const batch = send.batchId ? state.batches.find(b => b.id === send.batchId) : undefined;
            const billAmount = InventoryCalculationService.computeReceiptBillAmount(data.pcsReceived, rateMethod, send, batch, stage);

            const receiptId = uuidv4();
            let newReceipt: ProcessingReceipt = {
              ...data,
              id: receiptId,
              receiveNo,
              billAmount,
              billedStatus: "Unbilled",
              stageId,
              rateMethod,
              billingUnit: data.billingUnit ?? stage?.billingUnit,
            };

            // Manufacturing v4: capitalise the processing charge at the moment
            // the pcs come back. Dr Raw Material Inventory / Cr Accrued
            // Expenses — exactly once, including partial receipts. The later
            // processor bill clears the accrual and only the difference hits
            // Processing Expense.
            let voucherPatch: { vouchers: Voucher[]; journalEntries: JournalEntry[] } = {
              vouchers: state.vouchers,
              journalEntries: state.journalEntries,
            };
            if (isManufacturingEnabled(state) && billAmount > 0) {
              const posting = buildReceiptAccrual(
                state.accounts,
                state.accountSubtypes,
                billAmount,
                `Processing accrued — ${receiveNo}`,
              );
              const built = createVoucher(state.vouchers, {
                date: data.date,
                type: 'Journal Voucher',
                referenceNo: receiveNo,
                sourceModule: 'Processing',
                sourceId: receiptId,
                narration: `Processing cost accrued at receipt ${receiveNo}`,
                lines: posting,
                createdBy: state.currentUser?.name,
              });
              if (built) {
                newReceipt = {
                  ...newReceipt,
                  accruedProcessingCost: billAmount,
                  accruedVoucherId: built.voucher.id,
                };
                voucherPatch = {
                  vouchers: [built.voucher, ...state.vouchers],
                  journalEntries: [...built.entries, ...state.journalEntries],
                };
              }
            }

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
                data.materialId, data.pcsReceived, updatedBatches, send.batchId || undefined, billAmount
              );
            } else {
              // LAW 2 transfer: AT_stage → AVAILABLE(source = this stage).
              // atProcessorPcs DECREASES — buckets stay disjoint so the same
              // pcs are never counted in two places, and pcs that came back
              // from DIFFERENT stages keep SEPARATE availability entries
              // (they can never be merged or routed to the wrong next stage).
              try {
                updatedBatches = InventoryCalculationService.moveProcessorToAvailable(
                  data.materialId, stageId || 'legacy', data.pcsReceived, updatedBatches, send.batchId || undefined,
                  isManufacturingEnabled(state) && billAmount > 0 ? billAmount : undefined
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
              inventoryMovements: [movement, ...(state.inventoryMovements || [])],
              ...voucherPatch,
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
            const lossId = uuidv4();
            const loss = InventoryCalculationService.consumeLoss(
              send.materialId, send.stageId, quantity, state.batches || [], send.batchId || undefined
            );
            const { batches: updatedBatches, fromProcessor, fromAvailable, cost } = loss;
            // Pipeline semantics: the counter spans atProcessor + availability,
            // so a loss from either bucket shrinks it.
            const updatedMaterials = state.materials.map(m =>
              m.id === send.materialId
                ? { ...m, atProcessorPcs: Math.max(0, (m.atProcessorPcs || 0) - fromProcessor - fromAvailable) }
                : m
            );

            // Manufacturing v4: write the loss off at batch cost. The credit is
            // Raw Material Inventory (the ledger WIP balance stays zero by
            // design) and the debit is the dedicated Processing Loss expense.
            let lossVoucherPatch: { vouchers: Voucher[]; journalEntries: JournalEntry[] } = {
              vouchers: state.vouchers,
              journalEntries: state.journalEntries,
            };
            let lossRecord: ProcessingLossRecord | null = null;
            if (isManufacturingEnabled(state)) {
              const posting = buildProcessingLoss(
                state.accounts,
                state.accountSubtypes,
                cost,
                `Processing loss — ${send.dispatchNo}`,
              );
              let voucherId: string | undefined;
              if (posting.length > 0) {
                const built = createVoucher(state.vouchers, {
                  date: lossDate,
                  type: 'Journal Voucher',
                  referenceNo: send.dispatchNo,
                  sourceModule: 'Processing',
                  sourceId: lossId,
                  narration: `Processing loss written off ${send.dispatchNo}`,
                  lines: posting,
                  createdBy: state.currentUser?.name,
                });
                if (built) {
                  voucherId = built.voucher.id;
                  lossVoucherPatch = {
                    vouchers: [built.voucher, ...state.vouchers],
                    journalEntries: [...built.entries, ...state.journalEntries],
                  };
                }
              }
              lossRecord = {
                id: lossId,
                sendId: send.id,
                materialId: send.materialId,
                date: lossDate,
                pcsLost: quantity,
                cost,
                voucherId,
                remarks,
              };
            }

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
              inventoryMovements: [movement, ...(state.inventoryMovements || [])],
              ...(lossRecord ? { processingLosses: [lossRecord, ...(state.processingLosses || [])] } : {}),
              ...lossVoucherPatch,
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
        const payableAccount = state.accounts.find(a => a.linkedEntityId === data.processorId)
          || getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Accounts Payable');

        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;

        if (isManufacturingEnabled(state)) {
          // Manufacturing v4: the processing charge was already capitalised
          // into inventory when each receipt came back (Dr Raw Material /
          // Cr Accrued Expenses). This bill therefore CLEARS the accrual and
          // only the true-up difference hits Processing Expense.
          const accruedTotal = receiptsToBill.reduce(
            (sum, r) => sum + Math.max(0, Number(r.accruedProcessingCost) || 0),
            0,
          );
          const posting = buildProcessorBill(
            state.accounts,
            state.accountSubtypes,
            payableAccount,
            totalAmount,
            accruedTotal,
            `Processing Bill for ${receiptsToBill.length} receipts`,
          );
          const built = posting.length > 0
            ? createVoucher(state.vouchers, {
                date: data.date,
                type: 'Journal Voucher',
                referenceNo: billNo,
                sourceModule: 'Processing',
                sourceId: billId,
                narration: `Processing Bill for ${receiptsToBill.length} receipts`,
                lines: posting,
                createdBy: state.currentUser?.name,
              })
            : null;
          if (built) {
            updatedVouchers = [built.voucher, ...state.vouchers];
            updatedJournalEntries = [...built.entries, ...state.journalEntries];
          }
        } else {
          // Legacy policy: stage bills post DR Processing Expense /
          // CR worker AP — unchanged for pre-v4 data and test fixtures.
          const processingExpenseAccount = getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Processing Expense');

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
        if (isManufacturingEnabled(state)) {
          const product = state.products.find(p => p.id === data.productId);
          if (!product) throw new AppError('Choose a valid product before saving the sale.');
          const pcsSold = Math.round(Number(data.pcsSold));
          if (!Number.isFinite(pcsSold) || pcsSold <= 0) {
            throw new AppError('Quantity sold must be a whole number greater than zero.');
          }
          const lotResult = consumeLotsFIFO(state.finishedGoodsLots || [], data.productId, pcsSold);
          if (lotResult.shortage) {
            throw new AppError(
              `Not enough finished stock for ${product.name}: need ${lotResult.shortage.required} PCS ` +
              `but only ${lotResult.shortage.available} are in finished-goods lots. ` +
              'Complete a manufacturing order first.',
            );
          }
          const totalAmount = roundQty(pcsSold * (Number(data.pricePerPiece) || 0));
          const invoiceNo = DocumentNumberingService.nextDocumentNumber(state.sales, 'invoiceNo', 'INV', data.date);
          const saleId = uuidv4();
          const newSale: Sale = {
            ...data,
            id: saleId,
            invoiceNo,
            pcsSold,
            totalAmount,
            lotAllocations: lotResult.allocations,
            cogsAmount: lotResult.cogs,
            stockModelAtSale: 'manufactured',
          };
          const posting = buildManufacturedSale(
            state.accounts,
            state.accountSubtypes,
            data.customerId,
            totalAmount,
            lotResult.cogs,
            `Sale ${invoiceNo} — ${pcsSold} × ${product.name}`,
          );
          const built = createVoucher(state.vouchers, {
            date: data.date,
            type: 'Sales Voucher',
            referenceNo: invoiceNo,
            sourceModule: 'Sales',
            sourceId: saleId,
            narration: `Sale of ${pcsSold} × ${product.name}`,
            lines: posting,
            createdBy: state.currentUser?.name,
          });
          const remaining = lotResult.lots
            .filter(l => l.productId === data.productId)
            .reduce((sum, l) => sum + (l.pcsRemaining || 0), 0);
          const movement: InventoryMovement = {
            id: uuidv4(),
            materialId: product.materialId || '',
            productId: product.id,
            date: data.date,
            referenceNo: invoiceNo,
            module: 'Sale',
            transactionType: 'OUT',
            quantity: pcsSold,
            runningBalance: remaining,
            remarks: `Sold as finished goods: ${product.name}`,
          };
          return {
            sales: [newSale, ...state.sales],
            finishedGoodsLots: lotResult.lots,
            inventoryMovements: [movement, ...(state.inventoryMovements || [])],
            vouchers: built ? [built.voucher, ...state.vouchers] : state.vouchers,
            journalEntries: built ? [...built.entries, ...state.journalEntries] : state.journalEntries,
          };
        }
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

        // A product made from several materials is FULFILLED at the point of
        // sale: every part listed on the product comes off raw stock now, and
        // the product itself holds no stock of its own. A single-material
        // product keeps selling from its own finished stock, unchanged.
        const assembled = selectedProduct && isAssembled(selectedProduct) ? selectedProduct : null;
        if (assembled) {
          const perUnit = perUnitRequirement(assembled);
          // NOTE: databaseMiddleware runs the `set` updater TWICE — once to
          // validate business rules, once to commit. Any handler that mutates
          // its inputs in place therefore runs its mutations twice. Every other
          // handler here builds fresh objects and is unaffected; this one
          // rewrites batch balances, so it must work on a private COPY taken
          // from the untouched `state.batches`. Copying makes a second
          // invocation produce exactly the same result instead of deducting
          // the parts a second time.
          const nextBatches = (state.batches || []).map(b => ({ ...b }));
          const newMovements: InventoryMovement[] = [];

          // Check the WHOLE plan before touching anything: a sale must never
          // take part of its components and then fail on a shortage further
          // down the list, which would leave stock quietly out of step.
          for (const [materialId, perUnitQty] of perUnit) {
            const required = roundQty(perUnitQty * data.pcsSold);
            const available = InventoryCalculationService.calculateSaleStock(materialId, nextBatches);
            if (required > available + 1e-9) {
              throw new AppError(
                `Not enough stock to sell ${data.pcsSold} \u00d7 ${assembled.name}: ` +
                `${state.materials.find(m => m.id === materialId)?.name ?? materialId} ` +
                `needs ${required} but only ${available} available.`,
              );
            }
          }

          for (const [materialId, perUnitQty] of perUnit) {
            const required = roundQty(perUnitQty * data.pcsSold);
            let consumed = 0;
            for (const b of nextBatches) {
              if (consumed >= required) break;
              if (b.materialId !== materialId || b.status !== 'Active') continue;
              const rawHere = Math.max(0, b.remainingPcs || 0);
              const rawTake = Math.min(rawHere, required - consumed);
              if (rawTake > 0) {
                b.remainingPcs = roundQty(b.remainingPcs - rawTake);
                consumed = roundQty(consumed + rawTake);
              }
              const finishedHere = Math.max(0, b.processedPcs || 0);
              const finishedTake = Math.min(finishedHere, required - consumed);
              if (finishedTake > 0) {
                b.processedPcs = roundQty((b.processedPcs || 0) - finishedTake);
                consumed = roundQty(consumed + finishedTake);
              }
              if ((b.remainingPcs || 0) + (b.processedPcs || 0) <= 1e-9) b.status = 'Depleted';
            }
            const running = InventoryCalculationService.calculateSaleStock(materialId, nextBatches);
            newMovements.push({
              id: uuidv4(),
              materialId,
              date: data.date,
              referenceNo: invoiceNo,
              module: 'Sale',
              transactionType: 'OUT',
              quantity: required,
              runningBalance: running,
              remarks: `Used in ${assembled.name} \u00d7 ${data.pcsSold}`,
            });
          }

          // The same balanced Sales Voucher a normal sale posts, but the cost leg is
          // the PURCHASE VALUE OF THE PARTS that left stock — an assembled
          // product never passes through Finished Goods, so crediting Finished
          // Goods for stock that was never booked there would misstate both
          // accounts. Debit COGS, credit Raw Material Inventory instead.
          const partsCost = roundQty(
            [...perUnit.entries()].reduce((sum, [materialId, perUnitQty]) => {
              const required = roundQty(perUnitQty * data.pcsSold);
              return sum + required * InventoryCalculationService.getWeightedAverageCostPerPiece(materialId, nextBatches);
            }, 0),
          );
          const arAccount = state.accounts.find(a => a.linkedEntityId === data.customerId)
            || getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Accounts Receivable');
          const revenueAccount = getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Sales');
          const cogsAccount = getSystemCOGSAccount(state.accounts, state.accountSubtypes);
          const rawInventoryAccount = getSystemInventoryAccount(state.accounts, state.accountSubtypes, 'Raw Material Inventory');
          const hasPartsLeg = partsCost > 0 && !!cogsAccount && !!rawInventoryAccount;
          const voucherTotal = totalAmount + (hasPartsLeg ? partsCost : 0);

          let assembledVouchers = state.vouchers;
          let assembledEntries = state.journalEntries;
          if (arAccount && revenueAccount) {
            const voucherId = uuidv4();
            const voucherNo = DocumentNumberingService.nextVoucherNumber(state.vouchers, 'Sales Voucher', data.date);
            const voucher: Voucher = {
              id: voucherId,
              voucherNo,
              date: data.date,
              type: 'Sales Voucher',
              referenceNo: invoiceNo,
              sourceModule: 'Sales',
              sourceId: saleId,
              narration: `Sale of ${data.pcsSold} \u00d7 ${assembled.name}`,
              totalDebit: voucherTotal,
              totalCredit: voucherTotal,
              createdAt: new Date().toISOString(),
              status: 'Posted',
              versionHistory: [{
                id: uuidv4(),
                modifiedAt: new Date().toISOString(),
                action: 'Created',
                reason: 'Auto-generated from Sale',
              }],
            };
            const entries: JournalEntry[] = [
              { id: uuidv4(), voucherId, accountId: arAccount.id, debit: totalAmount, credit: 0 },
              { id: uuidv4(), voucherId, accountId: revenueAccount.id, debit: 0, credit: totalAmount },
            ];
            if (hasPartsLeg) {
              entries.push(
                { id: uuidv4(), voucherId, accountId: cogsAccount!.id, debit: partsCost, credit: 0 },
                { id: uuidv4(), voucherId, accountId: rawInventoryAccount!.id, debit: 0, credit: partsCost },
              );
            }
            assembledVouchers = [voucher, ...state.vouchers];
            assembledEntries = [...entries, ...state.journalEntries];
          }

          return {
            sales: [newSale, ...state.sales],
            batches: nextBatches,
            materials: InventoryCalculationService.syncMaterialCounters(state.materials || [], nextBatches),
            inventoryMovements: [...newMovements, ...(state.inventoryMovements || [])],
            vouchers: assembledVouchers,
            journalEntries: assembledEntries,
          };
        }

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
      },

      /**
       * Multi-line sale: ONE invoice number, one Sale row and one voucher per
       * product line, all committed atomically. The old form silently saved
       * only `lines[0]`; this is the authoritative fix (the form calls it once).
       */
      addSaleGroup: (data) => {
        let failure: AppError | null = null;
        set((state) => {
          try {
            if (!isManufacturingEnabled(state)) {
              throw new AppError('Multi-line sales require the manufacturing data version. Restart the app to finish migration.');
            }
            if (!data.lines || data.lines.length === 0) {
              throw new AppError('Add at least one product line before saving.');
            }
            const invoiceNo = DocumentNumberingService.nextDocumentNumber(state.sales, 'invoiceNo', 'INV', data.date);
            let lots = state.finishedGoodsLots || [];
            let vouchers = state.vouchers;
            let journalEntries = state.journalEntries;
            const newSales: Sale[] = [];
            const movements: InventoryMovement[] = [];

            for (const rawLine of data.lines) {
              const product = state.products.find(p => p.id === rawLine.productId);
              if (!product) throw new AppError('Every sale line must reference a valid product.');
              const pcsSold = Math.round(Number(rawLine.pcsSold));
              const pricePerPiece = Number(rawLine.pricePerPiece) || 0;
              if (!Number.isFinite(pcsSold) || pcsSold <= 0) {
                throw new AppError(`Quantity for ${product.name} must be a whole number greater than zero.`);
              }
              if (!(pricePerPiece > 0)) {
                throw new AppError(`Price for ${product.name} must be greater than zero.`);
              }
              const lotResult = consumeLotsFIFO(lots, product.id, pcsSold);
              if (lotResult.shortage) {
                throw new AppError(
                  `Not enough finished stock for ${product.name}: need ${lotResult.shortage.required} PCS ` +
                  `but only ${lotResult.shortage.available} are in finished-goods lots.`,
                );
              }
              lots = lotResult.lots;
              const totalAmount = roundQty(pcsSold * pricePerPiece);
              const saleId = uuidv4();
              newSales.push({
                id: saleId,
                invoiceNo,
                customerId: data.customerId,
                productId: product.id,
                date: data.date,
                pcsSold,
                pricePerPiece,
                totalAmount,
                lotAllocations: lotResult.allocations,
                cogsAmount: lotResult.cogs,
                stockModelAtSale: 'manufactured',
              });
              const posting = buildManufacturedSale(
                state.accounts,
                state.accountSubtypes,
                data.customerId,
                totalAmount,
                lotResult.cogs,
                `Sale ${invoiceNo} — ${pcsSold} × ${product.name}`,
              );
              const built = createVoucher(vouchers, {
                date: data.date,
                type: 'Sales Voucher',
                referenceNo: invoiceNo,
                sourceModule: 'Sales',
                sourceId: saleId,
                narration: `Sale of ${pcsSold} × ${product.name}`,
                lines: posting,
                createdBy: state.currentUser?.name,
              });
              if (built) {
                vouchers = [built.voucher, ...vouchers];
                journalEntries = [...built.entries, ...journalEntries];
              }
              const remaining = lots
                .filter(l => l.productId === product.id)
                .reduce((sum, l) => sum + (l.pcsRemaining || 0), 0);
              movements.push({
                id: uuidv4(),
                materialId: product.materialId || '',
                productId: product.id,
                date: data.date,
                referenceNo: invoiceNo,
                module: 'Sale',
                transactionType: 'OUT',
                quantity: pcsSold,
                runningBalance: remaining,
                remarks: `Sold as finished goods: ${product.name}`,
              });
            }

            return {
              sales: [...newSales, ...state.sales],
              finishedGoodsLots: lots,
              inventoryMovements: [...movements, ...(state.inventoryMovements || [])],
              vouchers,
              journalEntries,
            };
          } catch (e) {
            failure = e instanceof AppError ? e : new AppError((e as Error)?.message || 'Could not save the sale.');
            return state;
          }
        });
        if (failure) throw failure;
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
