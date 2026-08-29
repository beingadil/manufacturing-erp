import { BusinessWorkflowEngine } from '../lib/business/BusinessWorkflowEngine';
import { PurchaseDTO, PurchaseValidator, ValidationEngine } from '../lib/validation';
import { useERPStore } from '../store/useERPStore';

export class PurchaseService {
  static create(data: PurchaseDTO) {
    return BusinessWorkflowEngine.executeWorkflow('Purchase Creation', () => {
      ValidationEngine.validate(new PurchaseValidator(), data, 'Purchase Creation');
      const state = useERPStore.getState();
      state.addPurchase(data);
    }, 'Purchase saved successfully');
  }

  static update(id: string, data: Partial<PurchaseDTO>) {
    return BusinessWorkflowEngine.executeWorkflow('Purchase Update', () => {
      const state = useERPStore.getState();
      const existing = state.purchases.find(p => p.id === id);
      if (!existing) throw new Error('Purchase not found');
      
      const mergedData = { ...existing, ...data } as PurchaseDTO;
      ValidationEngine.validate(new PurchaseValidator(), mergedData, 'Purchase Update');
      
      state.updatePurchase(id, data);
    }, 'Purchase updated successfully');
  }

  static delete(id: string) {
    return BusinessWorkflowEngine.executeWorkflow('Purchase Deletion', () => {
      const state = useERPStore.getState();
      state.deletePurchase(id);
    }, 'Purchase deleted successfully');
  }

}
