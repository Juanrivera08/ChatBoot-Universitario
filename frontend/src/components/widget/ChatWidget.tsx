import { AnimatePresence } from 'framer-motion';
import { useChatStore } from '../../store/chatStore';
import { useChatPolling } from '../../hooks/useChatPolling';
import ChatButton from './ChatButton';
import ChatWindow from './ChatWindow';

export default function ChatWidget() {
  const { isOpen, isDarkMode } = useChatStore();

  // Polling del modo humano: vive aquí (siempre montado) para recibir mensajes
  // del admin en tiempo real incluso con el widget cerrado.
  useChatPolling();

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="fixed bottom-0 right-0 z-[9999] flex flex-col items-end gap-4 p-4 sm:p-6">
        <AnimatePresence mode="sync">
          {isOpen && <ChatWindow key="chat-window" />}
        </AnimatePresence>
        <ChatButton />
      </div>
    </div>
  );
}
