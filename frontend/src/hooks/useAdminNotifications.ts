import { useEffect, useRef } from 'react';
import { adminApi } from '../api/chatApi';
import { useAdminAlertsStore } from '../store/adminAlertsStore';

const POLL_INTERVAL_MS = 4000;

/**
 * Vigilante global de conversaciones que necesitan atención humana.
 *
 * Se monta una sola vez en el layout del panel (AdminPage), así funciona en
 * cualquier pantalla del admin, no solo en "Conversaciones". Cada pocos segundos
 * consulta /admin/live y:
 *   - Publica en el store el nº de conversaciones esperando respuesta (badge).
 *   - Cuando llega un mensaje NUEVO del usuario en modo humano, alerta al admin:
 *       · pitido corto (WebAudio, sin archivos de audio)
 *       · notificación del navegador (si concedió permiso)
 *       · parpadeo del título de la pestaña mientras esté en segundo plano
 *
 * No dispara alertas en la primera carga (evita "avisar" del backlog existente).
 */
export function useAdminNotifications() {
  const setAttentionCount = useAdminAlertsStore((s) => s.setAttentionCount);
  // convId -> last_message_at ya "visto". Detecta mensajes nuevos por conversación.
  const seenRef = useRef<Map<string, string>>(new Map());
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
        const awaiting = (data.conversations || []).filter((c) => c.awaiting_reply);
        setAttentionCount(awaiting.length);

        // ¿Hay conversaciones con un mensaje del usuario que no habíamos visto?
        let newMessages = 0;
        for (const c of awaiting) {
          if (seenRef.current.get(c.id) !== c.last_message_at) newMessages++;
        }

        // Refrescar el "visto" con el estado actual (solo las que esperan respuesta).
        const nextSeen = new Map<string, string>();
        for (const c of awaiting) nextSeen.set(c.id, c.last_message_at);
        seenRef.current = nextSeen;

        if (initializedRef.current && newMessages > 0) {
          notifyNewActivity(awaiting.length);
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

function notifyNewActivity(pendingCount: number) {
  playBeep();
  showBrowserNotification(pendingCount);
  if (document.hidden) startTitleFlash(pendingCount);
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

function showBrowserNotification(pendingCount: number) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification('Nueva actividad en el chat', {
      body:
        pendingCount > 1
          ? `${pendingCount} conversaciones esperan tu respuesta`
          : 'Un usuario espera tu respuesta',
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

// ── Parpadeo del título de la pestaña ──
let flashTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle = '';

function startTitleFlash(pendingCount: number) {
  const alertTitle =
    pendingCount > 1 ? `(${pendingCount}) Nuevos mensajes` : '(1) Nuevo mensaje';
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
