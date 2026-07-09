import { create } from 'zustand';

// Estado global de alertas del panel admin.
// - attentionCount: nº de conversaciones en modo humano esperando respuesta del asesor.
//   Lo consume el badge del menú "Conversaciones" en el Sidebar.
// - soundEnabled: preferencia (persistida) para silenciar el sonido de las alertas.
// - unread: convId -> nº de mensajes nuevos del usuario que el asesor aún no ha
//   abierto. Lo alimenta el hook de notificaciones y lo consume la lista de
//   Conversaciones para iluminar la fila y mostrar un contador.

const SOUND_KEY = 'ush_admin_alert_sound';

function readSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
}

interface AdminAlertsState {
  attentionCount: number;
  soundEnabled: boolean;
  unread: Record<string, number>;
  setAttentionCount: (n: number) => void;
  toggleSound: () => void;
  markUnread: (convId: string, n?: number) => void;
  clearUnread: (convId: string) => void;
}

export const useAdminAlertsStore = create<AdminAlertsState>((set, get) => ({
  attentionCount: 0,
  soundEnabled: readSoundPref(),
  unread: {},
  setAttentionCount: (n) => {
    if (get().attentionCount !== n) set({ attentionCount: n });
  },
  toggleSound: () => {
    const next = !get().soundEnabled;
    try {
      localStorage.setItem(SOUND_KEY, next ? '1' : '0');
    } catch {
      /* almacenamiento no disponible — la preferencia solo dura la sesión */
    }
    set({ soundEnabled: next });
  },
  markUnread: (convId, n = 1) =>
    set((s) => ({ unread: { ...s.unread, [convId]: (s.unread[convId] || 0) + n } })),
  clearUnread: (convId) =>
    set((s) => {
      if (!s.unread[convId]) return s; // nada que limpiar → evita re-render
      const next = { ...s.unread };
      delete next[convId];
      return { unread: next };
    }),
}));
