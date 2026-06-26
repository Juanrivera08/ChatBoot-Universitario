import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { chatApi } from '../api/chatApi';

const POLL_INTERVAL_MS = 1500;

/**
 * Polling del modo humano ("Tomar control" del admin).
 *
 * Vive en ChatWidget (siempre montado), NO en ChatWindow (que se desmonta al
 * cerrar el widget). Así los mensajes del admin llegan en tiempo real aunque
 * el usuario tenga el chat cerrado: se agregan al historial e incrementan el
 * badge de no leídos, y al reabrir ya están ahí — sin necesidad de refrescar.
 *
 * Idempotente y seguro frente a StrictMode/doble montaje gracias al guard por ref.
 */
export function useChatPolling() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) return; // guard: una sola instancia de polling

    const tick = async () => {
      const { sessionId, lastAdminReplyAt, addMessage, setTyping, setLastAdminReplyAt } =
        useChatStore.getState();

      // Sin sesión aún (el usuario no ha abierto/interactuado) → no hay nada que sondear
      if (!sessionId) return;

      try {
        const { data } = await chatApi.pollPendingReply(sessionId, lastAdminReplyAt ?? undefined);

        if (!data.humanMode) {
          // La IA tiene el control: el indicador de "escribiendo" lo gestiona el
          // flujo de streaming, así que aquí no tocamos nada.
          return;
        }

        // El admin está escribiendo → mostrar los tres puntos
        setTyping(data.adminTyping || false);

        if (data.replies && data.replies.length > 0) {
          setTyping(false);
          for (const reply of data.replies) {
            addMessage({ role: 'assistant', content: reply.content });
          }
          // Avanza el cursor (persistido) para no re-agregar tras un refresh
          setLastAdminReplyAt(data.replies[data.replies.length - 1].created_at);
        }
      } catch {
        /* error de red puntual — el siguiente tick reintenta */
      }
    };

    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}
