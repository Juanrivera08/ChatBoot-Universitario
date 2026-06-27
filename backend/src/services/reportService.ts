import { query } from '../config/database';

// ============================================================
// SERVICIO DE REPORTES — CHATBOT USH
// Centraliza la lógica de extracción y enriquecimiento de los
// datos de conversaciones para los informes descargables (PDF/Excel).
// La generación de archivos vive en utils/reportGenerators.ts; aquí
// solo se obtienen y modelan los datos (separación de responsabilidades).
// ============================================================

/**
 * Tipos de consulta disponibles. Se derivan de la categoría dominante
 * entre los documentos (RAG) que la IA usó para responder en cada
 * conversación. Coinciden con el enum `category` de la tabla documents,
 * más 'general' para conversaciones sin fuentes (saludo, charla, etc.).
 */
export const QUERY_TYPES: Record<string, string> = {
  reglamento: 'Reglamento',
  calendario: 'Calendario académico',
  programas: 'Programas académicos',
  bienestar: 'Bienestar universitario',
  administrativo: 'Trámites administrativos',
  faq: 'Preguntas frecuentes',
  otro: 'Otros documentos',
  general: 'Consulta general',
};

export function queryTypeLabel(code: string | null | undefined): string {
  if (!code) return QUERY_TYPES.general;
  return QUERY_TYPES[code] ?? code;
}

export type ConversationStatus =
  | 'En atención humana'
  | 'Resuelta'
  | 'Activa'
  | 'Inactiva';

export interface ReportFilters {
  /** Inicio del rango (inclusive). Por defecto: sin límite inferior. */
  from?: Date;
  /** Fin del rango (exclusivo). Por defecto: ahora. */
  to?: Date;
  /** Código de tipo de consulta a filtrar (ver QUERY_TYPES). */
  queryType?: string | null;
  /** Si true, incluye la transcripción completa de cada conversación. */
  includeTranscript?: boolean;
}

export interface TranscriptLine {
  role: 'user' | 'assistant' | 'system';
  author: string;
  content: string;
  at: Date;
}

/** Una fila del informe = una conversación, ya enriquecida. */
export interface ReportRow {
  id: string;
  /** Identificador legible del usuario (sesión abreviada + IP si existe). */
  user: string;
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  /** Duración en milisegundos. */
  durationMs: number;
  durationLabel: string;
  queryType: string;
  queryTypeLabel: string;
  /** Resumen breve = primera consulta del usuario. */
  summary: string;
  messageCount: number;
  userMessages: number;
  satisfaction: number | null;
  status: ConversationStatus;
  transcript?: TranscriptLine[];
}

export interface ReportSummary {
  totalConversations: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
  avgDurationMs: number;
  avgDurationLabel: string;
  avgSatisfaction: number | null;
  ratedConversations: number;
  humanHandledConversations: number;
  byQueryType: Array<{ code: string; label: string; count: number }>;
}

export interface ReportResult {
  rows: ReportRow[];
  summary: ReportSummary;
  filters: {
    from: Date;
    to: Date;
    queryType: string | null;
    queryTypeLabel: string | null;
  };
  generatedAt: Date;
}

// Una conversación se considera "Activa" si su última actividad ocurrió
// dentro de esta ventana (en minutos). Más allá, se considera "Inactiva".
const ACTIVE_WINDOW_MINUTES = 30;

interface RawRow {
  id: string;
  session_id: string;
  ip_address: string | null;
  feedback: number | null;
  is_resolved: boolean;
  human_mode: boolean;
  started_at: Date;
  last_activity: Date | null;
  last_message_at: Date;
  message_count: string;
  user_messages: string;
  query_type: string | null;
  first_user_message: string | null;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

function deriveStatus(raw: RawRow): ConversationStatus {
  if (raw.human_mode) return 'En atención humana';
  if (raw.is_resolved) return 'Resuelta';
  const last = raw.last_activity ?? raw.last_message_at;
  const minutesSince = (Date.now() - new Date(last).getTime()) / 60000;
  return minutesSince <= ACTIVE_WINDOW_MINUTES ? 'Activa' : 'Inactiva';
}

function userLabel(raw: RawRow): string {
  const shortSession = raw.session_id.slice(0, 8);
  return raw.ip_address ? `Sesión ${shortSession} · ${raw.ip_address}` : `Sesión ${shortSession}`;
}

class ReportService {
  /** Catálogo de tipos de consulta para poblar el filtro en el dashboard. */
  getQueryTypes(): Array<{ code: string; label: string }> {
    return Object.entries(QUERY_TYPES).map(([code, label]) => ({ code, label }));
  }

