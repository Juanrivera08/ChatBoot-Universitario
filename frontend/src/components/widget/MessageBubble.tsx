import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, UserRound } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Message } from '../../types';
import FlowCard from './FlowCard';

interface Props {
  message: Message;
  onOptionSelect?: (value: string) => void;
}

function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageBubble({ message, onOptionSelect }: Props) {
  const isUser = message.role === 'user';
  const isHuman = !isUser && message.fromHuman === true;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      className={`mb-4 flex ${isUser ? 'justify-end' : 'justify-start'}`}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className={`flex max-w-[85%] gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar — "IA" para la inteligencia artificial, ícono de asesor para un humano */}
        {!isUser && (
          <div
            className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white ${
              isHuman ? 'from-emerald-400 to-emerald-600' : 'from-ush-400 to-ush-600'
            }`}
          >
            {isHuman ? <UserRound className="h-3.5 w-3.5" /> : 'IA'}
          </div>
        )}

        <div className="flex flex-col gap-1">
          {/* Etiqueta de autor cuando responde un asesor humano */}
          {isHuman && (
            <span className="text-[10px] font-semibold text-emerald-300">Asesor de la universidad</span>
          )}
          {/* Burbuja con botón de copiar al hover */}
          <div className="group relative">
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                isUser
                  ? 'rounded-tr-sm bg-gradient-to-br from-ush-500 to-ush-600 text-white'
                  : isHuman
                    ? 'rounded-tl-sm border border-emerald-400/30 bg-emerald-950/40 text-gray-100'
                    : 'rounded-tl-sm bg-gray-800 text-gray-100'
              }`}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              ) : (
                <>
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="text-gray-200">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                      code: ({ children }) => (
                        <code className="rounded bg-gray-700 px-1.5 py-0.5 font-mono text-xs text-ush-300">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {/* Cursor parpadeante mientras el mensaje se está generando */}
                  {message.isStreaming && (
                    <motion.span
                      className="inline-block h-4 w-0.5 translate-y-0.5 rounded-full bg-ush-400 ml-0.5"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                </>
              )}
            </div>

            {/* Botón copiar — aparece al hacer hover */}
            <button
              onClick={handleCopy}
              className={`absolute top-2 rounded-md p-1 opacity-0 transition-all group-hover:opacity-100 ${
                isUser ? '-left-7' : '-right-7'
              } ${copied ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
              title={copied ? '¡Copiado!' : 'Copiar mensaje'}
              aria-label="Copiar mensaje"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Componente de flujo guiado */}
          {!isUser && message.flowState && onOptionSelect && (
            <FlowCard flowState={message.flowState} onOptionSelect={onOptionSelect} />
          )}

          {/* Timestamp */}
          <span className={`text-[10px] text-gray-500 ${isUser ? 'text-right' : ''}`}>
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// React.memo evita re-renderizar burbujas que no cambiaron cuando llega un nuevo mensaje
export default memo(MessageBubble);
