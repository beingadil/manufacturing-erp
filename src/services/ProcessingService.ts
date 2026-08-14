import { useERPStore } from '../store/useERPStore';
import { 
  ValidationEngine, 
  ProcessingDispatchValidator, ProcessingDispatchDTO,
  ProcessingReceiveValidator, ProcessingReceiveDTO 
} from '../lib/validation';
import type { ProcessorBill } from '../types/erp';
import { BusinessWorkflowEngine } from '../lib/business/BusinessWorkflowEngine';

export class ProcessingService {
  static dispatch(data: ProcessingDispatchDTO, adjustPendingIds?: string[]) {
    return BusinessWorkflowEngine.executeWorkflow('Processing Dispatch', () => {
      ValidationEngine.validate(new ProcessingDispatchValidator(), data, 'Processing Dispatch');
      const state = useERPStore.getState();
      state.addProcessingSend(data, adjustPendingIds);
    }, 'Dispatch successful');
  }

  static updateDispatch(id: string, data: Partial<ProcessingDispatchDTO>) {
    return BusinessWorkflowEngine.executeWorkflow('Update Dispatch', () => {
      const state = useERPStore.getState();
      state.updateProcessingSend(id, data);
    }, 'Dispatch updated');
  }

  static deleteDispatch(id: string) {
    return BusinessWorkflowEngine.executeWorkflow('Delete Dispatch', () => {
      const state = useERPStore.getState();
      state.deleteProcessingSend(id);
    }, 'Dispatch deleted');
  }

  static receive(data: ProcessingReceiveDTO) {
    return BusinessWorkflowEngine.executeWorkflow('Processing Receive', () => {
      ValidationEngine.validate(new ProcessingReceiveValidator(), data, 'Processing Receive');
      const state = useERPStore.getState();
      
      // Convert to actual entity payload (removing validation-only fields)
      const { dispatchedPcs, previouslyReceivedPcs, ...receivePayload } = data;
      state.addProcessingReceipt(receivePayload);
    }, 'Receive successful');
  }

  static updateReceive(id: string, data: Partial<ProcessingReceiveDTO>) {
    return BusinessWorkflowEngine.executeWorkflow('Update Receive', () => {
      const state = useERPStore.getState();
      state.updateProcessingReceipt(id, data);
    }, 'Receive updated');
  }

  static deleteReceive(id: string) {
    return BusinessWorkflowEngine.executeWorkflow('Delete Receive', () => {
      const state = useERPStore.getState();
      state.deleteProcessingReceipt(id);
    }, 'Receive deleted');
  }

  static createBill(data: Omit<ProcessorBill, 'id' | 'billNo' | 'totalAmount'>) {
    return BusinessWorkflowEngine.executeWorkflow('Processor Bill Creation', () => {
      const state = useERPStore.getState();
      state.addProcessorBill(data);
    }, 'Bill saved successfully');
  }

  static updateBill(id: string, data: Partial<ProcessorBill>) {
    return BusinessWorkflowEngine.executeWorkflow('Update Processor Bill', () => {
      const state = useERPStore.getState();
      state.updateProcessorBill(id, data);
    }, 'Bill updated successfully');
  }

  static deleteBill(id: string) {
    return BusinessWorkflowEngine.executeWorkflow('Delete Processor Bill', () => {
      const state = useERPStore.getState();
      state.deleteProcessorBill(id);
    }, 'Bill deleted successfully');
  }
}
