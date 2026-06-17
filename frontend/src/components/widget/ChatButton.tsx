import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

export default function ChatButton() {
  const { isOpen, toggleChat, unreadCount, hasEverOpened } = useChatStore();

  // Muestra badge numérico si hay mensajes no leídos,
  // o un punto de "primer acceso" si el usuario nunca ha abierto el chat
  const showNumericBadge = !isOpen && unreadCount > 0;
  const showFirstVisitDot = !isOpen && !hasEverOpened;

  return (
    <motion.button
      onClick={toggleChat}
      className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-ush-500 to-ush-700 text-white shadow-2xl shadow-ush-500/40 transition-all hover:from-ush-400 hover:to-ush-600 focus:outline-none focus:ring-4 focus:ring-ush-400/50"
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      aria-label={isOpen ? 'Cerrar asistente' : 'Abrir Asistente de Servicios Digitales'}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.5 }}
    >
      {/* Pulso animado cuando está cerrado */}
      {!isOpen && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full bg-ush-500"
            animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute inset-0 rounded-full bg-ush-400"
            animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />
        </>
      )}

      <motion.div
        animate={{ rotate: isOpen ? 90 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        {isOpen ? (
          <X className="h-6 w-6" strokeWidth={2.5} />
        ) : (
          <MessageSquare className="h-6 w-6" strokeWidth={2} />
        )}
      </motion.div>

      {/* Badge con conteo de mensajes no leídos */}
      <AnimatePresence>
        {showNumericBadge && (
          <motion.span
            key="unread-badge"
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}

        {/* Punto verde para primer visitante */}
        {!showNumericBadge && showFirstVisitDot && (
          <motion.span
            key="first-visit-dot"
            className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 shadow"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ delay: 1, type: 'spring', stiffness: 400, damping: 20 }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}
