import { useERPStore } from '../store/useERPStore';
import { ValidationEngine, SalesValidator, SalesDTO } from '../lib/validation';
import { BusinessWorkflowEngine } from '../lib/business/BusinessWorkflowEngine';

export class SalesService {
  static create(data: SalesDTO) {
    return BusinessWorkflowEngine.executeWorkflow('Sales Creation', () => {
      ValidationEngine.validate(new SalesValidator(), data, 'Sales Creation');
      const state = useERPStore.getState();
      state.addSale(data);
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
