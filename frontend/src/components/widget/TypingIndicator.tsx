import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <motion.div
      className="mb-4 flex items-start gap-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      {/* Avatar */}
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ush-400 to-ush-600 text-[10px] font-bold text-white">
        IA
      </div>

      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-gray-800 px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-ush-400"
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
    </motion.div>
  );
}
