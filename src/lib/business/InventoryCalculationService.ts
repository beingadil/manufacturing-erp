import { Product, Batch, InventoryMovement } from '../../types/erp';

export class InventoryCalculationService {
  /**
   * Weighted-average cost per piece for a material, derived from its Active
   * batches (remaining value ÷ remaining pcs). Zero when the material has no
   * costed batches yet. Used for inventory valuation — never selling price.
   */
  static getWeightedAverageCostPerPiece(materialId: string, batches: Batch[]): number {
    let totalValue = 0;
    let totalPcs = 0;
    for (const b of batches) {
      if (b.materialId !== materialId || b.status !== 'Active' || b.remainingPcs <= 0 || b.initialPcs <= 0) continue;
      totalValue += (b.amount / b.initialPcs) * b.remainingPcs;
      totalPcs += b.remainingPcs;
    }
    return totalPcs > 0 ? totalValue / totalPcs : 0;
  }

  /**
   * Calculate total raw material stock correctly across all batches.
   * This is a derivation calculation, ensuring stock values are accurate.
   */
  static calculateRawMaterialStock(materialId: string, batches: Batch[]): number {
    return batches
      .filter(b => b.materialId === materialId && b.status === 'Active')
      .reduce((sum, b) => sum + (b.remainingPcs || 0), 0);
  }

  /**
   * Determine available dispatchable quantity for a specific batch.
   */
  static getAvailableDispatchQuantity(batchId: string, batches: Batch[]): number {
    const batch = batches.find(b => b.id === batchId);
    return batch?.remainingPcs || 0;
  }

  /**
   * Calculate exact remaining processor balance based on dispatches vs receipts.
   */
  static calculateProcessorPendingBalance(
    processorId: string,
    materialId: string,
    dispatches: any[],
    receipts: any[]
  ): number {
    const totalDispatched = dispatches
      .filter(d => d.processorId === processorId && d.materialId === materialId)
      .reduce((sum, d) => sum + (d.pcsSent || 0), 0);

    const totalReceived = receipts
      .filter(r => r.processorId === processorId && r.materialId === materialId)
      .reduce((sum, r) => sum + (r.pcsReceived || 0), 0);

    return totalDispatched - totalReceived;
  }

  /**
   * Calculate total product stock derived from receipts minus sales.
   * The ERP tracks stock via `processedStockPcs` on the Material linked to the Product.
   */
  static calculateFinishedProductStock(materialId: string, receipts: any[], sales: any[]): number {
    const totalProduced = receipts
      .filter(r => r.materialId === materialId)
      .reduce((sum, r) => sum + (r.pcsReceived || 0), 0);

    const totalSold = sales
      .filter(s => {
        // Sales refers to products, so we'd need to join products, but here we assume caller does it
        return s.materialId === materialId;
      })
      .reduce((sum, s) => sum + (s.pcsSold || 0), 0);

    return totalProduced - totalSold;
  }
}
