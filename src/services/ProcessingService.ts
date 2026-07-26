import { useERPStore } from '../store/useERPStore';
import { 
  ValidationEngine, 
  ProcessingDispatchValidator, ProcessingDispatchDTO,
  ProcessingReceiveValidator, ProcessingReceiveDTO 
} from '../lib/validation';
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

}
