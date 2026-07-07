import { create } from 'zustand';

// Estado global de alertas del panel admin.
// - attentionCount: nº de conversaciones en modo humano esperando respuesta del asesor.
//   Lo consume el badge del menú "Conversaciones" en el Sidebar.
// - soundEnabled: preferencia (persistida) para silenciar el sonido de las alertas.

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
  setAttentionCount: (n: number) => void;
  toggleSound: () => void;
}

export const useAdminAlertsStore = create<AdminAlertsState>((set, get) => ({
  attentionCount: 0,
  soundEnabled: readSoundPref(),
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
}));
