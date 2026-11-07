import { BusinessWorkflowEngine } from '../lib/business/BusinessWorkflowEngine';
import { SalesDTO, SalesValidator, ValidationEngine } from '../lib/validation';
import { SaleGroupData, useERPStore } from '../store/useERPStore';

export class SalesService {
  static create(data: SalesDTO) {
    return BusinessWorkflowEngine.executeWorkflow('Sales Creation', () => {
      ValidationEngine.validate(new SalesValidator(), data, 'Sales Creation');
      const state = useERPStore.getState();
      state.addSale(data);
    }, 'Sale saved successfully');
  }

  /**
   * Save every line of a multi-line invoice atomically: one invoice number,
   * one Sale row (and one voucher) per product. The old form only saved
   * `lines[0]`, silently dropping the rest.
   */
  static createGroup(data: SaleGroupData) {
    return BusinessWorkflowEngine.executeWorkflow('Sales Creation', () => {
      if (!data.lines || data.lines.length === 0) {
        throw new Error('Add at least one product line before saving.');
      }
      for (const line of data.lines) {
        ValidationEngine.validate(
          new SalesValidator(),
          {
            customerId: data.customerId,
            productId: line.productId,
            date: data.date,
            pcsSold: line.pcsSold,
            pricePerPiece: line.pricePerPiece,
          },
          'Sales Creation',
        );
      }
      useERPStore.getState().addSaleGroup(data);
    }, 'Sale saved successfully');
  }

  static update(id: string, data: Partial<SalesDTO>) {
    return BusinessWorkflowEngine.executeWorkflow('Sales Update', () => {
      const state = useERPStore.getState();
      const existing = state.sales.find(p => p.id === id);
      if (!existing) throw new Error('Sale not found');

      const mergedData = { ...existing, ...data } as SalesDTO;
      ValidationEngine.validate(new SalesValidator(), mergedData, 'Sales Update');

      state.updateSale(id, data);
    }, 'Sale updated successfully');
  }

  static delete(id: string) {
    return BusinessWorkflowEngine.executeWorkflow('Sales Deletion', () => {
      const state = useERPStore.getState();
      state.deleteSale(id);
    }, 'Sale deleted successfully');
  }

}
