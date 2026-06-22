import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Star, ChevronDown, ChevronUp, UserCheck, Bot, Send } from 'lucide-react';
import { adminApi } from '../../api/chatApi';
import type { Conversation } from '../../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens_used: number;
  created_at: string;
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-gray-600">Sin valorar</span>;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-700'}`}
        />
      ))}
    </span>
  );
}

export default function ConversationViewer() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const liveRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchConversations = () =>
    adminApi.getConversations().then(({ data }) => setConversations(data.conversations));

  useEffect(() => {
    fetchConversations().finally(() => setIsLoading(false));
  }, []);

  // Auto-refresh mensajes y lista cada 3s cuando hay conversación expandida en human_mode
  useEffect(() => {
    const expandedConv = conversations.find((c) => c.id === expanded);
    if (expanded && expandedConv?.human_mode) {
      liveRefreshRef.current = setInterval(async () => {
        const { data } = await adminApi.getConversationMessages(expanded);
        setMessages((prev) => ({ ...prev, [expanded]: data.messages }));
        await fetchConversations();
      }, 3000);
    } else {
      if (liveRefreshRef.current) {
        clearInterval(liveRefreshRef.current);
        liveRefreshRef.current = null;
      }
    }
    return () => {
      if (liveRefreshRef.current) {
        clearInterval(liveRefreshRef.current);
        liveRefreshRef.current = null;
      }
    };
  }, [expanded, conversations]);

  const toggleConversation = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!messages[id]) {
      const { data } = await adminApi.getConversationMessages(id);
      setMessages((prev) => ({ ...prev, [id]: data.messages }));
    }
  };

  const handleToggleTakeover = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingId(conv.id);
    try {
      await adminApi.toggleTakeover(conv.id, !conv.human_mode);
      await fetchConversations();
      // Si tomamos control, expandir la conversación automáticamente
      if (!conv.human_mode && expanded !== conv.id) {
        setExpanded(conv.id);
        if (!messages[conv.id]) {
          const { data } = await adminApi.getConversationMessages(conv.id);
          setMessages((prev) => ({ ...prev, [conv.id]: data.messages }));
        }
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleSendReply = async (convId: string) => {
    const text = replyText[convId]?.trim();
    if (!text || sendingReply === convId) return;
    setSendingReply(convId);
    try {
      await adminApi.adminReply(convId, text);
      setReplyText((prev) => ({ ...prev, [convId]: '' }));
      const { data } = await adminApi.getConversationMessages(convId);
      setMessages((prev) => ({ ...prev, [convId]: data.messages }));
      // Scroll al final
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } finally {
      setSendingReply(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  const liveCount = conversations.filter((c) => c.human_mode).length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Conversaciones</h1>
        <p className="text-sm text-gray-500">Historial de interacciones con el chatbot</p>
      </div>

      {/* Banner de conversaciones activas en modo humano */}
      {liveCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-900/20 px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <p className="text-sm font-medium text-emerald-300">
            {liveCount} conversación{liveCount > 1 ? 'es' : ''} activa{liveCount > 1 ? 's' : ''} — estás respondiendo como agente
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-ush-500 border-t-transparent" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <MessageSquare className="h-12 w-12 text-gray-700" />
          <p className="text-gray-500">Aún no hay conversaciones registradas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`overflow-hidden rounded-xl border bg-gray-900 transition-colors ${
                conv.human_mode
                  ? 'border-emerald-500/40'
                  : 'border-white/10'
              }`}
            >
              <button
                onClick={() => toggleConversation(conv.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ush-900">
                  {conv.human_mode ? (
                    <UserCheck className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-ush-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      Sesión {conv.session_id.slice(0, 8)}...
                    </p>
                    {conv.human_mode && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 uppercase tracking-wide">
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatDate(conv.started_at)} · {conv.message_count || 0} mensajes
                  </p>
                </div>
                <StarRating rating={conv.feedback} />

                {/* Botón Tomar Control / Devolver a IA */}
                <button
                  onClick={(e) => handleToggleTakeover(conv, e)}
                  disabled={togglingId === conv.id}
                  className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50 ${
                    conv.human_mode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 border border-emerald-600/30'
                  }`}
                >
                  {conv.human_mode ? (
                    <><Bot className="h-3.5 w-3.5" /> Devolver a IA</>
                  ) : (
                    <><UserCheck className="h-3.5 w-3.5" /> Tomar Control</>
                  )}
                </button>

                {expanded === conv.id ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                )}
              </button>

              {expanded === conv.id && (
                <div className="border-t border-white/5">
                  {/* Lista de mensajes */}
                  <div className="px-5 pt-4">
                    {!messages[conv.id] ? (
                      <div className="flex justify-center py-4">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-ush-500 border-t-transparent" />
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto pb-2">
                        {messages[conv.id].map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                                msg.role === 'user'
                                  ? 'bg-ush-600/40 text-white'
                                  : 'bg-gray-800 text-gray-200'
                              }`}
                            >
                              <p className="text-[10px] font-medium mb-1 opacity-60">
                                {msg.role === 'user' ? 'Usuario' : conv.human_mode ? 'Tú (Admin)' : 'Asistente IA'}
                                {msg.tokens_used > 0 && ` · ${msg.tokens_used} tokens`}
                              </p>
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Input de respuesta — solo visible cuando el admin tomó control */}
                  {conv.human_mode && (
                    <div className="border-t border-white/5 px-5 py-3">
                      <p className="mb-2 text-[11px] font-medium text-emerald-400 uppercase tracking-wide">
                        Responder como agente
                      </p>
                      <div className="flex gap-2">
                        <textarea
                          value={replyText[conv.id] ?? ''}
                          onChange={(e) =>
                            setReplyText((prev) => ({ ...prev, [conv.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendReply(conv.id);
                            }
                          }}
                          placeholder="Escribe tu respuesta... (Enter para enviar)"
                          rows={2}
                          className="flex-1 resize-none rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                        />
                        <button
                          onClick={() => handleSendReply(conv.id)}
                          disabled={!replyText[conv.id]?.trim() || sendingReply === conv.id}
                          className="flex h-full items-center gap-1.5 self-stretch rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                        >
                          {sendingReply === conv.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
