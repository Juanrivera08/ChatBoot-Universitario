import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { aiService } from '../services/aiService';
import { conversationService } from '../services/conversationService';
import { flowService, FlowResponse } from '../services/flowService';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

// Helper compartido: detecta y procesa flujos guiados antes de llamar a la IA.
// Retorna FlowResponse si el mensaje activa/continúa un flujo, null si no.
async function tryHandleFlow(
  message: string,
  sessionId: string,
  conversationId: string
): Promise<FlowResponse | null> {
  const activeSession = await flowService.getActiveSession(sessionId);
  if (activeSession) {
    const flowRes = await flowService.processStep(activeSession, message);
    await conversationService.saveMessage(conversationId, 'assistant', flowRes.message);
    return flowRes;
  }

  const triggeredFlow = await flowService.detectFlow(message);
  if (triggeredFlow) {
    const flowRes = await flowService.startFlow(sessionId, triggeredFlow);
    await conversationService.saveMessage(conversationId, 'assistant', flowRes.message);
    return flowRes;
  }

  return null;
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));

    const { message, sessionId: clientSessionId } = req.body;
    const sessionId = clientSessionId || uuidv4();

    const conversation = await conversationService.getOrCreateConversation(
      sessionId,
      req.headers['user-agent'],
      req.ip ?? req.socket.remoteAddress
    );

    const history = await conversationService.getHistory(sessionId, 20);
    const historyForAI = history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    await conversationService.saveMessage(conversation.id, 'user', message);

    if (conversation.human_mode) {
      return res.json({ sessionId, humanPending: true, sources: [], answer: null });
    }

    const flowRes = await tryHandleFlow(message, sessionId, conversation.id);
    if (flowRes) {
      return res.json({ sessionId, answer: flowRes.message, sources: [], flowState: flowRes });
    }

    const aiResponse = await aiService.generateResponse(message, historyForAI, sessionId);
    const savedMessage = await conversationService.saveMessage(
      conversation.id, 'assistant', aiResponse.answer,
      { tokensUsed: aiResponse.tokensUsed, modelUsed: aiResponse.model, sources: aiResponse.sources, processingTime: aiResponse.processingTime }
    );

    res.json({
      sessionId,
      messageId: savedMessage.id,
      answer: aiResponse.answer,
      sources: aiResponse.sources,
      processingTime: aiResponse.processingTime,
    });
  } catch (error) {
    logger.error('Error en sendMessage:', error);
    next(error);
  }
}

export async function sendMessageStream(req: Request, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));

    const { message, sessionId: clientSessionId } = req.body;
    const sessionId = clientSessionId || uuidv4();

    // Cabeceras SSE — deshabilita buffering en nginx para envío inmediato de chunks
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    if (res.socket) res.socket.setNoDelay(true);

    const sendEvent = (data: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const conversation = await conversationService.getOrCreateConversation(
      sessionId, req.headers['user-agent'], req.ip ?? req.socket.remoteAddress
    );

    const history = await conversationService.getHistory(sessionId, 20);
    const historyForAI = history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    await conversationService.saveMessage(conversation.id, 'user', message);

    if (conversation.human_mode) {
      sendEvent({ type: 'done', sessionId, sources: [], humanPending: true, processingTime: 0 });
      return res.end();
    }

    // Flujos guiados — respuesta inmediata sin stream
    const flowRes = await tryHandleFlow(message, sessionId, conversation.id);
    if (flowRes) {
      sendEvent({ type: 'done', sessionId, sources: [], flowState: flowRes, processingTime: 0 });
      return res.end();
    }

    // IA con streaming
    let fullAnswer = '';
    try {
      const meta = await aiService.generateResponseStream(message, historyForAI, sessionId, (chunk) => {
        fullAnswer += chunk;
        sendEvent({ type: 'chunk', content: chunk });
      });

      const savedMessage = await conversationService.saveMessage(
        conversation.id, 'assistant', fullAnswer,
        { tokensUsed: meta.tokensUsed, modelUsed: meta.model, sources: meta.sources, processingTime: meta.processingTime }
      );

      sendEvent({ type: 'done', sessionId, messageId: savedMessage.id, sources: meta.sources, processingTime: meta.processingTime });
    } catch (streamError: any) {
      logger.error('Error durante streaming:', streamError);
      const isQuota = streamError?.status === 429 || streamError?.message?.includes('429');
      sendEvent({
        type: 'error',
        message: isQuota
          ? 'El servicio de IA alcanzó su límite. Intenta en unos minutos.'
          : 'Error generando respuesta. Intenta de nuevo.',
      });
    }

    res.end();
  } catch (error) {
    logger.error('Error en sendMessageStream:', error);
    if (!res.headersSent) return next(error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Error interno del servidor' })}\n\n`);
    res.end();
  }
}

export async function getHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const messages = await conversationService.getHistory(req.params.sessionId);
    res.json({ messages });
  } catch (error) { next(error); }
}

export async function deleteConversation(req: Request, res: Response, next: NextFunction) {
  try {
    await conversationService.deleteConversation(req.params.sessionId);
    res.json({ message: 'Conversación eliminada' });
  } catch (error) { next(error); }
}

export async function submitFeedback(req: Request, res: Response, next: NextFunction) {
  try {
    await conversationService.submitFeedback(req.params.sessionId, req.body.rating);
    res.json({ message: 'Valoración registrada, ¡gracias!' });
  } catch (error) { next(error); }
}

export async function pollPendingReply(req: Request, res: Response, next: NextFunction) {
  try {
    // Nunca cachear: el polling debe ver siempre el estado real (modo humano /
    // mensajes nuevos). Sin esto, navegador o proxy pueden servir una respuesta
    // stale y el widget no detectaría el "Tomar control" hasta refrescar.
    res.setHeader('Cache-Control', 'no-store');
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const result = await conversationService.getPendingReply(req.params.sessionId, since);
    res.json(result);
  } catch (error) { next(error); }
}
