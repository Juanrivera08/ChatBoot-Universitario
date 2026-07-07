import axios from 'axios';
import type { FlowState, LiveConversation, ReportFilters, ReportPreview, ReportQueryType } from '../types';
import { useAuthStore } from '../store/authStore';

// El panel admin usa VITE_API_URL (var de entorno en build) o la ruta relativa '/api'.
// El widget embebido en WordPress usa window.USHChatConfig.apiUrl inyectado antes del script.
declare global {
  interface Window {
    USHChatConfig?: { apiUrl?: string };
  }
}

const API_URL =
  (typeof window !== 'undefined' && window.USHChatConfig?.apiUrl) ||
  import.meta.env.VITE_API_URL ||
  '/api';

// Resultado que devuelve el evento "done" del stream
export interface StreamDonePayload {
  sessionId: string;
  messageId: string;
  sources: Array<{ title: string; category: string; relevance: number }>;
  processingTime: number;
  flowState?: FlowState & { message?: string };
  humanPending?: boolean;
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor para adjuntar token JWT en rutas admin
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Interceptor de respuesta: si el token expiró, limpiar y redirigir al login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      useAuthStore.getState().logout();
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

export const chatApi = {
  sendMessage: (message: string, sessionId?: string) =>
    api.post('/chat/message', { message, sessionId }),

  getHistory: (sessionId: string) =>
    api.get(`/chat/history/${sessionId}`),

  submitFeedback: (sessionId: string, rating: number) =>
    api.post(`/chat/feedback/${sessionId}`, { rating }),

  deleteConversation: (sessionId: string) =>
    api.delete(`/chat/conversation/${sessionId}`),

  pollPendingReply: (sessionId: string, since?: string) =>
    api.get<{
      pending: boolean;
      humanMode: boolean;
      adminTyping: boolean;
      replies: Array<{ id: string; content: string; created_at: string }>;
    }>(
      `/chat/poll/${sessionId}`,
      since ? { params: { since } } : undefined
    ),

  // Streaming via fetch nativo (axios no soporta ReadableStream)
  sendMessageStream: async (
    message: string,
    sessionId: string | undefined,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<StreamDonePayload> => {
    const token = localStorage.getItem('ush_admin_token');
    // En dev, conecta directo al backend para evitar que el proxy de Vite bufferice el SSE.
    // En prod, usa la ruta relativa que nginx proxea.
    const streamBase = import.meta.env.DEV
      ? 'http://localhost:3001/api'
      : API_URL;
    const response = await fetch(`${streamBase}/chat/message/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, sessionId }),
      signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let donePayload: StreamDonePayload | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          const evt = JSON.parse(raw);
          if (evt.type === 'chunk') onChunk(evt.content);
          else if (evt.type === 'done') donePayload = evt;
          else if (evt.type === 'error') throw new Error(evt.message);
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!donePayload) throw new Error('El stream terminó sin evento done');
    return donePayload;
  },
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  me: () => api.get('/auth/me'),
};

export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getCharts: () => api.get('/admin/charts'),
  getConversations: (page = 1) => api.get(`/admin/conversations?page=${page}`),
  getConversationMessages: (id: string) => api.get(`/admin/conversations/${id}/messages`),

  getFAQs: () => api.get('/admin/faqs'),
  createFAQ: (data: { question: string; answer: string; category: string }) =>
    api.post('/admin/faqs', data),
  deleteFAQ: (id: string) => api.delete(`/admin/faqs/${id}`),

  getAIConfig: () => api.get('/admin/ai-config'),
  updateAIConfig: (key: string, value: string) =>
    api.put('/admin/ai-config', { key, value }),

  getLiveConversations: () =>
    api.get<{ conversations: LiveConversation[] }>('/admin/live'),
  toggleTakeover: (id: string, enabled: boolean) =>
    api.put(`/admin/conversations/${id}/takeover`, { enabled }),
  adminReply: (id: string, content: string) =>
    api.post(`/admin/conversations/${id}/reply`, { content }),
  adminTyping: (id: string, typing: boolean) =>
    api.post(`/admin/conversations/${id}/typing`, { typing }),

  // ---- Reportes ----
  getReportQueryTypes: () =>
    api.get<{ queryTypes: ReportQueryType[] }>('/admin/reports/query-types'),
  getReportPreview: (filters: ReportFilters) =>
    api.get<ReportPreview>('/admin/reports/preview', { params: cleanReportParams(filters) }),
  // Descargas: responseType blob para recibir el archivo binario con el JWT adjunto.
  exportReport: (format: 'pdf' | 'excel', filters: ReportFilters) =>
    api.get(`/admin/reports/export/${format}`, {
      params: cleanReportParams(filters),
      responseType: 'blob',
    }),
};

// Elimina filtros vacíos y normaliza includeTranscript a '1'/undefined.
function cleanReportParams(filters: ReportFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.queryType) params.queryType = filters.queryType;
  if (filters.includeTranscript) params.includeTranscript = '1';
  return params;
}

export const documentApi = {
  getAll: (category?: string) =>
    api.get('/documents', { params: { category } }),

  upload: (formData: FormData) =>
    api.post('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id: string) => api.delete(`/documents/${id}`),
  reindex: (id: string) => api.post(`/documents/${id}/reindex`),
};

export const flowApi = {
  getAll: () => api.get('/flows'),
  getOne: (id: string) => api.get(`/flows/${id}`),
  create: (data: any) => api.post('/flows', data),
  addStep: (flowId: string, step: any) => api.post(`/flows/${flowId}/steps`, step),
  delete: (id: string) => api.delete(`/flows/${id}`),
  toggle: (id: string, isActive: boolean) => api.patch(`/flows/${id}/toggle`, { isActive }),
  getSubmissions: (page = 1, status?: string) =>
    api.get('/flows/submissions', { params: { page, status } }),
  updateSubmission: (id: string, status: string, notes: string) =>
    api.patch(`/flows/submissions/${id}`, { status, notes }),
};

export default api;
