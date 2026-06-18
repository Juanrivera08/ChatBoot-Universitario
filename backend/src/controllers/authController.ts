import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(errors.array()[0].msg, 400));
    }

    const { email, password } = req.body;

    const { rows } = await query<{
      id: string; email: string; password: string;
      full_name: string; role: string; is_active: boolean;
    }>(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new AppError('Credenciales inválidas', 401));
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any }
    );

    logger.info(`Login exitoso: ${user.email}`);

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (error) {
    next(error);
  }
}

export async function createAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));

    const { email, password, fullName } = req.body;
    if (!fullName?.trim()) return next(new AppError('El nombre completo es requerido', 400));
    const hashedPassword = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (email, password, full_name, role)
       VALUES ($1, $2, $3, 'admin') RETURNING id, email, full_name, role`,
      [email, hashedPassword, fullName]
    );
    res.status(201).json({ user: rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return next(new AppError('El email ya está registrado', 409));
    }
    next(error);
  }
}

export async function me(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return next(new AppError('No autenticado', 401));
    const { rows } = await query(
      'SELECT id, email, full_name, role, last_login FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ user: rows[0] });
  } catch (error) {
    next(error);
  }
}
