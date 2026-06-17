import { useEffect, useState } from 'react';
import { MessageSquare, Star, ChevronDown, ChevronUp } from 'lucide-react';
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

  useEffect(() => {
    adminApi.getConversations()
      .then(({ data }) => setConversations(data.conversations))
      .finally(() => setIsLoading(false));
  }, []);

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

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Conversaciones</h1>
        <p className="text-sm text-gray-500">Historial de interacciones con el chatbot</p>
      </div>

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
            <div key={conv.id} className="overflow-hidden rounded-xl border border-white/10 bg-gray-900">
              <button
                onClick={() => toggleConversation(conv.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ush-900">
                  <MessageSquare className="h-4 w-4 text-ush-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    Sesión {conv.session_id.slice(0, 8)}...
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(conv.started_at)} · {conv.message_count || 0} mensajes
                  </p>
                </div>
                <StarRating rating={conv.feedback} />
                {expanded === conv.id ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                )}
              </button>

              {expanded === conv.id && (
                <div className="border-t border-white/5 px-5 py-4">
                  {!messages[conv.id] ? (
                    <div className="flex justify-center py-4">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-ush-500 border-t-transparent" />
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
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
                              {msg.role === 'user' ? 'Usuario' : 'Asistente IA'}
                              {msg.tokens_used > 0 && ` · ${msg.tokens_used} tokens`}
                            </p>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))}
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
