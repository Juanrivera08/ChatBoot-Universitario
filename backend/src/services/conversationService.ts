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

// Mapa en memoria: conversationId → timeout de auto-expiración del indicador de escritura
const adminTypingMap = new Map<string, ReturnType<typeof setTimeout>>();

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
              MAX(m.created_at) as last_activity,
              -- Primera consulta del usuario: sirve de título legible en el panel
              (SELECT mu.content
                 FROM messages mu
                WHERE mu.conversation_id = c.id AND mu.role = 'user'
                ORDER BY mu.created_at ASC
                LIMIT 1) as first_user_message
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

  // Lee el estado de control ACTUAL (no el capturado al inicio del request).
  // Permite descartar una respuesta de la IA si el admin tomó el control mientras
  // ésta se generaba, evitando que un mensaje de la IA aparezca como "asesor".
  async isHumanMode(conversationId: string): Promise<boolean> {
    const { rows } = await query<{ human_mode: boolean }>(
      'SELECT human_mode FROM conversations WHERE id = $1',
      [conversationId]
    );
    return rows[0]?.human_mode ?? false;
  }

  // Actividad reciente de TODAS las conversaciones (no solo modo humano) para
  // alimentar las alertas del panel admin: avisar de conversaciones nuevas y de
  // cada mensaje del usuario, sin importar si la IA o un asesor está atendiendo.
  //
  // Se limita a una ventana reciente para acotar el payload del polling; el hook
  // del frontend decide qué es "nuevo" comparando contra lo que ya había visto.
  async getLiveActivity(): Promise<any[]> {
    const { rows } = await query(`
      SELECT
        c.id,
        c.session_id,
        c.human_mode,
        c.human_mode_at,
        c.started_at,
        c.last_message_at,
        COUNT(m.id) AS message_count,
        -- Momento del último mensaje escrito por el usuario. El frontend lo usa
        -- para distinguir mensajes nuevos del usuario de respuestas de la IA/asesor.
        MAX(m.created_at) FILTER (WHERE m.role = 'user') AS last_user_message_at,
        -- awaiting_reply: el último mensaje lo escribió el usuario, así que aún no
        -- se ha respondido. En modo humano alimenta el badge de "esperan respuesta".
        (
          SELECT lm.role = 'user'
          FROM messages lm
          WHERE lm.conversation_id = c.id
          ORDER BY lm.created_at DESC
          LIMIT 1
        ) AS awaiting_reply
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.last_message_at > NOW() - INTERVAL '6 hours'
      GROUP BY c.id
      ORDER BY c.last_message_at DESC
    `);
    return rows;
  }

  setAdminTyping(conversationId: string, isTyping: boolean): void {
    const existing = adminTypingMap.get(conversationId);
    if (existing) clearTimeout(existing);
    if (isTyping) {
      // Auto-expirar a los 6s si no llega nueva señal (cubre pérdida de conexión)
      adminTypingMap.set(conversationId, setTimeout(() => {
        adminTypingMap.delete(conversationId);
      }, 6000));
    } else {
      adminTypingMap.delete(conversationId);
    }
  }

  async getPendingReply(sessionId: string, since?: Date): Promise<{
    pending: boolean;
    humanMode: boolean;
    adminTyping: boolean;
    replies: Array<{ id: string; content: string; created_at: Date }>;
  }> {
    const { rows: convRows } = await query<Conversation>(
      'SELECT id, human_mode, human_mode_at FROM conversations WHERE session_id = $1',
      [sessionId]
    );
    if (!convRows[0]) return { pending: false, humanMode: false, adminTyping: false, replies: [] };

    const conv = convRows[0];
    if (!conv.human_mode) return { pending: false, humanMode: false, adminTyping: false, replies: [] };

    // Cursor del cliente (+1ms para evitar re-fetch por la precisión de microsegundos
    // del created_at de PostgreSQL). Nunca antes del inicio de la toma de control
    // actual: así un cursor persistido de una sesión humana anterior no re-entrega
    // mensajes de IA generados entremedio.
    const humanModeAt = conv.human_mode_at || new Date(0);
    const clientCursor = since ? new Date(since.getTime() + 1) : new Date(0);
    const sinceDate = clientCursor > humanModeAt ? clientCursor : humanModeAt;

    // Solo entregamos mensajes ESCRITOS POR EL ASESOR humano, nunca de la IA.
    // Distinción robusta: el admin los guarda con model_used = NULL; la IA siempre
    // registra el modelo (p. ej. 'gpt-...'). Así, aunque una respuesta de la IA
    // se hubiera guardado por una condición de carrera al tomar el control, jamás
    // se mostrará al usuario como si fuera el asesor.
    const { rows: replyRows } = await query<{ id: string; content: string; created_at: Date }>(
      `SELECT id, content, created_at FROM messages
       WHERE conversation_id = $1 AND role = 'assistant' AND model_used IS NULL AND created_at > $2
       ORDER BY created_at ASC`,
      [conv.id, sinceDate]
    );

    const adminTyping = adminTypingMap.has(conv.id);
    return { pending: replyRows.length === 0, humanMode: true, adminTyping, replies: replyRows };
  }
}

export const conversationService = new ConversationService();
