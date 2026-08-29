import { useERPStore } from '../../store/useERPStore';
import { ValidationResult } from './ValidationTypes';

export class BusinessValidators {
  static mustExist(table: keyof ReturnType<typeof useERPStore.getState>, id: string, entityName: string, result: ValidationResult) {
    if (!id) return;
    const state = useERPStore.getState() as any;
    const records = state[table] || [];
    const exists = records.some((r: any) => r.id === id);
    if (!exists) {
      result.addError(`${entityName} does not exist in the system.`, entityName);
    }
  }

  static mustBeActive(table: keyof ReturnType<typeof useERPStore.getState>, id: string, entityName: string, result: ValidationResult) {
    if (!id) return;
    const state = useERPStore.getState() as any;
    const records = state[table] || [];
    const record = records.find((r: any) => r.id === id);
    if (record && record.status && record.status !== 'Active') {
      result.addError(`${entityName} is currently inactive and cannot be used.`, entityName);
    }
  }

  static stockAvailable(materialId: string, requiredPcs: number, result: ValidationResult) {
    if (!materialId || requiredPcs <= 0) return;
    const state = useERPStore.getState();
    const material = state.materials.find(m => m.id === materialId);
    if (material) {
      if ((material.stockPcs || 0) < requiredPcs) {
        result.addError(`Insufficient stock. Required: ${requiredPcs}, Available: ${material.stockPcs || 0}`, 'Stock');
      }
    }
  }

  static productStockAvailable(productId: string, requiredPcs: number, result: ValidationResult) {
    if (!productId || requiredPcs <= 0) return;
    const state = useERPStore.getState();
    const product = state.products.find(p => p.id === productId);
    if (product) {
      const material = state.materials.find(m => m.id === product.materialId);
      if (material && (material.processedStockPcs || 0) < requiredPcs) {
        result.addError(`Insufficient product stock. Required: ${requiredPcs}, Available: ${material.processedStockPcs || 0}`, 'Product Stock');
      }
    }
  }

  static processedStockAvailable(materialId: string, requiredPcs: number, result: ValidationResult) {
    if (!materialId || requiredPcs <= 0) return;
    const state = useERPStore.getState();
    const material = state.materials.find(m => m.id === materialId);
    if (material) {
      if ((material.processedStockPcs || 0) < requiredPcs) {
        result.addError(`Insufficient processed stock. Required: ${requiredPcs}, Available: ${material.processedStockPcs || 0}`, 'Processed Stock');
      }
    }
  }

  static voucherMustBalance(debits: number, credits: number, result: ValidationResult) {
    // Handling floating point precision issues safely
    if (Math.abs(debits - credits) > 0.01) {
      result.addError(`Voucher does not balance. Total Debit: ${debits.toFixed(2)}, Total Credit: ${credits.toFixed(2)}`, 'Voucher Balance');
    }
  }

  static uniqueVoucherNumber(voucherNo: string, currentId: string | null, result: ValidationResult) {
    if (!voucherNo) return;
    const state = useERPStore.getState();
    const exists = state.vouchers.some(v => v.voucherNo === voucherNo && v.id !== currentId);
    if (exists) {
      result.addError(`Voucher number ${voucherNo} is already in use.`, 'voucherNo');
    }
  }

  static validReceiveQuantity(dispatchedPcs: number, previouslyReceivedPcs: number, newReceivedPcs: number, result: ValidationResult) {
    const totalWillReceive = previouslyReceivedPcs + newReceivedPcs;
    if (totalWillReceive > dispatchedPcs) {
      result.addError(`Cannot receive more than dispatched. Dispatched: ${dispatchedPcs}, Total Received/Receiving: ${totalWillReceive}`, 'Receive Quantity');
    }
  }

  static validDateRange(startDate: string, endDate: string, result: ValidationResult) {
    if (startDate && endDate) {
      if (new Date(startDate) > new Date(endDate)) {
        result.addError('Start Date cannot be after End Date', 'Date Range');
      }
    }
  }
}
