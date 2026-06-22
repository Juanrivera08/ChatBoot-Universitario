import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { motion } from 'framer-motion';
import { useChatStore } from '../../store/chatStore';
import { chatApi } from '../../api/chatApi';
import { v4 as uuidv4 } from 'uuid';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

const WELCOME_MESSAGE = `¡Hola! Soy el **Asistente de Servicios Digitales** de la Institución Universitaria Salazar y Herrera.

Puedo ayudarte con información sobre:
- 📅 Calendario académico y fechas de matrícula
- 🎓 Programas y carreras disponibles
- 📋 Reglamentos y normativas
- 🏥 Servicios de bienestar universitario
- 📝 Trámites y certificados
- 📞 Información de contacto

¿En qué puedo ayudarte?`;

// Velocidad de visualización word-by-word (ms entre tokens)
const WORD_DELAY_MS = 28;

export default function ChatWindow() {
  const {
    messages,
    isTyping,
    sessionId,
    addMessage,
    setTyping,
    setSessionId,
    removeLastMessages,
    appendToLastAssistantMessage,
    setLastAssistantMessageData,
  } = useChatStore();

  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const humanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cola de tokens pendientes de mostrar y bandera de stream activo
  const displayQueue = useRef<string[]>([]);
  const isStreamingActive = useRef(false);
  const displayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialized = useRef(false);

  useEffect(() => {
    // Strict Mode monta el componente dos veces en dev — el flag evita doble bienvenida
    if (!initialized.current) {
      initialized.current = true;
      if (!sessionId) setSessionId(uuidv4());
      if (messages.length === 0) addMessage({ role: 'assistant', content: WELCOME_MESSAGE });
    }
    return () => {
      abortRef.current?.abort();
      if (displayTimer.current) clearTimeout(displayTimer.current);
      if (humanPollRef.current) clearInterval(humanPollRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Procesa la cola de tokens uno por uno con delay para efecto word-by-word
  const startDisplayTimer = () => {
    const tick = () => {
      if (displayQueue.current.length > 0) {
        const token = displayQueue.current.shift()!;
        flushSync(() => appendToLastAssistantMessage(token));
        displayTimer.current = setTimeout(tick, WORD_DELAY_MS);
      } else if (isStreamingActive.current) {
        // Stream aún activo pero cola vacía: espera más tokens
        displayTimer.current = setTimeout(tick, 10);
      } else {
        displayTimer.current = null;
      }
    };
    if (!displayTimer.current) {
      displayTimer.current = setTimeout(tick, WORD_DELAY_MS);
    }
  };

  // Espera a que la cola de visualización se vacíe antes de finalizar
  const waitForDisplayQueue = (): Promise<void> =>
    new Promise((resolve) => {
      const check = () => {
        if (displayQueue.current.length === 0 && !displayTimer.current) {
          resolve();
        } else {
          setTimeout(check, 30);
        }
      };
      check();
    });

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isSending) return;

    // Cancelar polling humano activo antes de enviar nuevo mensaje
    if (humanPollRef.current) {
      clearInterval(humanPollRef.current);
      humanPollRef.current = null;
    }

    setLastFailedMessage(null);
    setIsSending(true);
    displayQueue.current = [];
    isStreamingActive.current = false;

    addMessage({ role: 'user', content: messageText });
    setTyping(true);

    const currentSessionId = sessionId || uuidv4();
    if (!sessionId) setSessionId(currentSessionId);

    abortRef.current = new AbortController();
    let isFirstChunk = true;

    try {
      const donePayload = await chatApi.sendMessageStream(
        messageText,
        currentSessionId,
        (chunk) => {
          if (isFirstChunk) {
            // Primer chunk: quita los puntos, agrega la burbuja vacía y arranca el timer
            flushSync(() => {
              setTyping(false);
              addMessage({ role: 'assistant', content: '', isStreaming: true });
            });
            isFirstChunk = false;
            isStreamingActive.current = true;
            startDisplayTimer();
          }
          // Divide el chunk en tokens (palabras + espacios) y los encola
          const tokens = chunk.match(/\S+|\s+/g) ?? [chunk];
          tokens.forEach((t) => displayQueue.current.push(t));
        },
        abortRef.current.signal
      );

      isStreamingActive.current = false;

      // Modo humano: el admin responderá manualmente; hacer polling cada 3s
      if (donePayload.humanPending) {
        // isTyping permanece true para mostrar el indicador de escritura
        humanPollRef.current = setInterval(async () => {
          try {
            const { data } = await chatApi.pollPendingReply(currentSessionId);
            if (!data.humanMode || (!data.pending && data.reply !== undefined)) {
              clearInterval(humanPollRef.current!);
              humanPollRef.current = null;
              setTyping(false);
              if (data.reply) {
                addMessage({ role: 'assistant', content: data.reply });
              }
            }
          } catch {
            // Error de red — seguir intentando
          }
        }, 3000);
        return;
      }

      // Respuesta de flujo guiado — no hubo stream, agregar mensaje directo
      if (donePayload.flowState) {
        setTyping(false);
        // Si no hubo chunks (flujo interceptado antes del stream)
        if (isFirstChunk) {
          addMessage({
            role: 'assistant',
            content: donePayload.flowState.type === 'flow_complete'
              ? donePayload.flowState.message ?? ''
              : donePayload.flowState.message ?? '',
            flowState: donePayload.flowState,
          });
        } else {
          // Ya se creó la burbuja vacía con isStreaming — solo actualizar datos
          await waitForDisplayQueue();
          setLastAssistantMessageData({
            isStreaming: false,
            sources: [],
            flowState: donePayload.flowState,
          });
        }
        if (donePayload.sessionId && donePayload.sessionId !== currentSessionId) {
          setSessionId(donePayload.sessionId);
        }
        return;
      }

      await waitForDisplayQueue();

      if (donePayload.sessionId && donePayload.sessionId !== currentSessionId) {
        setSessionId(donePayload.sessionId);
      }

      setLastAssistantMessageData({
        isStreaming: false,
        sources: donePayload.sources,
        processingTime: donePayload.processingTime,
      });
    } catch (err: any) {
      isStreamingActive.current = false;
      if (displayTimer.current) { clearTimeout(displayTimer.current); displayTimer.current = null; }
      if (humanPollRef.current) { clearInterval(humanPollRef.current); humanPollRef.current = null; }
      displayQueue.current = [];

      setTyping(false);

      if (err?.name !== 'AbortError') {
        setLastFailedMessage(messageText);
        if (!isFirstChunk) {
          setLastAssistantMessageData({ isStreaming: false });
          appendToLastAssistantMessage('\n\n*⚠️ Respuesta interrumpida. Puedes reintentar.*');
        } else {
          addMessage({
            role: 'assistant',
            content: '⚠️ No pude procesar tu consulta en este momento. Puedes reintentar o contactar directamente a la universidad.',
          });
        }
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  };

  const handleSend = async (text?: string) => {
    const messageText = (text || inputValue).trim();
    if (!messageText) return;
    setInputValue('');
    await sendMessage(messageText);
  };

  const handleRetry = async () => {
    if (!lastFailedMessage) return;
    // Elimina hacia atrás hasta encontrar y quitar el mensaje del usuario fallido
    const msgs = messages;
    let toRemove = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      toRemove++;
      if (msgs[i].role === 'user' && msgs[i].content === lastFailedMessage) break;
    }
    removeLastMessages(toRemove);
    await sendMessage(lastFailedMessage);
  };

  return (
    <motion.div
      className="flex h-[600px] w-[380px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl shadow-black/60"
      initial={{ opacity: 0, y: 40, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      <ChatHeader />

      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          isTyping={isTyping}
          onQuickReply={handleSend}
          onOptionSelect={handleSend}
          lastFailedMessage={lastFailedMessage}
          onRetry={handleRetry}
        />
      </div>

      <MessageInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        isDisabled={isSending}
      />
    </motion.div>
  );
}
