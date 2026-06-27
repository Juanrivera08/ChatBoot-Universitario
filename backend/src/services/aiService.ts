import OpenAI from 'openai';
import { ragService } from './ragService';
import { openai } from '../config/openai';
import { query } from '../config/database';
import { logger } from '../utils/logger';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AIResponse {
  answer: string;
  sources: Array<{ title: string; category: string; relevance: number }>;
  tokensUsed: number;
  processingTime: number;
  model: string;
}

interface RequestContext {
  modelName: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  temperature: number;
  maxTokens: number;
  sources: Array<{ title: string; category: string; relevance: number }>;
  start: number;
}

let configCache: { data: Record<string, string>; expiresAt: number } | null = null;
const CONFIG_TTL_MS = 60_000;

class AIService {
  private async getSystemConfig(): Promise<Record<string, string>> {
    const now = Date.now();
    if (configCache && now < configCache.expiresAt) return configCache.data;
    const { rows } = await query<{ key: string; value: string }>('SELECT key, value FROM ai_config');
    const data = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    configCache = { data, expiresAt: now + CONFIG_TTL_MS };
    return data;
  }

  invalidateConfigCache() {
    configCache = null;
  }

  // Construye el contexto RAG, el prompt y el historial — compartido entre los dos modos
  private async buildRequestContext(
    userMessage: string,
    conversationHistory: ChatMessage[]
  ): Promise<RequestContext> {
    const start = Date.now();
    const config = await this.getSystemConfig();

    // RAG: recuperar fragmentos relevantes
    const contextChunks = await ragService.retrieveContext(userMessage);
    let contextText = '';
    const sources: Array<{ title: string; category: string; relevance: number }> = [];

    if (contextChunks.length > 0) {
      contextText = '\n\n=== INFORMACIÓN INSTITUCIONAL RELEVANTE ===\n';

      // Recopilar IDs únicos y distancia mínima por documento en un solo recorrido
      const docDistances = new Map<string, number>();
      for (const chunk of contextChunks) {
        contextText += `\n--- ${chunk.metadata.title || 'Documento institucional'} ---\n`;
        contextText += chunk.content + '\n';
        const docId = chunk.metadata.document_id as string;
        if (docId) {
          const prev = docDistances.get(docId) ?? chunk.distance;
          docDistances.set(docId, Math.min(prev, chunk.distance));
        }
      }
      contextText += '\n=== FIN DE INFORMACIÓN INSTITUCIONAL ===\n';

      // Una sola query para todos los documentos en lugar de N queries
      if (docDistances.size > 0) {
        const docIds = [...docDistances.keys()];
        const { rows } = await query<{ id: string; title: string; category: string }>(
          'SELECT id, title, category FROM documents WHERE id = ANY($1::uuid[])',
          [docIds]
        );
        for (const row of rows) {
          const distance = docDistances.get(row.id) ?? 1;
          sources.push({
            title: row.title,
            category: row.category,
            relevance: Math.round((1 - distance) * 100),
          });
        }
      }
    }

    const systemInstruction = `${config.system_prompt || 'Eres el Asistente de Servicios Digitales de la Institución Universitaria Salazar y Herrera (USH). Tu función es ayudar a estudiantes, docentes y personas interesadas con información académica y administrativa precisa. Responde siempre en español, de forma amable, clara y profesional.'}

${contextText}

INSTRUCCIONES IMPORTANTES:
- Responde ÚNICAMENTE basándote en la información institucional proporcionada arriba.
- Si no encuentras información relevante en los documentos, dilo claramente y sugiere contactar a la institución directamente.
- No inventes datos, fechas, ni información que no esté en los documentos.
- Sé conciso, claro y directo.
- NUNCA comiences tu respuesta con saludos como "¡Hola!", "Hola,", "Buenos días", "Buen día", "Estimado/a" o frases similares. El usuario ya fue saludado al abrir el chat.
- Responde directamente a la pregunta sin preámbulos ni frases introductorias innecesarias.
- Mantén el hilo de la conversación: si el usuario hace una pregunta relacionada con un tema anterior, úsalo como contexto para responder con coherencia.
- Si el usuario saluda explícitamente, responde de forma breve y pasa inmediatamente a ofrecer tu ayuda.`;

    const history = conversationHistory
      .filter((m) => m.role !== 'system')
      .slice(-20)
      .map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemInstruction },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const modelName = config.model || 'gpt-4o-mini';
    const temperature = parseFloat(config.temperature || '0.3');
    const maxTokens = parseInt(config.max_tokens || '1000');

