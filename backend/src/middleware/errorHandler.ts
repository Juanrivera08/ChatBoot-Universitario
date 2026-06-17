import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    logger.warn(`Error operacional [${err.statusCode}]: ${err.message}`);
    res.status(err.statusCode).json({ error: err.message, status: err.statusCode });
    return;
  }

  logger.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor', status: 500 });
}
