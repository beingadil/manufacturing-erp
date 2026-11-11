import { formatNumber } from '../utils';

export interface BillLineDetailInput {
  receiveNo: string;
  materialName?: string;
  pcsReceived: number;
  rateMethod?: 'per_piece' | 'per_kg';
  billingUnit?: string;
  /** Rate per piece (per_piece) or per KG (per_kg). */
  rate?: number;
  /** Weight of one piece — used to show the KG weight on a per-KG bill. */
  weightPerPiece?: number;
}

/**
 * The billing detail for ONE receipt: how many pieces, at what weight and
 * rate. A processor bill can cover several receipts. Each one is billed and
 * posted on its own, so each needs its own detail string — a combined entry
 * for the whole bill hides the weight and rate that made each line what it is.
 */
export function billLineQuantity(input: BillLineDetailInput): string {
  const perKg = input.rateMethod === 'per_kg';
  const unit = input.billingUnit || (perKg ? 'KG' : 'PCS');
  const parts: string[] = [`${formatNumber(input.pcsReceived)} PCS`];
  if (perKg && input.weightPerPiece) {
    parts.push(`${formatNumber(input.pcsReceived * input.weightPerPiece)} ${unit}`);
  }
  if (input.rate) parts.push(`@ ${formatNumber(input.rate)}/${unit}`);
  return parts.join(' · ');
}

/** The receipt's own line: which receipt, which material, and its billing detail. */
export function billLineDetails(input: BillLineDetailInput): string {
  const head = [`Receipt ${input.receiveNo}`];
  if (input.materialName) head.push(input.materialName);
  return [...head, billLineQuantity(input)].join(' · ');
}
