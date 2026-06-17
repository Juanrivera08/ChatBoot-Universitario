import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Token de autenticación requerido', 401));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string; email: string; role: string;
    };
    req.user = decoded;
    next();
  } catch {
    next(new AppError('Token inválido o expirado', 401));
  }
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    return next(new AppError('Acceso denegado: se requieren permisos de administrador', 403));
  }
  next();
}
