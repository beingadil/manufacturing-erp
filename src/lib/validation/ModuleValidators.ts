import { useERPStore } from '../../store/useERPStore';
import { UnitConversionService } from '../business/UnitConversionService';
import { BusinessValidators } from './BusinessValidators';
import { FieldValidators } from './FieldValidators';
import { IValidator, ValidationResult } from './ValidationTypes';

// ==========================================
// Purchase Validator
// ==========================================
export interface PurchaseDTO {
  supplierId: string;
  materialId: string;
  date: string;
  weight: number;
  weightUnit: 'KGs' | 'Tons';
  ratePerUnit: number;
  weightPerPiece: number;
}

export class PurchaseValidator implements IValidator<PurchaseDTO> {
  validate(data: PurchaseDTO): ValidationResult {
    const result = new ValidationResult();

    // Field Validations
    FieldValidators.required(data.supplierId, 'Supplier', result);
    FieldValidators.required(data.materialId, 'Material', result);
    FieldValidators.required(data.date, 'Date', result);
    FieldValidators.positive(data.weight, 'Weight', result);
    FieldValidators.positive(data.ratePerUnit, 'Rate per Unit', result);
    FieldValidators.positive(data.weightPerPiece, 'Weight per Piece', result);

    if (result.isValid) {
      // Business Validations
      BusinessValidators.mustExist('suppliers', data.supplierId, 'Supplier', result);
      BusinessValidators.mustBeActive('suppliers', data.supplierId, 'Supplier', result);
      BusinessValidators.mustExist('materials', data.materialId, 'Raw Material', result);
      BusinessValidators.mustBeActive('materials', data.materialId, 'Raw Material', result);

      const calculatedPcs = UnitConversionService.calculatePcsFromWeight(data.weight, data.weightUnit as any, data.weightPerPiece);
      FieldValidators.positive(calculatedPcs, 'Calculated Pieces', result);
    }

    return result;
  }
}

// ==========================================
// Sales Validator
// ==========================================
export interface SalesDTO {
  customerId: string;
  productId: string;
  date: string;
  pcsSold: number;
  pricePerPiece: number;
}

export class SalesValidator implements IValidator<SalesDTO> {
  validate(data: SalesDTO): ValidationResult {
    const result = new ValidationResult();

    FieldValidators.required(data.customerId, 'Customer', result);
    FieldValidators.required(data.productId, 'Product', result);
    FieldValidators.required(data.date, 'Date', result);
    FieldValidators.positive(data.pcsSold, 'Pieces Sold', result);
    FieldValidators.positive(data.pricePerPiece, 'Price per Piece', result);

    if (result.isValid) {
      BusinessValidators.mustExist('customers', data.customerId, 'Customer', result);
      BusinessValidators.mustBeActive('customers', data.customerId, 'Customer', result);
      BusinessValidators.mustExist('products', data.productId, 'Product', result);
      BusinessValidators.mustBeActive('products', data.productId, 'Product', result);
      BusinessValidators.productStockAvailable(data.productId, data.pcsSold, result);
    }

    return result;
  }
}

// ==========================================
// Processing Dispatch Validator
// ==========================================
export interface ProcessingDispatchDTO {
  processorId: string;
  materialId: string;
  date: string;
  pcsSent: number;
  ratePerPiece: number;
  batchId?: string;
  remarks?: string;
  /** Processing stage this dispatch sends TO (optional — legacy = Initial Processor). */
  stageId?: string;
}

export class ProcessingDispatchValidator implements IValidator<ProcessingDispatchDTO> {
  validate(data: ProcessingDispatchDTO): ValidationResult {
    const result = new ValidationResult();

    FieldValidators.required(data.processorId, 'Processor', result);
    FieldValidators.required(data.materialId, 'Material', result);
    FieldValidators.required(data.date, 'Date', result);
    FieldValidators.positive(data.pcsSent, 'Pieces Sent', result);
    FieldValidators.nonNegative(data.ratePerPiece, 'Rate per Piece', result);

    if (result.isValid) {
      BusinessValidators.mustExist('processors', data.processorId, 'Processor', result);
      BusinessValidators.mustBeActive('processors', data.processorId, 'Processor', result);
      BusinessValidators.mustExist('materials', data.materialId, 'Raw Material', result);
      if (data.stageId) BusinessValidators.mustExist('processingStages', data.stageId, 'Processing Stage', result);

      // Only stage-1 / legacy dispatches draw from raw stock; intermediate
      // stages move pcs already in WIP, so the raw-stock check only applies to
      // the former (the store re-validates authoritatively).
      const state = (useERPStore.getState() as any);
      const stages = (state.processingStages || []);
      const consumesRaw = !data.stageId || !stages.find((s: any) => s.id === data.stageId) || (stages.find((s: any) => s.id === data.stageId)?.sequence || 0) <= 1;
      if (consumesRaw) BusinessValidators.stockAvailable(data.materialId, data.pcsSent, result);
    }

    return result;
  }
}

