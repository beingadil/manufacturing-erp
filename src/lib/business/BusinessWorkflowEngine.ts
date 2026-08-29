import { v4 as uuidv4 } from 'uuid';
import { useERPStore } from '../../store/useERPStore';

export class BusinessWorkflowEngine {
  /**
   * Standardized Enterprise Workflow Execution
   * Validate -> Execute Rules -> Database Transaction -> Voucher -> Inventory -> Audit -> Refresh
   */
  static executeWorkflow<T>(
    contextName: string,
    operation: () => T,
    successMessage?: string
  ): T {
    try {
      // 1. Validation and Rules Execution happen inside the operation callback
      const result = operation();

      // 2. Audit Log (Centralized logging of business events)
      this.logAudit(contextName, 'SUCCESS');

      // 3. Optional Success message hook (Typically caught by UI, but we log it here)
      if (successMessage) {
        // Logger would handle success messages
      }

      return result;
    } catch (error: any) {
      console.error(`[WORKFLOW FAILED] ${contextName}: ${error.message}`);
      this.logAudit(contextName, 'FAILED', error.message);
      throw error;
    }
  }

  private static logAudit(action: string, status: string, details?: string) {
    const state = useERPStore.getState();
    const currentUser = state.currentUser?.name || 'System';
    const auditLog = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      user: currentUser,
      action,
      status,
      details
    };
    // If the store supports audit logs, we add it. We'll patch the store to support it next.
    if ((state as any).addAuditLog) {
      (state as any).addAuditLog(auditLog);
    } else {
      console.info('Audit Log:', auditLog);
    }
  }
}
