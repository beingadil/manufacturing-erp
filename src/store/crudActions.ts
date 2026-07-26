import { StoreApi } from 'zustand';
import { ERPState } from './useERPStore';
import { v4 as uuidv4 } from 'uuid';
import { UnitConversionService } from '../lib/business/UnitConversionService';

export const createCRUDActions = (
  set: StoreApi<ERPState>['setState'],
  get: StoreApi<ERPState>['getState']
) => ({
  deletePurchase: (id: string) => {
    set((state) => {
      const purchase = state.purchases.find(p => p.id === id);
      if (!purchase) return state;

      // 1. Remove associated batch
      const batch = state.batches.find(b => b.purchaseId === id);
      const batchId = batch?.id;
      
      // 2. Reduce material stock
      let updatedMaterials = state.materials;
      if (batch) {
        updatedMaterials = state.materials.map(m => 
          m.id === purchase.materialId 
            ? { ...m, stockPcs: m.stockPcs - batch.initialPcs }
            : m
        );
      }

      // 3. Remove inventory movement for this batch/purchase
      const updatedInventoryMovements = state.inventoryMovements.filter(im => 
        im.referenceNo !== purchase.purchaseNo && im.batchId !== batchId
      );

      // 4. Update supplier balance
      const updatedSuppliers = state.suppliers.map(s => 
        s.id === purchase.supplierId 
          ? { ...s, balancePayable: s.balancePayable - purchase.amount }
          : s
      );

      // 5. Remove associated voucher and journal entries
      const voucher = state.vouchers.find(v => v.sourceId === purchase.id && v.sourceModule === 'Purchase');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.filter(v => v.id !== voucher.id);
        updatedJournalEntries = state.journalEntries.filter(je => je.voucherId !== voucher.id);
      }

      // 6. Remove legacy ledger entries
      const updatedLedgerEntries = state.ledgerEntries.filter(le => le.referenceNo !== purchase.purchaseNo);

      return {
        ...state,
        purchases: state.purchases.filter(p => p.id !== id),
        batches: state.batches.filter(b => b.purchaseId !== id),
        materials: updatedMaterials,
        inventoryMovements: updatedInventoryMovements,
        suppliers: updatedSuppliers,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries,
        ledgerEntries: updatedLedgerEntries
      };
    });
  },

  updatePurchase: (id: string, data: any) => {
    // A robust way to update a transaction is to reverse the old one, and apply the new one.
    // However, since we might want to keep the same IDs (like voucherNo, purchaseNo),
    // it's cleaner to calculate diffs and apply them.
    // For simplicity, we'll update the fields directly and adjust balances by the diff.
    set((state) => {
      const oldPurchase = state.purchases.find(p => p.id === id);
      if (!oldPurchase) return state;

      const weightInKg = UnitConversionService.convertToKg(data.weight, data.weightUnit);
      const newCalculatedPcs = UnitConversionService.calculatePcsFromWeight(data.weight, data.weightUnit, data.weightPerPiece);
      const newAmount = data.weight * data.ratePerUnit;

      const diffPcs = newCalculatedPcs - oldPurchase.calculatedPcs;
      const diffAmount = newAmount - oldPurchase.amount;

      // Update Purchase
      const updatedPurchases = state.purchases.map(p => 
        p.id === id ? { ...p, ...data, calculatedPcs: newCalculatedPcs, amount: newAmount } : p
      );

      // Update Batch
      const oldBatch = state.batches.find(b => b.purchaseId === id);
      let updatedBatches = state.batches;
      if (oldBatch) {
        updatedBatches = state.batches.map(b => 
          b.id === oldBatch.id 
            ? { ...b, weight: data.weight, weightUnit: data.weightUnit, ratePerUnit: data.ratePerUnit, weightPerPiece: data.weightPerPiece, initialPcs: newCalculatedPcs, remainingPcs: b.remainingPcs + diffPcs, amount: newAmount } 
            : b
        );
      }

      // Update Material stock
      const updatedMaterials = state.materials.map(m => 
        m.id === oldPurchase.materialId 
          ? { ...m, stockPcs: m.stockPcs + diffPcs }
          : m
      );

      // Update Supplier balance
      const updatedSuppliers = state.suppliers.map(s => 
        s.id === oldPurchase.supplierId 
          ? { ...s, balancePayable: s.balancePayable + diffAmount }
          : s
      );

      // Update Voucher and JEs
      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Purchase');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.map(v => 
          v.id === voucher.id ? { ...v, totalDebit: newAmount, totalCredit: newAmount, narration: `Purchase of ${data.weight} ${data.weightUnit} from Supplier` } : v
        );
        updatedJournalEntries = state.journalEntries.map(je => 
          je.voucherId === voucher.id 
            ? { ...je, debit: je.debit > 0 ? newAmount : 0, credit: je.credit > 0 ? newAmount : 0 }
            : je
        );
      }

      return {
        ...state,
        purchases: updatedPurchases,
        batches: updatedBatches,
        materials: updatedMaterials,
        suppliers: updatedSuppliers,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
  },

  deleteSale: (id: string) => {
    set((state) => {
      const sale = state.sales.find(s => s.id === id);
      if (!sale) return state;

      // 1. Reverse material processedStockPcs
      const product = state.products.find(p => p.id === sale.productId);
      let updatedMaterials = state.materials;
      if (product) {
        updatedMaterials = state.materials.map(m => 
          m.id === product.materialId 
            ? { ...m, processedStockPcs: m.processedStockPcs + sale.pcsSold }
            : m
        );
      }

      // 2. Reduce Customer balance
      const updatedCustomers = state.customers.map(c => 
        c.id === sale.customerId 
          ? { ...c, balanceReceivable: c.balanceReceivable - sale.totalAmount }
          : c
      );

      // 3. Remove inventory movement
      const updatedInventoryMovements = state.inventoryMovements.filter(im => im.referenceNo !== sale.invoiceNo);

      // 4. Remove voucher and JEs
      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Sales');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.filter(v => v.id !== voucher.id);
        updatedJournalEntries = state.journalEntries.filter(je => je.voucherId !== voucher.id);
      }

      const updatedLedgerEntries = state.ledgerEntries.filter(le => le.referenceNo !== sale.invoiceNo);

      return {
        ...state,
        sales: state.sales.filter(s => s.id !== id),
        materials: updatedMaterials,
        customers: updatedCustomers,
        inventoryMovements: updatedInventoryMovements,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries,
        ledgerEntries: updatedLedgerEntries
      };
    });
  },

  updateSale: (id: string, data: any) => {
    set((state) => {
      const oldSale = state.sales.find(s => s.id === id);
      if (!oldSale) return state;

      const newTotalAmount = data.pcsSold * data.pricePerPiece;
      const diffPcs = data.pcsSold - oldSale.pcsSold;
      const diffAmount = newTotalAmount - oldSale.totalAmount;

      const updatedSales = state.sales.map(s => 
        s.id === id ? { ...s, ...data, totalAmount: newTotalAmount } : s
      );

      const product = state.products.find(p => p.id === oldSale.productId);
      let updatedMaterials = state.materials;
      if (product) {
        // diffPcs > 0 means more pcs sold, so processedStockPcs goes down
        updatedMaterials = state.materials.map(m => 
          m.id === product.materialId 
            ? { ...m, processedStockPcs: m.processedStockPcs - diffPcs }
            : m
        );
      }

      const updatedCustomers = state.customers.map(c => 
        c.id === oldSale.customerId 
          ? { ...c, balanceReceivable: c.balanceReceivable + diffAmount }
          : c
      );

      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Sales');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.map(v => 
          v.id === voucher.id ? { ...v, totalDebit: newTotalAmount, totalCredit: newTotalAmount } : v
        );
        updatedJournalEntries = state.journalEntries.map(je => 
          je.voucherId === voucher.id 
            ? { ...je, debit: je.debit > 0 ? newTotalAmount : 0, credit: je.credit > 0 ? newTotalAmount : 0 }
            : je
        );
      }

      return {
        ...state,
        sales: updatedSales,
        materials: updatedMaterials,
        customers: updatedCustomers,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
  },

  deleteAccount: (id: string) => {
    set((state) => ({
      ...state,
      accounts: state.accounts.filter(a => a.id !== id)
    }));
  },

  updateSupplier: (id: string, data: any) => set(state => ({ suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...data } : s) })),
  updateCustomer: (id: string, data: any) => set(state => ({ customers: state.customers.map(c => c.id === id ? { ...c, ...data } : c) })),
  updateProcessor: (id: string, data: any) => set(state => ({ processors: state.processors.map(p => p.id === id ? { ...p, ...data } : p) })),

  updateAccount: (id: string, data: any) => {
    set((state) => ({
      ...state,
      accounts: state.accounts.map(a => a.id === id ? { ...a, ...data } : a)
    }));
  },

  // Stub Processing deletes to handle later, since they are complex
  deleteProcessingSend: (id: string) => {
    set((state) => {
      // Find the send
      const send = state.processingSends.find(s => s.id === id);
      if (!send) return state;

      // Reverse material stock
      const updatedMaterials = state.materials.map(m => 
        m.id === send.materialId ? { ...m, stockPcs: m.stockPcs + send.pcsSent } : m
      );

      // Restore batch remainingPcs
      const updatedBatches = state.batches.map(b => 
        b.id === send.batchId ? { ...b, remainingPcs: b.remainingPcs + send.pcsSent } : b
      );

      // Remove from pending 
      return {
        ...state,
        processingSends: state.processingSends.filter(s => s.id !== id),
        materials: updatedMaterials,
        batches: updatedBatches,
        inventoryMovements: state.inventoryMovements.filter(im => im.referenceNo !== send.dispatchNo)
      };
    });
  },
  

  updateProcessingSend: (id: string, data: any) => {
    set((state) => {
      const oldSend = state.processingSends.find(s => s.id === id);
      if (!oldSend) return state;

      const diffPcs = data.pcsSent - oldSend.pcsSent;

      const updatedSends = state.processingSends.map(s =>
        s.id === id ? { ...s, ...data } : s
      );

      const updatedMaterials = state.materials.map(m =>
        m.id === oldSend.materialId
          ? { ...m, stockPcs: m.stockPcs - diffPcs, atProcessorPcs: (m.atProcessorPcs || 0) + diffPcs }
          : m
      );

      return {
        ...state,
        processingSends: updatedSends,
        materials: updatedMaterials
      };
    });
  },


  deleteProcessingReceipt: (id: string) => {
    set((state) => {
      const receipt = state.processingReceipts.find(r => r.id === id);
      if (!receipt) return state;

      // We need to reverse processedStockPcs
      const updatedMaterials = state.materials.map(m => 
        m.id === receipt.materialId ? { ...m, processedStockPcs: m.processedStockPcs - receipt.pcsReceived } : m
      );

      // We also need to restore pending pcs on the original sends
      const updatedSends = state.processingSends.map(s => {
        if (receipt.sendId === s.id) {
          // This is a rough estimation since we can't easily track exact deductions per send.
          // For a real ERP, we'd need a mapping table. We'll just reset status.
          return { ...s, pcsReceived: 0, status: 'Pending' as const };
        }
        return s;
      });

      return {
        ...state,
        processingReceipts: state.processingReceipts.filter(r => r.id !== id),
        processingSends: updatedSends,
        materials: updatedMaterials,
        inventoryMovements: state.inventoryMovements.filter(im => im.referenceNo !== receipt.receiveNo)
      };
    });
  },


  updateProcessingReceipt: (id: string, data: any) => {
    set((state) => {
      const oldReceipt = state.processingReceipts.find(r => r.id === id);
      if (!oldReceipt) return state;

      const diffPcs = data.pcsReceived - oldReceipt.pcsReceived;
      
      const updatedReceipts = state.processingReceipts.map(r =>
        r.id === id ? { ...r, ...data } : r
      );

      const updatedSends = state.processingSends.map(s => {
        if (s.id === oldReceipt.sendId) {
          const newReceived = s.pcsReceived + diffPcs;
          return {
            ...s,
            pcsReceived: newReceived,
            status: (newReceived >= s.pcsSent ? 'Closed' : 'Partial') as 'Closed' | 'Partial' | 'Pending' | 'Adjusted'
          };
        }
        return s;
      });

      const updatedMaterials = state.materials.map(m =>
        m.id === oldReceipt.materialId
          ? { ...m, atProcessorPcs: (m.atProcessorPcs || 0) - diffPcs, processedStockPcs: m.processedStockPcs + diffPcs }
          : m
      );

      return {
        ...state,
        processingReceipts: updatedReceipts,
        processingSends: updatedSends,
        materials: updatedMaterials
      };
    });
  },


  deleteProcessorBill: (id: string) => {
    set((state) => {
      const bill = state.processorBills.find(b => b.id === id);
      if (!bill) return state;

      // Restore receipt statuses
      const updatedReceipts = state.processingReceipts.map(r => 
        bill.receiptIds.includes(r.id) ? { ...r, billedStatus: 'Unbilled' as const } : r
      );

      // Reduce processor balance
      const updatedProcessors = state.processors.map(p => 
        p.id === bill.processorId ? { ...p, balancePayable: p.balancePayable - bill.totalAmount } : p
      );

      // Remove voucher
      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Processing');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.filter(v => v.id !== voucher.id);
        updatedJournalEntries = state.journalEntries.filter(je => je.voucherId !== voucher.id);
      }

      return {
        ...state,
        processorBills: state.processorBills.filter(b => b.id !== id),
        processingReceipts: updatedReceipts,
        processors: updatedProcessors,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries,
        ledgerEntries: state.ledgerEntries.filter(le => le.referenceNo !== bill.billNo)
      };
    });
  },


  updateProcessorBill: (id: string, data: any) => {
    set((state) => {
      const oldBill = state.processorBills.find(b => b.id === id);
      if (!oldBill) return state;

      const newTotalAmount = data.totalAmount;
      const diffAmount = newTotalAmount - oldBill.totalAmount;

      const updatedBills = state.processorBills.map(b =>
        b.id === id ? { ...b, ...data } : b
      );

      const updatedProcessors = state.processors.map(p =>
        p.id === oldBill.processorId
          ? { ...p, balancePayable: p.balancePayable + diffAmount }
          : p
      );

      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Processing');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.map(v =>
          v.id === voucher.id ? { ...v, totalDebit: newTotalAmount, totalCredit: newTotalAmount, date: data.date } : v
        );
        updatedJournalEntries = state.journalEntries.map(je =>
          je.voucherId === voucher.id
            ? { ...je, debit: je.debit > 0 ? newTotalAmount : 0, credit: je.credit > 0 ? newTotalAmount : 0 }
            : je
        );
      }

      return {
        ...state,
        processorBills: updatedBills,
        processors: updatedProcessors,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
  },


});
