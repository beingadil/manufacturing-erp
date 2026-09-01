export interface MaterialCategory {
  id: string;
  name: string;
  type?: string;
  description?: string;
  status: 'Active' | 'Inactive';
}

export interface RawMaterial {
  id: string;
  code?: string;
  name: string;
  categoryId: string;
  unit?: string;
  minStockLevel?: number;
  currentStock?: number;
  description?: string;
  status: 'Active' | 'Inactive';
  stockPcs: number;
  processedStockPcs: number;
  // New fields for traceability
  reservedStockPcs?: number; 
  atProcessorPcs?: number;
}

export interface Batch {
  id: string;
  batchNo: string;
  purchaseId: string;
  supplierId: string;
  materialId: string;
  date: string;
  weight: number;
  weightUnit: "KGs" | "Tons";
  ratePerUnit: number;
  weightPerPiece: number;
  initialPcs: number;
  remainingPcs: number;
  amount: number;
  status: "Active" | "Depleted";
  /** Pcs of this batch physically at a processor (WIP) — valued at this batch's purchase cost. */
  atProcessorPcs?: number;
  /** Pcs of this batch finished/processed and on hand (unsold) — valued at this batch's purchase cost. */
  processedPcs?: number;
  /** The processing stage this batch is currently at (informational; derived from movements). */
  currentStageId?: string;
  /** Pcs of this batch available to send to the next processing stage (received from previous stage, not yet dispatched). */
  stageAvailablePcs?: number;
}

export type ProcessingRateMethod = "per_piece" | "per_kg";

/**
 * A configurable manufacturing/processing stage (spec §4).
 *
 * The stage master is data-driven: the final stage is determined by
 * `isFinalStage`, never hardcoded, so future stages (Cutting, Grinding,
 * Heat Treatment, Packaging, …) can be added without code restructuring.
 */
export interface ProcessingStage {
  id: string;
  name: string;
  /** Order in the chain — stage 1 draws from raw stock. */
  sequence: number;
  description?: string;
  active: boolean;
  inputUnit?: string;
  /** Billing unit label, e.g. "Per PCS" or "Per KG". */
  billingUnit?: string;
  billingEnabled: boolean;
  /** How the stage's bill amount is computed: per_piece = qty × rate, per_kg = qty × weightPerPiece(kg) × rate. */
  rateMethod: ProcessingStageRateMethod;
  /** When true, receiving from this stage produces saleable Finished Goods. */
  isFinalStage: boolean;
  /** The next stage in the chain (null/undefined when final). */
  nextStageId?: string;
}

export type ProcessingStageRateMethod = "per_piece" | "per_kg";

export interface InventoryMovement {
  id: string;
  materialId: string;
  batchId?: string;
  date: string;
  referenceNo: string;
  module: "Purchase" | "Dispatch" | "Receive" | "Sale" | "Adjustment" | "Loss";
  transactionType: "IN" | "OUT";
  userId?: string;
  quantity: number;
  runningBalance: number;
  remarks?: string;
}

export interface Processor {
  id: string;
  code?: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  status?: string;
  balancePayable: number;
  accountId?: string;
  /** The processing stage this worker performs (worker type — Initial
   *  Processor / Machine / Acid / Polish …). Undefined = General worker who can
   *  take work at ANY stage. Config-driven: new stages appear automatically. */
  stageId?: string;
}

export interface Supplier {
  id: string;
  code?: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  ntn?: string;
  notes?: string;
  status?: string;
  balancePayable: number;
  accountId?: string;
}

export interface Customer {
  id: string;
  code?: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  ntn?: string;
  notes?: string;
  status?: string;
  balanceReceivable: number;
  accountId?: string;
}

export interface Purchase {
  id: string;
  purchaseNo: string;
  supplierId: string;
  invoiceNo?: string;
  materialId: string;
  date: string;
  weight: number;
  weightUnit: "KGs" | "Tons";
  ratePerUnit: number;
  weightPerPiece: number;
  calculatedPcs: number;
  amount: number;
  remarks?: string;
}

export interface ProcessingSend {
  id: string;
  dispatchNo: string;
  processorId: string;
  materialId: string;
  batchId?: string; // Link to specific batch
  date: string;
  pcsSent: number;
  pcsReceived: number;
  ratePerPiece: number;
  remarks?: string;
  status: "Pending" | "Partial" | "Closed" | "Adjusted";
  adjustedToDispatchId?: string;
  /** Processing stage this material is sent TO (which worker/stage does the work). */
  stageId?: string;
  /** Pcs of this dispatch explicitly recorded as loss/wastage (never automatic). */
  lossQuantity?: number;
}

