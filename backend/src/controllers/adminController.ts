import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { ragService } from '../services/ragService';
import { aiService } from '../services/aiService';
import { conversationService } from '../services/conversationService';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

export async function getDashboardStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await query('SELECT * FROM v_dashboard_stats');
    const ragStats = await ragService.getStats();
    res.json({ stats: { ...rows[0], ...ragStats } });
  } catch (error) {
    next(error);
  }
}

export async function getConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const result = await conversationService.getAll(page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getConversationDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const messages = await conversationService.getConversationMessages(id);
    res.json({ messages });
  } catch (error) {
    next(error);
  }
}

export async function getFAQs(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await query('SELECT * FROM faqs WHERE is_active = true ORDER BY created_at DESC');
    res.json({ faqs: rows });
  } catch (error) {
    next(error);
  }
}

export async function createFAQ(req: Request, res: Response, next: NextFunction) {
  try {
    const { question, answer, category, tags } = req.body;
    const { rows } = await query(
      `INSERT INTO faqs (question, answer, category, tags)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [question, answer, category || 'general', tags || []]
    );
    res.status(201).json({ faq: rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function deleteFAQ(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE faqs SET is_active = false WHERE id = $1',
      [id]
    );
    if (result.rowCount === 0) throw new AppError('FAQ no encontrada', 404);
    res.json({ message: 'FAQ eliminada correctamente' });
  } catch (error) {
    next(error);
  }
}

export async function getAIConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await query('SELECT key, value, description FROM ai_config ORDER BY key');
    res.json({ config: rows });
  } catch (error) {
    next(error);
  }
}

export async function updateAIConfig(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { key, value } = req.body;
    const allowedKeys = ['model', 'temperature', 'max_tokens', 'system_prompt', 'top_k'];
    if (!allowedKeys.includes(key)) {
      return next(new AppError('Clave de configuración no permitida', 400));
    }
    await query(
      `UPDATE ai_config SET value = $1, updated_at = NOW(), updated_by = $2 WHERE key = $3`,
      [value, req.user?.id ?? null, key]
    );
    aiService.invalidateConfigCache();
    res.json({ message: 'Configuración actualizada' });
  } catch (error) {
    next(error);
  }
}

export async function getChartData(_req: Request, res: Response, next: NextFunction) {
  try {
    const { rows: dailyMessages } = await query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM messages
      WHERE role = 'user' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const { rows: topQueries } = await query(`
      SELECT content as query, COUNT(*) as count
      FROM messages
      WHERE role = 'user'
      GROUP BY content
      ORDER BY count DESC
      LIMIT 10
    `);

    const { rows: categoryDist } = await query(`
      SELECT category, COUNT(*) as count
      FROM documents
      WHERE is_active = true
      GROUP BY category
    `);

    res.json({ dailyMessages, topQueries, categoryDist });
  } catch (error) {
    next(error);
  }
}
