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
}

export interface InventoryMovement {
  id: string;
  materialId: string;
  batchId?: string;
  date: string;
  referenceNo: string;
  module: "Purchase" | "Dispatch" | "Receive" | "Sale" | "Adjustment";
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
}

export interface ProcessorBill {
  id: string;
  billNo: string;
  processorId: string;
  date: string;
  receiptIds: string[];
  totalAmount: number;
  remarks?: string;
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

export interface LedgerEntry {
  id: string;
  date: string;
  partyId: string;
  partyType: "Processor" | "Supplier" | "Customer";
  type: "Debit" | "Credit";
  amount: number;
  referenceNo: string;
  description: string;
  voucherId?: string; // Links back to the source voucher
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
  | "Receipt Voucher" 
  | "Payment Voucher" 
  | "Purchase Voucher" 
  | "Sales Voucher" 
  | "Contra Voucher" 
  | "Opening Balance"
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
  | "Inventory Adjustment"
  | "Opening Balance";

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
