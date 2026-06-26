import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Message, ChatState } from '../types';
import { chatApi } from '../api/chatApi';

interface ChatActions {
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  minimizeChat: () => void;
  addMessage: (message: Omit<Message, 'id' | 'createdAt'>) => void;
  setTyping: (isTyping: boolean) => void;
  setSessionId: (id: string) => void;
  toggleDarkMode: () => void;
  clearMessages: () => void;
  deleteConversation: () => Promise<void>;
  removeLastMessages: (count: number) => void;
  removeStreamingMessages: () => void;
  appendToLastAssistantMessage: (chunk: string) => void;
  setLastAssistantMessageData: (updates: Partial<Pick<Message, 'isStreaming' | 'sources' | 'processingTime' | 'flowState'>>) => void;
  // Inicialización idempotente: garantiza sessionId y un único saludo, leyendo
  // el estado VIVO (no un closure obsoleto). Llamable múltiples veces sin duplicar.
  ensureInitialized: (welcome: string) => void;
  setLastAdminReplyAt: (ts: string) => void;
  // Sincroniza el estado de atención (IA ↔ asesor humano) con el backend.
  // Idempotente: solo actúa en la transición e inserta el aviso de sistema una vez.
  syncHumanMode: (enabled: boolean) => void;
}

const generateSessionId = () => uuidv4();

// Avisos de sistema mostrados al usuario en cada transición de atención.
const HUMAN_TAKEOVER_NOTICE =
  '👤 Un asesor de la universidad se comunicará contigo en breve para continuar tu atención de forma personalizada.';
const AI_RESUMED_NOTICE =
  '💬 La conversación ha vuelto al asistente virtual. La inteligencia artificial continuará ayudándote.';

const makeSystemMessage = (content: string): Message => ({
  id: uuidv4(),
  role: 'system',
  content,
  createdAt: new Date(),
});

export const useChatStore = create<ChatState & ChatActions>()(
  persist(
    (set, get) => ({
      isOpen: false,
      isMinimized: false,
      messages: [],
      isTyping: false,
      sessionId: null,
      isDarkMode: true,
      unreadCount: 0,
      hasEverOpened: false,
      lastAdminReplyAt: null,
      humanMode: false,

      openChat: () => set({ isOpen: true, isMinimized: false, unreadCount: 0, hasEverOpened: true }),
      closeChat: () => set({ isOpen: false }),
      toggleChat: () =>
        set((state) => ({
          isOpen: !state.isOpen,
          isMinimized: false,
          unreadCount: state.isOpen ? state.unreadCount : 0,
          hasEverOpened: true,
        })),
      minimizeChat: () => set({ isMinimized: true, isOpen: false }),
      addMessage: (message) =>
        set((state) => ({
          messages: [
            ...state.messages,
            { ...message, id: uuidv4(), createdAt: new Date() },
          ],
          // Incrementa unread si el chat está cerrado y el mensaje no es del usuario
          // (respuestas del asistente/asesor y avisos del sistema deben notificarse).
          unreadCount:
            !state.isOpen && message.role !== 'user'
              ? state.unreadCount + 1
              : state.unreadCount,
        })),
      setTyping: (isTyping) => set({ isTyping }),
      setSessionId: (id) => set({ sessionId: id }),
      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      clearMessages: () => set({ messages: [], sessionId: generateSessionId(), unreadCount: 0, lastAdminReplyAt: null, humanMode: false }),
      deleteConversation: async () => {
        const currentSessionId = get().sessionId;
        if (currentSessionId) {
          try { await chatApi.deleteConversation(currentSessionId); } catch (e) { console.warn('deleteConversation:', e); }
        }
        set({ messages: [], sessionId: generateSessionId(), unreadCount: 0, lastAdminReplyAt: null, humanMode: false });
      },
      removeLastMessages: (count) =>
        set((state) => ({
          messages: state.messages.slice(0, Math.max(0, state.messages.length - count)),
        })),
      // Elimina la burbuja de IA a medio escribir (isStreaming) sin importar su posición.
      // Se usa cuando el admin toma el control durante el streaming: descartamos el texto
      // parcial de la IA para que responda el asesor. No usa la posición porque el poller
      // puede haber insertado el aviso de sistema después de la burbuja.
      removeStreamingMessages: () =>
        set((state) => ({
          messages: state.messages.filter((m) => !m.isStreaming),
        })),
      appendToLastAssistantMessage: (chunk) =>
        set((state) => {
          const messages = [...state.messages];
          const lastIdx = messages.length - 1;
          if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
            messages[lastIdx] = { ...messages[lastIdx], content: messages[lastIdx].content + chunk };
          }
          return { messages };
        }),
      setLastAssistantMessageData: (updates) =>
        set((state) => {
          const messages = [...state.messages];
          const lastIdx = messages.length - 1;
          if (lastIdx >= 0 && messages[lastIdx].role === 'assistant') {
            messages[lastIdx] = { ...messages[lastIdx], ...updates };
          }
          return { messages };
        }),
      ensureInitialized: (welcome) =>
        set((state) => {
          // Lee el estado VIVO dentro de set → idempotente frente a StrictMode,
          // doble montaje y rehidratación de persist. Nunca duplica el saludo.
          const updates: Partial<ChatState> = {};
          if (!state.sessionId) updates.sessionId = generateSessionId();
          if (state.messages.length === 0) {
            updates.messages = [
              { id: uuidv4(), role: 'assistant', content: welcome, createdAt: new Date() },
            ];
          }
          return updates;
        }),
      setLastAdminReplyAt: (ts) => set({ lastAdminReplyAt: ts }),
      syncHumanMode: (enabled) =>
        set((state) => {
          // Sin cambio de estado → nada que hacer (evita avisos duplicados en cada poll).
          if (state.humanMode === enabled) return {};
          const notice = enabled ? HUMAN_TAKEOVER_NOTICE : AI_RESUMED_NOTICE;
          return {
            humanMode: enabled,
            messages: [...state.messages, makeSystemMessage(notice)],
            // El aviso cuenta como no leído si el chat está cerrado.
            unreadCount: state.isOpen ? state.unreadCount : state.unreadCount + 1,
          };
        }),
    } as ChatState & ChatActions),
    {
      name: 'ush-chat-storage',
      partialize: (state) => ({
        sessionId: state.sessionId,
        isDarkMode: state.isDarkMode,
        hasEverOpened: state.hasEverOpened,
        lastAdminReplyAt: state.lastAdminReplyAt,
        humanMode: state.humanMode,
        messages: state.messages.slice(-50),
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.messages) {
          state.messages = state.messages.map((m) => ({
            ...m,
            createdAt: new Date(m.createdAt as unknown as string),
          }));
        }
      },
    }
  )
);