  /**
   * Obtiene y enriquece los datos del informe en una sola consulta agregada.
   * - Deriva el "tipo de consulta" como la categoría RAG dominante (LATERAL).
   * - Calcula conteos y primera consulta del usuario sin viajes extra a la BD.
   */
  async generate(filters: ReportFilters): Promise<ReportResult> {
    const from = filters.from ?? new Date(0);
    const to = filters.to ?? new Date();
    const queryType = filters.queryType?.trim() || null;

    const { rows } = await query<RawRow>(
      `
      SELECT
        c.id,
        c.session_id,
        c.ip_address,
        c.feedback,
        c.is_resolved,
        c.human_mode,
        c.started_at,
        c.last_message_at,
        COUNT(m.id)                                   AS message_count,
        COUNT(m.id) FILTER (WHERE m.role = 'user')    AS user_messages,
        MAX(m.created_at)                             AS last_activity,
        tc.category                                   AS query_type,
        fu.content                                    AS first_user_message
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      -- Categoría dominante entre las fuentes RAG usadas en la conversación
      LEFT JOIN LATERAL (
        SELECT src.value->>'category' AS category
        FROM messages mm
        CROSS JOIN LATERAL jsonb_array_elements(mm.sources) AS src
        WHERE mm.conversation_id = c.id
          AND jsonb_typeof(mm.sources) = 'array'
        GROUP BY src.value->>'category'
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) tc ON true
      -- Primera consulta del usuario (resumen breve de la conversación)
      LEFT JOIN LATERAL (
        SELECT content
        FROM messages mu
        WHERE mu.conversation_id = c.id AND mu.role = 'user'
        ORDER BY mu.created_at ASC
        LIMIT 1
      ) fu ON true
      WHERE c.started_at >= $1 AND c.started_at < $2
        AND ($3::text IS NULL OR COALESCE(tc.category, 'general') = $3)
      GROUP BY c.id, tc.category, fu.content
      ORDER BY c.started_at DESC
      `,
      [from, to, queryType]
    );

    const reportRows: ReportRow[] = rows.map((raw) => {
      const endedAt = raw.last_activity ?? raw.last_message_at;
      const durationMs = new Date(endedAt).getTime() - new Date(raw.started_at).getTime();
      const code = raw.query_type ?? 'general';
      const summary = (raw.first_user_message ?? '').trim() || '(Sin mensajes del usuario)';

      return {
        id: raw.id,
        user: userLabel(raw),
        sessionId: raw.session_id,
        startedAt: raw.started_at,
        endedAt,
        durationMs: Math.max(0, durationMs),
        durationLabel: formatDuration(durationMs),
        queryType: code,
        queryTypeLabel: queryTypeLabel(code),
        summary: summary.length > 140 ? summary.slice(0, 137) + '...' : summary,
        messageCount: parseInt(raw.message_count, 10) || 0,
        userMessages: parseInt(raw.user_messages, 10) || 0,
        satisfaction: raw.feedback,
        status: deriveStatus(raw),
      };
    });

    if (filters.includeTranscript && reportRows.length > 0) {
      await this.attachTranscripts(reportRows);
    }

    const summary = this.buildSummary(reportRows);

    return {
      rows: reportRows,
      summary,
      filters: {
        from,
        to,
        queryType,
        queryTypeLabel: queryType ? queryTypeLabel(queryType) : null,
      },
      generatedAt: new Date(),
    };
  }

  /** Carga las transcripciones de todas las conversaciones en una sola consulta. */
  private async attachTranscripts(rows: ReportRow[]): Promise<void> {
    const ids = rows.map((r) => r.id);
    const { rows: msgs } = await query<{
      conversation_id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      model_used: string | null;
      created_at: Date;
    }>(
      `SELECT conversation_id, role, content, model_used, created_at
       FROM messages
       WHERE conversation_id = ANY($1::uuid[])
       ORDER BY created_at ASC`,
      [ids]
    );

    const byConv = new Map<string, TranscriptLine[]>();
    for (const m of msgs) {
      const author =
        m.role === 'user'
          ? 'Usuario'
          : m.role === 'system'
          ? 'Sistema'
          : m.model_used
          ? 'Asistente IA'
          : 'Asesor humano';
      const line: TranscriptLine = { role: m.role, author, content: m.content, at: m.created_at };
      const list = byConv.get(m.conversation_id);
      if (list) list.push(line);
      else byConv.set(m.conversation_id, [line]);
    }

    for (const row of rows) row.transcript = byConv.get(row.id) ?? [];
  }

  private buildSummary(rows: ReportRow[]): ReportSummary {
    const totalConversations = rows.length;
    const totalMessages = rows.reduce((acc, r) => acc + r.messageCount, 0);
    const totalDuration = rows.reduce((acc, r) => acc + r.durationMs, 0);
    const rated = rows.filter((r) => r.satisfaction != null);
    const satisfactionSum = rated.reduce((acc, r) => acc + (r.satisfaction ?? 0), 0);
    const humanHandled = rows.filter((r) => r.status === 'En atención humana').length;

    const typeCounts = new Map<string, number>();
    for (const r of rows) typeCounts.set(r.queryType, (typeCounts.get(r.queryType) ?? 0) + 1);
    const byQueryType = Array.from(typeCounts.entries())
      .map(([code, count]) => ({ code, label: queryTypeLabel(code), count }))
      .sort((a, b) => b.count - a.count);

    const avgDurationMs = totalConversations ? totalDuration / totalConversations : 0;

    return {
      totalConversations,
      totalMessages,
      avgMessagesPerConversation: totalConversations
        ? Math.round((totalMessages / totalConversations) * 10) / 10
        : 0,
      avgDurationMs,
      avgDurationLabel: formatDuration(avgDurationMs),
      avgSatisfaction: rated.length ? Math.round((satisfactionSum / rated.length) * 100) / 100 : null,
      ratedConversations: rated.length,
      humanHandledConversations: humanHandled,
      byQueryType,
    };
  }
}

export const reportService = new ReportService();
