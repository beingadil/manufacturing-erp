export type ValidationLevel = 'Information' | 'Warning' | 'Error';

export interface ValidationMessage {
  field?: string;
  message: string;
  level: ValidationLevel;
  code?: string;
}

export class ValidationResult {
  messages: ValidationMessage[] = [];

  get isValid(): boolean {
    return !this.messages.some(m => m.level === 'Error');
  }

  get hasWarnings(): boolean {
    return this.messages.some(m => m.level === 'Warning');
  }

  get errors(): ValidationMessage[] {
    return this.messages.filter(m => m.level === 'Error');
  }

  get warnings(): ValidationMessage[] {
    return this.messages.filter(m => m.level === 'Warning');
  }

  get information(): ValidationMessage[] {
    return this.messages.filter(m => m.level === 'Information');
  }

  addError(message: string, field?: string, code?: string) {
    this.messages.push({ message, field, level: 'Error', code });
  }

  addWarning(message: string, field?: string, code?: string) {
    this.messages.push({ message, field, level: 'Warning', code });
  }

  addInfo(message: string, field?: string, code?: string) {
    this.messages.push({ message, field, level: 'Information', code });
  }

  merge(result: ValidationResult) {
    this.messages.push(...result.messages);
  }
}

export interface IValidator<T> {
  validate(data: T, context?: any): ValidationResult;
}