export interface ProcessingReceipt {
  id: string;
  receiveNo: string;
  sendId: string;
  processorId: string;
  materialId: string;
  date: string;
  pcsReceived: number;
  billAmount: number; // Keep for reference, but actual billing is in ProcessorBill
  billedStatus?: "Unbilled" | "Billed";
  remarks?: string;
  /** Stage this receipt is received FROM (the worker/stage that did the work). */
  stageId?: string;
  /** Rate method used to compute billAmount (per_piece vs per_kg). */
  rateMethod?: "per_piece" | "per_kg";
  /** Billing unit label (e.g. 'PCS' or 'KG'). */
  billingUnit?: string;
}

export interface ProcessorBill {
  id: string;
  billNo: string;
  processorId: string;
  date: string;
  receiptIds: string[];
  totalAmount: number;
  remarks?: string;
  /** Stage this bill covers (the stage whose receipts are being billed). */
  stageId?: string;
  /** Rate method used for the bill (per_piece vs per_kg). */
  rateMethod?: "per_piece" | "per_kg";
  /** Billing unit label (e.g. "Per PCS" or "Per KG"). */
  billingUnit?: string;
  /** Optional per-receipt billed amount override (receiptId → amount). When
   *  absent, each line bills at the receipt's computed billAmount — the
   *  dispatch rate is the default and can be finalized at bill time. */
  lineAmounts?: Record<string, number>;
}

export interface Product {
  id: string;
  code?: string;
  name: string;
  categoryId?: string;
  materialId?: string;
  unit?: string;
  minStockLevel?: number;
  price?: number;
  sku?: string;
  status?: string;
  sellingPrice: number;
  description?: string;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  customerId: string;
  productId: string;
  batchId?: string; // Optional: Link sale to specific batch
  date: string;
  pcsSold: number;
  pricePerPiece: number;
  totalAmount: number;
}

// -- Accounting System --

export type AccountType = 
  | "Assets" 
  | "Liabilities" 
  | "Equity" 
  | "Revenue" 
  | "Expenses" 
  | "Cost of Goods Sold" 
  | "Other Income" 
  | "Other Expenses";

export interface AccountSubtype {
  id: string;
  name: string;
  type: AccountType;
  description?: string;
  isSystem?: boolean; // Protect system subtypes from deletion
}

export interface Account {
  id: string;
  code: string;
  name: string;
  subtypeId: string;
  type: AccountType;
  openingBalance: number;
  openingBalanceType: "Debit" | "Credit";
  status: "Active" | "Inactive";
  description?: string;
  isSystem?: boolean; // System accounts like Cash, Accounts Receivable, etc.
  linkedEntityId?: string; // e.g., Customer ID, Supplier ID for sub-ledgers
  parentId?: string; // For Account Hierarchy
}

export type VoucherType = 
  | "Journal Voucher" 
  | "Purchase Voucher" 
  | "Sales Voucher" 
  | "Bank Payment"
  | "Bank Receipt"
  | "Cash Payment"
  | "Cash Receipt"
  | "Processor Bill";

export type SourceModule = 
  | "Purchase" 
  | "Sales" 
  | "Processing" 
  | "Cashbook" 
  | "Manual" 
  | "Inventory Adjustment";

export interface VoucherAudit {
  id: string;
  modifiedAt: string;
  modifiedBy?: string;
  action: "Created" | "Updated" | "Cancelled" | "Deleted";
  previousValues?: any;
  updatedValues?: any;
  reason?: string;
}

export type VoucherStatus = "Draft" | "Posted" | "Cancelled" | "Deleted";

export interface Voucher {
  id: string;
  voucherNo: string;
  date: string;
  type: VoucherType;
  referenceNo?: string;
  sourceModule: SourceModule;
  sourceId?: string;
  narration: string;
  totalDebit: number;
  totalCredit: number;
  createdBy?: string;
  createdAt: string;
  status: VoucherStatus;
  versionHistory?: VoucherAudit[];
}

export interface JournalEntry {
  id: string;
  voucherId: string;
  accountId: string;
  debit: number;
  credit: number;
  narration?: string;
}

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string;
  logoUrl?: string;
}

export interface DocumentSettings {
  footerText: string;
  showSignatureDisclaimer: boolean;
  defaultOrientation: "Portrait" | "Landscape";
}
