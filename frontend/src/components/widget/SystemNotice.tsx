import { memo } from 'react';
import { motion } from 'framer-motion';
import type { Message } from '../../types';

interface Props {
  message: Message;
}

/**
 * Aviso del sistema (no es del usuario ni de la IA): se usa para informar al
 * usuario de cambios de estado de la conversación, como la transferencia a un
 * asesor humano o el regreso a la IA. Estilo deliberadamente distinto al de las
 * burbujas de chat: centrado, con fondo translúcido, borde resaltado e ícono.
 */
function SystemNotice({ message }: Props) {
  return (
    <motion.div
      className="my-4 flex justify-center"
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
    >
      <div className="flex max-w-[90%] items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-center text-xs font-medium leading-relaxed text-emerald-700 shadow-sm shadow-emerald-900/20 dark:border-emerald-400/30 dark:text-emerald-200">
        <span className="whitespace-pre-wrap break-words">{message.content}</span>
      </div>
    </motion.div>
  );
}

export default memo(SystemNotice);
