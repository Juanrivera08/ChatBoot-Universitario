import { AnimatePresence, motion } from 'framer-motion';
import { UserRound } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

/**
 * Indicador permanente en la parte superior del widget mientras la conversación
 * está en modo manual (atendida por un asesor humano). Reacciona directamente al
 * estado global `humanMode`: aparece al tomar el control y desaparece solo al
 * volver a la IA. No mantiene estado propio.
 */
export default function HumanModeBanner() {
  const humanMode = useChatStore((s) => s.humanMode);

  return (
    <AnimatePresence initial={false}>
      {humanMode && (
        <motion.div
          key="human-mode-banner"
          className="flex items-center justify-center gap-2 overflow-hidden border-b border-emerald-400/30 bg-emerald-500/15 px-4 text-emerald-100"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1, paddingTop: 8, paddingBottom: 8 }}
          exit={{ height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold">Atendido por un asesor de la universidad</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
