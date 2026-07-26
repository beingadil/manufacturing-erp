export class AppError extends Error {
  constructor(message: string, public code?: string, public details?: any) {
    super(message);
    this.name = 'AppError';
  }
}
