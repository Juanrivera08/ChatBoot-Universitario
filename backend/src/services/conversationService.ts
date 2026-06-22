import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export interface Conversation {
  id: string;
  session_id: string;
  user_agent: string | null;
  ip_address: string | null;
  is_resolved: boolean;
  feedback: number | null;
  human_mode: boolean;
  human_mode_at: Date | null;
  started_at: Date;
  last_message_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens_used: number;
  model_used: string | null;
  sources: any[];
  processing_time: number;
  created_at: Date;
}

class ConversationService {
  async getOrCreateConversation(
    sessionId: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<Conversation> {
    // Buscar conversación existente por sessionId
    const { rows } = await query<Conversation>(
      'SELECT * FROM conversations WHERE session_id = $1',
      [sessionId]
    );

    if (rows[0]) return rows[0];

    // Crear nueva conversación (ON CONFLICT por si dos requests llegan simultáneas)
    const { rows: newRows } = await query<Conversation>(
      `INSERT INTO conversations (session_id, user_agent, ip_address)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id) DO UPDATE
         SET last_message_at = conversations.last_message_at
       RETURNING *`,
      [sessionId, userAgent || null, ipAddress || null]
    );

    return newRows[0];
  }

  async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    options?: {
      tokensUsed?: number;
      modelUsed?: string;
      sources?: any[];
      processingTime?: number;
    }
  ): Promise<Message> {
    const { rows } = await query<Message>(
      `INSERT INTO messages (conversation_id, role, content, tokens_used, model_used, sources, processing_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        conversationId,
        role,
        content,
        options?.tokensUsed || 0,
        options?.modelUsed || null,
        JSON.stringify(options?.sources || []),
        options?.processingTime || 0,
      ]
    );

    // Actualizar timestamp del último mensaje
    await query(
      'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
      [conversationId]
    );

    return rows[0];
  }

  async getHistory(sessionId: string, limit = 20): Promise<Message[]> {
    const { rows } = await query<Message>(
      `SELECT m.* FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.session_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2`,
      [sessionId, limit]
    );
    return rows;
  }

  async deleteConversation(sessionId: string): Promise<void> {
    const result = await query(
      'DELETE FROM conversations WHERE session_id = $1',
      [sessionId]
    );
    if ((result.rowCount ?? 0) === 0) throw new AppError('Conversación no encontrada', 404);
  }

  async submitFeedback(sessionId: string, rating: number): Promise<void> {
    if (rating < 1 || rating > 5) throw new AppError('La valoración debe estar entre 1 y 5', 400);
    const result = await query(
      'UPDATE conversations SET feedback = $1 WHERE session_id = $2',
      [rating, sessionId]
    );
    if ((result.rowCount ?? 0) === 0) throw new AppError('Conversación no encontrada', 404);
  }

  async getAll(page = 1, limit = 20): Promise<{ conversations: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT c.*,
              COUNT(m.id) as message_count,
              MAX(m.created_at) as last_activity
       FROM conversations c
       LEFT JOIN messages m ON c.id = m.conversation_id
       GROUP BY c.id
       ORDER BY c.last_message_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: countRows } = await query('SELECT COUNT(*) as total FROM conversations');
    return { conversations: rows, total: parseInt(countRows[0].total) };
  }

  async getConversationMessages(conversationId: string): Promise<Message[]> {
    const { rows } = await query<Message>(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );
    return rows;
  }

  async setHumanMode(conversationId: string, enabled: boolean): Promise<void> {
    const result = await query(
      'UPDATE conversations SET human_mode = $1, human_mode_at = $2 WHERE id = $3',
      [enabled, enabled ? new Date() : null, conversationId]
    );
    if (result.rowCount === 0) throw new AppError('Conversación no encontrada', 404);
  }

  async getHumanModeConversations(): Promise<any[]> {
    const { rows } = await query(`
      SELECT c.*, COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.human_mode = true
      GROUP BY c.id
      ORDER BY c.last_message_at DESC
    `);
    return rows;
  }

  async getPendingReply(sessionId: string): Promise<{
    pending: boolean;
    humanMode: boolean;
    reply?: string;
    messageId?: string;
  }> {
    const { rows: convRows } = await query<Conversation>(
      'SELECT id, human_mode FROM conversations WHERE session_id = $1',
      [sessionId]
    );
    if (!convRows[0]) return { pending: false, humanMode: false };

    const conv = convRows[0];
    if (!conv.human_mode) return { pending: false, humanMode: false };

    const { rows: userMsgRows } = await query<{ id: string; created_at: Date }>(
      `SELECT id, created_at FROM messages
       WHERE conversation_id = $1 AND role = 'user'
       ORDER BY created_at DESC LIMIT 1`,
      [conv.id]
    );

    if (!userMsgRows[0]) return { pending: true, humanMode: true };

    const { rows: replyRows } = await query<{ id: string; content: string }>(
      `SELECT id, content FROM messages
       WHERE conversation_id = $1 AND role = 'assistant' AND created_at > $2
       ORDER BY created_at ASC LIMIT 1`,
      [conv.id, userMsgRows[0].created_at]
    );

    if (!replyRows[0]) return { pending: true, humanMode: true };
    return { pending: false, humanMode: true, reply: replyRows[0].content, messageId: replyRows[0].id };
  }
}

export const conversationService = new ConversationService();