// ==========================================
// Processing Receive Validator
// ==========================================
export interface ProcessingReceiveDTO {
  sendId: string;
  processorId: string;
  materialId: string;
  date: string;
  pcsReceived: number;
  remarks?: string;
  dispatchedPcs: number;
  previouslyReceivedPcs: number;
  /** Stage this receipt is received FROM (legacy = Initial Processor). */
  stageId?: string;
  /** Rate method used to compute the bill amount. */
  rateMethod?: 'per_piece' | 'per_kg';
  /** Billing unit label. */
  billingUnit?: string;
}

export class ProcessingReceiveValidator implements IValidator<ProcessingReceiveDTO> {
  validate(data: ProcessingReceiveDTO): ValidationResult {
    const result = new ValidationResult();

    FieldValidators.required(data.sendId, 'Dispatch Reference', result);
    FieldValidators.required(data.processorId, 'Processor', result);
    FieldValidators.required(data.materialId, 'Material', result);
    FieldValidators.required(data.date, 'Date', result);
    FieldValidators.positive(data.pcsReceived, 'Pieces Received', result);

    if (result.isValid) {
      BusinessValidators.mustExist('processors', data.processorId, 'Processor', result);
      BusinessValidators.mustExist('materials', data.materialId, 'Raw Material', result);
      if (data.stageId) BusinessValidators.mustExist('processingStages', data.stageId, 'Processing Stage', result);
      BusinessValidators.validReceiveQuantity(data.dispatchedPcs, data.previouslyReceivedPcs, data.pcsReceived, result);
    }

    return result;
  }
}

// ==========================================
// Processing Loss Validator
// ==========================================
export interface ProcessingLossDTO {
  sendId: string;
  quantity: number;
  date?: string;
  remarks?: string;
}

export class ProcessingLossValidator implements IValidator<ProcessingLossDTO> {
  validate(data: ProcessingLossDTO): ValidationResult {
    const result = new ValidationResult();

    FieldValidators.required(data.sendId, 'Dispatch Reference', result);
    FieldValidators.positive(data.quantity, 'Loss Quantity', result);

    if (result.isValid) {
      const state = useERPStore.getState();
      const send = state.processingSends.find(s => s.id === data.sendId);
      if (!send) {
        result.addError('Dispatch not found', 'Dispatch Reference');
      } else {
        const pending = send.pcsSent - send.pcsReceived - (send.lossQuantity || 0);
        if (data.quantity > pending) {
          result.addError(
            `Loss cannot exceed pending quantity. Pending: ${pending}, Requested loss: ${data.quantity}`,
            'Loss Quantity'
          );
        }
      }
    }

    return result;
  }
}

// ==========================================
// Processing Stage Validator
// ==========================================
export interface ProcessingStageDTO {
  name: string;
  sequence: number;
  description?: string;
  active: boolean;
  inputUnit?: string;
  billingUnit?: string;
  billingEnabled: boolean;
  rateMethod: 'per_piece' | 'per_kg';
  isFinalStage: boolean;
  nextStageId?: string;
}

export class ProcessingStageValidator implements IValidator<ProcessingStageDTO> {
  validate(data: ProcessingStageDTO): ValidationResult {
    const result = new ValidationResult();

    FieldValidators.required(data.name, 'Stage Name', result);
    FieldValidators.positive(data.sequence, 'Sequence', result);
    if (data.rateMethod !== 'per_piece' && data.rateMethod !== 'per_kg') {
      result.addError('Rate method must be per_piece or per_kg', 'Rate Method');
    }

    return result;
  }
}

// ==========================================
// Voucher Validator
// ==========================================
export interface VoucherDTO {
  id?: string;
  date: string;
  type: string;
  referenceNo?: string;
  sourceModule: string;
  narration?: string;
  entries: { accountId: string; debit: number; credit: number; narration?: string }[];
}

export class VoucherValidator implements IValidator<VoucherDTO> {
  validate(data: VoucherDTO): ValidationResult {
    const result = new ValidationResult();

    FieldValidators.required(data.date, 'Date', result);
    FieldValidators.required(data.type, 'Voucher Type', result);

    if (data.entries.length < 2) {
      result.addError('A voucher must have at least two journal entries', 'Entries');
    }

    let totalDebit = 0;
    let totalCredit = 0;

    data.entries.forEach((entry, index) => {
      FieldValidators.required(entry.accountId, `Account for entry ${index + 1}`, result);
      
      if (entry.accountId) {
        BusinessValidators.mustExist('accounts', entry.accountId, `Account in entry ${index + 1}`, result);
      }

      totalDebit += entry.debit || 0;
      totalCredit += entry.credit || 0;
    });

    if (result.isValid) {
      BusinessValidators.voucherMustBalance(totalDebit, totalCredit, result);
    }

    return result;
  }
}
