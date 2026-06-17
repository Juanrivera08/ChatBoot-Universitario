import { useState } from 'react';
import { Minus, Trash2, Moon, Sun } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

export default function ChatHeader() {
  const { closeChat, deleteConversation, toggleDarkMode, isDarkMode } = useChatStore();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = () => setConfirming(true);

  const handleConfirm = async () => {
    setDeleting(true);
    await deleteConversation();
    setDeleting(false);
    setConfirming(false);
  };

  return (
    <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-ush-800 to-ush-900 px-4 py-3">
      {/* Avatar */}
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ush-400 to-ush-600">
        <span className="text-sm font-bold text-white">IA</span>
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-gray-900 bg-emerald-400" />
      </div>

      {/* Información */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">Asistente de Servicios Digitales</p>
        <p className="text-xs text-ush-300">Institución Universitaria Salazar y Herrera</p>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-1">
        {confirming ? (
          <div className="flex items-center gap-1 rounded-lg bg-red-900/60 px-2 py-1">
            <span className="text-xs text-red-200">¿Eliminar?</span>
            <button
              onClick={handleConfirm}
              disabled={deleting}
              className="rounded px-1.5 py-0.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors"
            >
              {deleting ? '...' : 'Sí'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded px-1.5 py-0.5 text-xs font-semibold text-ush-300 hover:text-white transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={toggleDarkMode}
              className="rounded-lg p-1.5 text-ush-300 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Cambiar tema"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={handleDeleteClick}
              className="rounded-lg p-1.5 text-ush-300 transition-colors hover:bg-red-500/20 hover:text-red-400"
              aria-label="Eliminar conversación"
              title="Eliminar conversación"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={closeChat}
              className="rounded-lg p-1.5 text-ush-300 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Minimizar"
            >
              <Minus className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