    return { modelName, messages, temperature, maxTokens, sources, start };
  }

  // Modo clásico: espera la respuesta completa antes de devolverla
  async generateResponse(
    userMessage: string,
    conversationHistory: ChatMessage[],
    sessionId: string
  ): Promise<AIResponse> {
    try {
      const ctx = await this.buildRequestContext(userMessage, conversationHistory);
      const result = await openai.chat.completions.create({
        model: ctx.modelName,
        messages: ctx.messages,
        temperature: ctx.temperature,
        max_tokens: ctx.maxTokens,
      });
      const answer = result.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';
      const tokensUsed = result.usage?.total_tokens || 0;
      const processingTime = Date.now() - ctx.start;
      logger.info(`IA respondió en ${processingTime}ms | ${tokensUsed} tokens | sesión ${sessionId}`);
      return { answer, sources: ctx.sources, tokensUsed, processingTime, model: ctx.modelName };
    } catch (error: any) {
      logger.error(`Error en generateResponse (sesión ${sessionId}):`, error);
      throw error;
    }
  }

  // Modo streaming: llama onChunk por cada fragmento y devuelve metadata al terminar
  // Incluye retry automático ante error 429 (rate limit) con espera exponencial
  async generateResponseStream(
    userMessage: string,
    conversationHistory: ChatMessage[],
    sessionId: string,
    onChunk: (text: string) => void,
    attempt = 1
  ): Promise<Omit<AIResponse, 'answer'>> {
    try {
      const ctx = await this.buildRequestContext(userMessage, conversationHistory);
      const stream = await openai.chat.completions.create({
        model: ctx.modelName,
        messages: ctx.messages,
        temperature: ctx.temperature,
        max_tokens: ctx.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });

      let tokensUsed = 0;
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) onChunk(text);
        // El último chunk (con include_usage) trae el conteo de tokens
        if (chunk.usage) tokensUsed = chunk.usage.total_tokens;
      }

      const processingTime = Date.now() - ctx.start;
      logger.info(`IA (streaming) en ${processingTime}ms | ${tokensUsed} tokens | sesión ${sessionId}`);
      return { sources: ctx.sources, tokensUsed, processingTime, model: ctx.modelName };
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status ?? 0;
      const msg = error?.message ?? '';
      const isRateLimit = status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate limit');

      if (isRateLimit && attempt <= 2) {
        const waitMs = Math.min(Math.pow(2, attempt) * 1000, 16000); // 2s, 4s
        logger.warn(`Rate limit temporal. Reintentando en ${waitMs / 1000}s (intento ${attempt}/2)...`);
        await new Promise((r) => setTimeout(r, waitMs));
        return this.generateResponseStream(userMessage, conversationHistory, sessionId, onChunk, attempt + 1);
      }
      throw error;
    }
  }

  async generateConversationTitle(firstMessage: string): Promise<string> {
    try {
      const config = await this.getSystemConfig();
      const result = await openai.chat.completions.create({
        model: config.model || 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 20,
        messages: [
          {
            role: 'user',
            content: `Genera un título corto (máximo 6 palabras) que resuma la siguiente pregunta de un estudiante universitario. Solo devuelve el título, sin comillas ni puntuación extra.\n\nPregunta: ${firstMessage}`,
          },
        ],
      });
      return result.choices[0]?.message?.content?.trim() || 'Nueva conversación';
    } catch {
      return 'Nueva conversación';
    }
  }
}

export const aiService = new AIService();
