import { useEffect, useRef } from 'react';
import { adminApi } from '../api/chatApi';
import { useAdminAlertsStore } from '../store/adminAlertsStore';

const POLL_INTERVAL_MS = 4000;

/**
 * Vigilante global de la actividad del chat para el panel admin.
 *
 * Se monta una sola vez en el layout del panel (AdminPage), así funciona en
 * cualquier pantalla del admin, no solo en "Conversaciones". Cada pocos segundos
 * consulta /admin/live (todas las conversaciones recientes, en cualquier modo) y:
 *   - Publica en el store el nº de conversaciones en modo humano esperando
 *     respuesta del asesor (badge del menú "Conversaciones").
 *   - Alerta al admin cuando:
 *       · se INICIA una conversación nueva (primer mensaje del usuario), o
 *       · un usuario ENVÍA un mensaje nuevo en una conversación ya existente,
 *     sin importar si la atiende la IA o un asesor. La alerta combina:
 *       · pitido corto (WebAudio, sin archivos de audio)
 *       · notificación del navegador (si concedió permiso)
 *       · parpadeo del título de la pestaña mientras esté en segundo plano
 *
 * No dispara alertas en la primera carga (evita "avisar" del backlog existente).
 */
export function useAdminNotifications() {
  const setAttentionCount = useAdminAlertsStore((s) => s.setAttentionCount);
  // convId -> last_user_message_at ya "visto". Detecta, por conversación:
  //   · ausente en el mapa  → conversación nunca vista
  //   · valor null          → vista pero el usuario aún no había escrito
  //   · valor cambiado      → el usuario mandó un mensaje nuevo
  // No se poda: conservar los ids evita re-avisar de conversaciones que salen y
  // vuelven a entrar en la ventana reciente.
  const seenRef = useRef<Map<string, string | null>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    // Pedir permiso de notificaciones una vez (silencioso si ya se decidió).
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const { data } = await adminApi.getLiveConversations();
        const conversations = data.conversations || [];

        // Badge: conversaciones en modo humano donde el usuario espera al asesor.
        const awaitingHuman = conversations.filter(
          (c) => c.human_mode && c.awaiting_reply
        ).length;
        setAttentionCount(awaitingHuman);

        // Detectar novedades comparando contra lo ya visto (salvo la 1ª carga).
        if (initializedRef.current) {
          let newConversations = 0;
          let newUserMessages = 0;
          const { markUnread } = useAdminAlertsStore.getState();
          for (const c of conversations) {
            if (!c.last_user_message_at) continue; // sin mensajes del usuario aún
            const seen = seenRef.current.get(c.id);
            if (!seen) {
              // Primer mensaje del usuario que vemos en esta conversación.
              newConversations++;
              markUnread(c.id); // resalta la fila en la lista de Conversaciones
            } else if (c.last_user_message_at !== seen) {
              newUserMessages++;
              markUnread(c.id);
            }
          }
          if (newConversations > 0 || newUserMessages > 0) {
            notifyNewActivity({ newConversations, newUserMessages });
          }
        }

        // Actualizar la marca de "visto" con el estado actual (sin podar).
        for (const c of conversations) {
          seenRef.current.set(c.id, c.last_user_message_at);
        }
        initializedRef.current = true;
      } catch {
        /* fallo de red puntual — el siguiente tick reintenta */
      }
      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stopTitleFlash();
    };
  }, [setAttentionCount]);
}

// ─────────────────────────────── Helpers ───────────────────────────────

interface Activity {
  newConversations: number;
  newUserMessages: number;
}

function notifyNewActivity(activity: Activity) {
  playBeep();
  showBrowserNotification(activity);
  if (document.hidden) {
    startTitleFlash(activity.newConversations + activity.newUserMessages);
  }
}

/** Pitido corto generado con WebAudio (evita depender de un archivo de audio). */
function playBeep() {
  if (!useAdminAlertsStore.getState().soundEnabled) return;
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.35);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* audio bloqueado por el navegador — se ignora */
  }
}

function showBrowserNotification({ newConversations, newUserMessages }: Activity) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Priorizar el aviso de conversaciones nuevas; describir también los mensajes.
  let title: string;
  let body: string;
  if (newConversations > 0 && newUserMessages > 0) {
    title = 'Nueva actividad en el chat';
    body = `${plural(newConversations, 'conversación nueva', 'conversaciones nuevas')} y ${plural(
      newUserMessages,
      'mensaje nuevo',
      'mensajes nuevos'
    )}`;
  } else if (newConversations > 0) {
    title = 'Nueva conversación iniciada';
    body =
      newConversations > 1
        ? `${newConversations} conversaciones nuevas iniciadas`
        : 'Un usuario inició una conversación';
  } else {
    title = 'Nuevo mensaje en el chat';
    body =
      newUserMessages > 1
        ? `${newUserMessages} mensajes nuevos de usuarios`
        : 'Un usuario envió un mensaje';
  }

  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'ush-chat-attention', // reemplaza la anterior en lugar de apilar
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* algunos navegadores lanzan si la pestaña está en segundo plano */
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ── Parpadeo del título de la pestaña ──
let flashTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle = '';

function startTitleFlash(newCount: number) {
  const alertTitle =
    newCount > 1 ? `(${newCount}) Nueva actividad` : '(1) Nueva actividad';
  if (flashTimer) return; // ya está parpadeando
  originalTitle = document.title;
  let showAlert = true;
  flashTimer = setInterval(() => {
    document.title = showAlert ? alertTitle : originalTitle;
    showAlert = !showAlert;
  }, 1000);

  // Al volver a la pestaña, restaurar el título.
  const onVisible = () => {
    if (!document.hidden) {
      stopTitleFlash();
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
  document.addEventListener('visibilitychange', onVisible);
}

function stopTitleFlash() {
  if (flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
    if (originalTitle) document.title = originalTitle;
  }
}
