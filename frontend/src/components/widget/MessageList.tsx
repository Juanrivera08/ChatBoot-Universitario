import { useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { Message } from '../../types';
import MessageBubble from './MessageBubble';
import SystemNotice from './SystemNotice';
import TypingIndicator from './TypingIndicator';

interface Props {
  messages: Message[];
  isTyping: boolean;
  onOptionSelect: (value: string) => void;
  lastFailedMessage: string | null;
  onRetry: () => void;
}

export default function MessageList({
  messages,
  isTyping,
  onOptionSelect,
  lastFailedMessage,
  onRetry,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const prevCountRef = useRef(messages.length);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const newMessageAdded = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;

    if (newMessageAdded) {
      // Mensaje nuevo (usuario o asistente): baja siempre
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowScrollBtn(false);
    } else {
      // Actualización de contenido (streaming): solo baja si ya estaba cerca del fondo
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (isNearBottom) {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, isTyping]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!isNearBottom);
  };

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBtn(false);
  };

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scroll-smooth px-4 py-4 [scrollbar-width:thin] [scrollbar-color:theme(colors.gray.700)_transparent]"
      >
        <AnimatePresence initial={false}>
          {messages.map((message) =>
            message.role === 'system' ? (
              <SystemNotice key={message.id} message={message} />
            ) : (
              <MessageBubble key={message.id} message={message} onOptionSelect={onOptionSelect} />
            )
          )}
        </AnimatePresence>

        {/* Botón de reintentar si hubo error */}
        {lastFailedMessage && (
          <motion.div
            className="mt-2 flex justify-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-900/20 px-4 py-1.5 text-xs text-red-400 transition-all hover:bg-red-900/40 hover:text-red-300"
            >
              ↩ Reintentar envío
            </button>
          </motion.div>
        )}

        {isTyping && <TypingIndicator />}
        <div ref={endRef} />
      </div>

      {/* Botón "ir al final" cuando el usuario subió en el historial */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-ush-700/90 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur-sm hover:bg-ush-600 transition-colors"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Ir al final
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
