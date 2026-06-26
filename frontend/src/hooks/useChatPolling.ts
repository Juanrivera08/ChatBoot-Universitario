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
      const { sessionId, lastAdminReplyAt, addMessage, setTyping, setLastAdminReplyAt, syncHumanMode } =
        useChatStore.getState();

      // Sin sesión aún (el usuario no ha abierto/interactuado) → no hay nada que sondear
      if (!sessionId) return;

      try {
        const { data } = await chatApi.pollPendingReply(sessionId, lastAdminReplyAt ?? undefined);

        // Sincroniza el estado de atención (IA ↔ asesor) ANTES de procesar mensajes.
        // syncHumanMode es idempotente: solo inserta el aviso de sistema en la transición.
        syncHumanMode(data.humanMode);

        if (!data.humanMode) {
          // La IA tiene el control: el indicador de "escribiendo" lo gestiona el
          // flujo de streaming, así que aquí no tocamos nada.
          return;
        }

        // En modo humano mostramos los tres puntos cuando el usuario está esperando
        // respuesta del asesor: bien porque el admin ya está escribiendo, bien porque
        // el último mensaje real del usuario aún no ha sido respondido. Así, al tomar
        // el control, el usuario ve de inmediato que "el asesor va a responder".
        const { messages } = useChatStore.getState();
        const lastReal = [...messages].reverse().find((m) => m.role !== 'system');
        const awaitingAdvisor = !lastReal || lastReal.role === 'user';
        setTyping(data.adminTyping || awaitingAdvisor);

        if (data.replies && data.replies.length > 0) {
          setTyping(false);
          for (const reply of data.replies) {
            // fromHuman: el mensaje lo escribió un asesor, no la IA → avatar/etiqueta de asesor.
            addMessage({ role: 'assistant', content: reply.content, fromHuman: true });
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
