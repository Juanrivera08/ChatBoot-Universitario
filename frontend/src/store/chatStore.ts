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
  appendToLastAssistantMessage: (chunk: string) => void;
  setLastAssistantMessageData: (updates: Partial<Pick<Message, 'isStreaming' | 'sources' | 'processingTime' | 'flowState'>>) => void;
  // Inicialización idempotente: garantiza sessionId y un único saludo, leyendo
  // el estado VIVO (no un closure obsoleto). Llamable múltiples veces sin duplicar.
  ensureInitialized: (welcome: string) => void;
  setLastAdminReplyAt: (ts: string) => void;
}

const generateSessionId = () => uuidv4();

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
          // Solo incrementa unread si el chat está cerrado y el mensaje es del asistente
          unreadCount:
            !state.isOpen && message.role === 'assistant'
              ? state.unreadCount + 1
              : state.unreadCount,
        })),
      setTyping: (isTyping) => set({ isTyping }),
      setSessionId: (id) => set({ sessionId: id }),
      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      clearMessages: () => set({ messages: [], sessionId: generateSessionId(), unreadCount: 0, lastAdminReplyAt: null }),
      deleteConversation: async () => {
        const currentSessionId = get().sessionId;
        if (currentSessionId) {
          try { await chatApi.deleteConversation(currentSessionId); } catch (e) { console.warn('deleteConversation:', e); }
        }
        set({ messages: [], sessionId: generateSessionId(), unreadCount: 0, lastAdminReplyAt: null });
      },
      removeLastMessages: (count) =>
        set((state) => ({
          messages: state.messages.slice(0, Math.max(0, state.messages.length - count)),
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
    } as ChatState & ChatActions),
    {
      name: 'ush-chat-storage',
      partialize: (state) => ({
        sessionId: state.sessionId,
        isDarkMode: state.isDarkMode,
        hasEverOpened: state.hasEverOpened,
        lastAdminReplyAt: state.lastAdminReplyAt,
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
