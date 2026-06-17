import { GoogleGenerativeAI } from '@google/generative-ai';
import { ragService } from './ragService';
import { query } from '../config/database';
import { logger } from '../utils/logger';

if (!process.env.GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY no está definida. Verifica tu archivo .env');
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

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
  model: ReturnType<typeof genAI.getGenerativeModel>;
  modelName: string;
  geminiHistory: Array<{ role: string; parts: Array<{ text: string }> }>;
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
      const seenDocuments = new Set<string>();
      for (const chunk of contextChunks) {
        contextText += `\n--- ${chunk.metadata.title || 'Documento institucional'} ---\n`;
        contextText += chunk.content + '\n';
        const docId = chunk.metadata.document_id as string;
        if (docId && !seenDocuments.has(docId)) {
          seenDocuments.add(docId);
          const { rows } = await query<{ title: string; category: string }>(
            'SELECT title, category FROM documents WHERE id = $1',
            [docId]
          );
          if (rows[0]) {
            sources.push({
              title: rows[0].title,
              category: rows[0].category,
              relevance: Math.round((1 - chunk.distance) * 100),
            });
          }
        }
      }
      contextText += '\n=== FIN DE INFORMACIÓN INSTITUCIONAL ===\n';
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

    const geminiHistory = conversationHistory
      .filter((m) => m.role !== 'system')
      .slice(-20)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const modelName = config.model || 'gemini-2.5-flash';
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
      generationConfig: {
        temperature: parseFloat(config.temperature || '0.3'),
        maxOutputTokens: parseInt(config.max_tokens || '1000'),
      },
    });

    return { model, modelName, geminiHistory, sources, start };
  }

  // Modo clásico: espera la respuesta completa antes de devolverla
  async generateResponse(
    userMessage: string,
    conversationHistory: ChatMessage[],
    sessionId: string
  ): Promise<AIResponse> {
    const ctx = await this.buildRequestContext(userMessage, conversationHistory);
    const chat = ctx.model.startChat({ history: ctx.geminiHistory });
    const result = await chat.sendMessage(userMessage);
    const answer = result.response.text() || 'Lo siento, no pude generar una respuesta.';
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
    const processingTime = Date.now() - ctx.start;
    logger.info(`IA respondió en ${processingTime}ms | ${tokensUsed} tokens | sesión ${sessionId}`);
    return { answer, sources: ctx.sources, tokensUsed, processingTime, model: ctx.modelName };
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
      const chat = ctx.model.startChat({ history: ctx.geminiHistory });
      const streamResult = await chat.sendMessageStream(userMessage);

      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) onChunk(text);
      }

      const finalResponse = await streamResult.response;
      const tokensUsed = finalResponse.usageMetadata?.totalTokenCount || 0;
      const processingTime = Date.now() - ctx.start;
      logger.info(`IA (streaming) en ${processingTime}ms | ${tokensUsed} tokens | sesión ${sessionId}`);
      return { sources: ctx.sources, tokensUsed, processingTime, model: ctx.modelName };
    } catch (error: any) {
      const status = error?.status ?? 0;
      const msg = error?.message ?? '';
      const isRateLimit = status === 429 || msg.includes('429') || msg.toLowerCase().includes('quota');

      // Solo reintenta si es rate-limit por minuto (retryDelay corto), no si es quota diario
      const retryDelay = error?.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
      const isShortRetry = retryDelay && parseInt(retryDelay) <= 30;

      if (isRateLimit && isShortRetry && attempt <= 2) {
        const waitMs = (parseInt(retryDelay) + 1) * 1000;
        logger.warn(`Rate limit temporal. Reintentando en ${waitMs / 1000}s (intento ${attempt}/2)...`);
        await new Promise((r) => setTimeout(r, waitMs));
        return this.generateResponseStream(userMessage, conversationHistory, sessionId, onChunk, attempt + 1);
      }
      throw error;
    }
  }

  async generateConversationTitle(firstMessage: string): Promise<string> {
    const config = await this.getSystemConfig();
    const model = genAI.getGenerativeModel({ model: config.model || 'gemini-2.5-flash' });
    const result = await model.generateContent(
      `Genera un título corto (máximo 6 palabras) que resuma la siguiente pregunta de un estudiante universitario. Solo devuelve el título, sin comillas ni puntuación extra.\n\nPregunta: ${firstMessage}`
    );
    return result.response.text()?.trim() || 'Nueva conversación';
  }
}

export const aiService = new AIService();
