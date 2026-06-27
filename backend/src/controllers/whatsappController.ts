import { Request, Response } from 'express';
import crypto from 'crypto';
import { toFile } from 'openai';
import { openai } from '../config/openai';
import { whatsappService } from '../services/whatsappService';
import { aiService } from '../services/aiService';
import { flowService } from '../services/flowService';
import { conversationService } from '../services/conversationService';
import { logger } from '../utils/logger';

// Usa el número de teléfono como sessionId para WhatsApp
function getSessionId(phone: string): string {
  return `wa_${phone}`;
}

// Transcribe audio de WhatsApp usando Whisper (OpenAI)
async function transcribeWhatsAppAudio(mediaId: string): Promise<string> {
  const audioBuffer = await whatsappService.downloadAudio(mediaId);
  // WhatsApp envía audios de voz en formato OGG/Opus
  const file = await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' });

  const result = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'es',
  });
  return result.text.trim();
}

// Procesa cualquier mensaje de texto entrante (texto o transcripción de audio)
async function processIncomingText(
  from: string,
  text: string,
  whatsappMessageId: string
): Promise<void> {
  const sessionId = getSessionId(from);

  // Marcar como leído
  await whatsappService.markRead(whatsappMessageId);

  // Crear/obtener conversación en la BD
  const conversation = await conversationService.getOrCreateConversation(sessionId, 'WhatsApp', from);
  await conversationService.saveMessage(conversation.id, 'user', text);

  const history = await conversationService.getHistory(sessionId, 10);
  const historyForAI = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // ── FLUJOS GUIADOS ────────────────────────────────────────────
  const activeSession = await flowService.getActiveSession(sessionId);
  if (activeSession) {
    const flowRes = await flowService.processStep(activeSession, text);
    await conversationService.saveMessage(conversation.id, 'assistant', flowRes.message);

    if (flowRes.type === 'flow_complete' && flowRes.radicado && flowRes.submissionData) {
      // Buscar el flujo para obtener el completion_message
      await whatsappService.sendCompletionCard(
        from,
        flowRes.radicado,
        flowRes.flowName || 'Solicitud',
        flowRes.message,
        flowRes.submissionData
      );
    } else if (
      flowRes.type === 'flow_question' &&
      flowRes.step &&
      flowRes.currentStep !== undefined &&
      flowRes.totalSteps !== undefined
    ) {
      await whatsappService.sendFlowStep(
        from,
        flowRes.message,
        flowRes.step.field_type,
        (flowRes.step.options as any) || [],
        flowRes.flowName || '',
        flowRes.currentStep,
        flowRes.totalSteps
      );
    } else {
      await whatsappService.sendText(from, flowRes.message);
    }
    return;
  }

  const triggeredFlow = await flowService.detectFlow(text);
  if (triggeredFlow) {
    const flowRes = await flowService.startFlow(sessionId, triggeredFlow);
    await conversationService.saveMessage(conversation.id, 'assistant', flowRes.message);

    if (flowRes.step && flowRes.currentStep !== undefined && flowRes.totalSteps !== undefined) {
      await whatsappService.sendFlowStep(
        from,
        flowRes.message,
        flowRes.step.field_type,
        (flowRes.step.options as any) || [],
        flowRes.flowName || '',
        flowRes.currentStep,
        flowRes.totalSteps
      );
    } else {
      await whatsappService.sendText(from, flowRes.message);
    }
    return;
  }
  // ── FIN FLUJOS ────────────────────────────────────────────────

  // Respuesta normal de IA
  const aiResponse = await aiService.generateResponse(text, historyForAI, sessionId);
  await conversationService.saveMessage(conversation.id, 'assistant', aiResponse.answer, {
    tokensUsed: aiResponse.tokensUsed,
    modelUsed: aiResponse.model,
    sources: aiResponse.sources,
  });

  await whatsappService.sendText(from, aiResponse.answer);
}

// ── FIRMA HMAC-SHA256 (Meta envía X-Hub-Signature-256 en cada POST) ──────────
function isValidSignature(req: Request): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.warn('WHATSAPP_APP_SECRET no configurado — verificación de firma desactivada');
    return false;
  }
  const sig = req.headers['x-hub-signature-256'] as string | undefined;
  if (!sig) return false;
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', appSecret).update(JSON.stringify(req.body)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── WEBHOOK VERIFICATION (GET) ────────────────────────────────────
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verificado exitosamente');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Token de verificación inválido');
  }
}

// ── RECIBIR MENSAJES (POST) ───────────────────────────────────────
export async function receiveMessage(req: Request, res: Response): Promise<void> {
  if (!isValidSignature(req)) {
    logger.warn('WhatsApp webhook: firma inválida rechazada');
    res.status(403).send('Firma inválida');
    return;
  }
  // Responder 200 inmediatamente — Meta requiere respuesta rápida o reintenta
  res.status(200).send('OK');

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages?.length) continue;

        for (const message of value.messages) {
          const from: string = message.from;
          const msgId: string = message.id;

          logger.info(`WhatsApp mensaje entrante de ${from} — tipo: ${message.type}`);

          if (message.type === 'text') {
            const text = message.text?.body?.trim();
            if (text) await processIncomingText(from, text, msgId);

          } else if (message.type === 'audio') {
            // Nota de voz — transcribir con Whisper (OpenAI)
            const mediaId = message.audio?.id;
            if (!mediaId) continue;

            await whatsappService.markRead(msgId);
            await whatsappService.sendText(from, '_🎙️ Transcribiendo tu nota de voz…_');

            try {
              const transcription = await transcribeWhatsAppAudio(mediaId);
              if (transcription) {
                logger.info(`Audio transcrito: "${transcription.slice(0, 80)}"`);
                await processIncomingText(from, transcription, msgId);
              } else {
                await whatsappService.sendText(from, 'No pude entender el audio. ¿Puedes escribir tu pregunta?');
              }
            } catch (err) {
              logger.error('Error transcribiendo audio WhatsApp:', err);
              await whatsappService.sendText(from, 'No pude procesar el audio. Por favor escribe tu pregunta.');
            }

          } else if (message.type === 'interactive') {
            // Respuesta a botón o lista
            const reply =
              message.interactive?.button_reply?.id ||
              message.interactive?.list_reply?.id;
            const replyTitle =
              message.interactive?.button_reply?.title ||
              message.interactive?.list_reply?.title;

            if (reply) {
              // Mapear IDs especiales de confirmación
              let textToProcess = replyTitle || reply;
              if (reply === 'confirm_yes') textToProcess = 'Sí, confirmar';
              if (reply === 'confirm_no') textToProcess = 'No, cancelar';

              await processIncomingText(from, textToProcess, msgId);
            }

          } else {
            // Tipo no soportado (imagen, video, documento, etc.)
            await whatsappService.markRead(msgId);
            await whatsappService.sendText(
              from,
              'Por ahora solo puedo procesar mensajes de texto y notas de voz. ¿En qué te puedo ayudar?'
            );
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error procesando webhook WhatsApp:', error);
  }
}
