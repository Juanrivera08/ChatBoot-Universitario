import { motion } from 'framer-motion';
import { UserRound } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

export default function TypingIndicator() {
  // En modo humano los puntos representan al asesor que va a responder, no a la IA.
  const humanMode = useChatStore((s) => s.humanMode);

  return (
    <motion.div
      className="mb-4 flex items-start gap-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      {/* Avatar — "IA" o ícono de asesor según quién esté atendiendo */}
      <div
        className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white ${
          humanMode ? 'from-emerald-400 to-emerald-600' : 'from-ush-400 to-ush-600'
        }`}
      >
        {humanMode ? <UserRound className="h-3.5 w-3.5" /> : 'IA'}
      </div>

      <div className="flex flex-col gap-1">
        {humanMode && (
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">El asesor está escribiendo…</span>
        )}
        <div
          className={`flex items-center gap-1.5 rounded-2xl rounded-tl-sm px-4 py-3.5 ${
            humanMode
              ? 'border border-emerald-500/30 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-950/40'
              : 'bg-gray-100 dark:bg-gray-800'
          }`}
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className={`h-2 w-2 rounded-full ${humanMode ? 'bg-emerald-400' : 'bg-ush-400'}`}
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
