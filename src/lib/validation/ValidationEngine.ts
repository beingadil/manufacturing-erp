import { ErrorManagement } from './ErrorManagement';
import { IValidator, ValidationResult } from './ValidationTypes';

export class ValidationEngine {
  /**
   * Runs a specific validator against the data.
   * Optionally displays UI errors and halts execution via ErrorManagement.
   */
  static validate<T>(validator: IValidator<T>, data: T, contextName: string, throwOnFailure: boolean = true): ValidationResult {
    const result = validator.validate(data);
    
    if (throwOnFailure) {
      ErrorManagement.evaluate(result, contextName);
    }
    
    return result;
  }

  /**
   * Manually builds a validation result if you want to bypass strict classes.
   */
  static createResult(): ValidationResult {
    return new ValidationResult();
  }
}
