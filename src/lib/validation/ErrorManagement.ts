import { toast } from 'sonner';
import { AppError } from '../errorHandler';
import { ValidationResult } from './ValidationTypes';

export class ErrorManagement {
  /**
   * Evaluates a validation result and displays appropriate UI feedback.
   * Throws an AppError if blocking errors exist to halt the workflow.
   */
  static evaluate(result: ValidationResult, contextName: string = 'Operation'): void {
    // 1. Show Information
    result.information.forEach(info => {
      toast.info(info.message);
    });

    // 2. Show Warnings
    result.warnings.forEach(warning => {
      toast.warning(warning.message, {
        duration: 8000,
        action: {
          label: 'Acknowledge',
          onClick: () => {}
        }
      });
    });

    // 3. Handle Errors
    if (!result.isValid) {
      const errorMessages = result.errors.map(e => e.message);
      
      // If single error, show simple toast. If multiple, show summary.
      if (errorMessages.length === 1) {
        toast.error(errorMessages[0]);
      } else {
        toast.error(`${contextName} failed: Please correct ${errorMessages.length} errors.`, {
          description: errorMessages.slice(0, 3).join('\n') + (errorMessages.length > 3 ? '\n...' : ''),
          duration: 10000,
        });
      }

      // Log validation failure for audit purposes
      console.warn(`Validation failed for ${contextName}:`, result.errors);

      // Stop the workflow
      throw new AppError(`Validation failed for ${contextName}.`, 'VALIDATION_ERROR');
    }
  }

  /**
   * Catch-all wrapper for synchronous service calls to centralize exception UI.
   */
  static safeExecuteSync(operation: () => void, contextName: string = 'Operation') {
    try {
      operation();
    } catch (error: any) {
      if (error.code !== 'VALIDATION_ERROR') {
        toast.error(error.message || `An unexpected error occurred during ${contextName}.`);
        console.error(`Execution error in ${contextName}:`, error);
      }
      // If it's a validation error, the toast was already handled by ErrorManagement.evaluate
    }
  }
}
