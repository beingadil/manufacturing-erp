import { ValidationResult } from './ValidationTypes';

export class FieldValidators {
  static required(value: any, fieldName: string, result: ValidationResult) {
    if (value === undefined || value === null || value === '') {
      result.addError(`${fieldName} is required`, fieldName);
    }
  }

  static maxLength(value: string, max: number, fieldName: string, result: ValidationResult) {
    if (value && value.length > max) {
      result.addError(`${fieldName} cannot exceed ${max} characters`, fieldName);
    }
  }

  static numeric(value: any, fieldName: string, result: ValidationResult) {
    if (value !== undefined && value !== null && value !== '') {
      if (isNaN(Number(value))) {
        result.addError(`${fieldName} must be a valid number`, fieldName);
      }
    }
  }

  static min(value: number, minVal: number, fieldName: string, result: ValidationResult) {
    if (value !== undefined && value !== null) {
      if (Number(value) < minVal) {
        result.addError(`${fieldName} cannot be less than ${minVal}`, fieldName);
      }
    }
  }

  static max(value: number, maxVal: number, fieldName: string, result: ValidationResult) {
    if (value !== undefined && value !== null) {
      if (Number(value) > maxVal) {
        result.addError(`${fieldName} cannot exceed ${maxVal}`, fieldName);
      }
    }
  }

  static positive(value: number, fieldName: string, result: ValidationResult) {
    if (value !== undefined && value !== null && Number(value) <= 0) {
      result.addError(`${fieldName} must be greater than zero`, fieldName);
    }
  }

  static nonNegative(value: number, fieldName: string, result: ValidationResult) {
    if (value !== undefined && value !== null && Number(value) < 0) {
      result.addError(`${fieldName} cannot be negative`, fieldName);
    }
  }

  static dateFormat(value: string, fieldName: string, result: ValidationResult) {
    if (value) {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        result.addError(`${fieldName} must be a valid date`, fieldName);
      }
    }
  }

  static email(value: string, fieldName: string, result: ValidationResult) {
    if (value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        result.addError(`${fieldName} must be a valid email address`, fieldName);
      }
    }
  }
}
