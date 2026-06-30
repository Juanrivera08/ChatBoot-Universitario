import { KeyboardEvent, useRef, useState, useCallback } from 'react';
import { Send, Mic, Square, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (text?: string) => void;
  isDisabled: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function MessageInput({ value, onChange, onSend, isDisabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [micError, setMicError] = useState('');

  const mediaSupported = !!(navigator.mediaDevices?.getUserMedia);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecordingSeconds(0);
  }, []);

  const startRecording = useCallback(async () => {
    setMicError('');
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      const msg =
        err.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado. Habilítalo en el candado 🔒 de la barra del navegador.'
          : 'No se pudo acceder al micrófono.';
      setMicError(msg);
      return;
    }

    // Elegir el mejor formato disponible
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/ogg';

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size < 1000) return; // ignorar grabaciones vacías

      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append('audio', blob, `audio.${mimeType.includes('webm') ? 'webm' : 'ogg'}`);
        const { data } = await axios.post(`${API_URL}/chat/transcribe`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 20000,
        });
        if (data.text) {
          onChange((value ? value + ' ' : '') + data.text);
          // Auto-resize el textarea
          setTimeout(() => {
            const el = textareaRef.current;
            if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; }
          }, 50);
        }
      } catch {
        setMicError('No se pudo transcribir. Intenta de nuevo.');
      } finally {
        setIsTranscribing(false);
      }
    };

    recorder.start(250); // chunks cada 250ms
    mediaRecorderRef.current = recorder;
    setIsRecording(true);

    // Contador de segundos
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
  }, [value, onChange]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isRecording) stopRecording();
      onSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const formatSeconds = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="border-t border-white/10 bg-gray-900 px-3 py-3">

      {/* Barra de grabación activa */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            className="mb-2 flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {/* Ondas */}
            <div className="flex shrink-0 items-center gap-[3px]">
              {[1, 2.2, 1.6, 2.8, 1.2].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-[3px] rounded-full bg-red-400"
                  style={{ height: 16 }}
                  animate={{ scaleY: [0.3, h, 0.3] }}
                  transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
                />
              ))}
            </div>
            <span className="flex-1 text-xs font-medium text-red-300">Grabando…</span>
            <span className="font-mono text-xs tabular-nums text-red-400">
              {formatSeconds(recordingSeconds)}
            </span>
            <span className="text-[10px] text-red-400/50">toca ■ para parar</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Estado transcribiendo */}
      <AnimatePresence>
        {isTranscribing && (
          <motion.div
            className="mb-2 flex items-center gap-2 rounded-lg border border-ush-500/25 bg-ush-900/30 px-3 py-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ush-400" />
            <span className="text-xs text-ush-300">Transcribiendo…</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {micError && (
          <motion.p
            className="mb-2 text-center text-xs text-red-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMicError('')}
          >
            {micError} <span className="opacity-50">(toca para cerrar)</span>
          </motion.p>
        )}
      </AnimatePresence>

      {/* Caja de input */}
      <div className={`flex items-end gap-2 rounded-xl border bg-gray-800 px-3 py-2 transition-all ${
        isRecording
          ? 'border-red-500/50 shadow-[0_0_14px_rgba(239,68,68,0.15)]'
          : 'border-white/10 focus-within:border-ush-500/60'
      }`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          disabled={isDisabled || isTranscribing}
          placeholder={
            isRecording ? 'Grabando audio…'
            : isTranscribing ? 'Transcribiendo…'
            : 'Escribe o usa el micrófono…'
          }
          rows={1}
          className="max-h-[120px] flex-1 resize-none overflow-y-auto bg-transparent text-sm text-white placeholder-gray-500 outline-none disabled:opacity-50"
          style={{ scrollbarWidth: 'none' }}
        />

        {/* Botón micrófono */}
        {mediaSupported && (
          <motion.button
            onClick={toggleRecording}
            disabled={isDisabled || isTranscribing}
            className={`mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
            whileTap={{ scale: 0.88 }}
            title={isRecording ? 'Detener grabación' : 'Grabar audio'}
          >
            {isRecording ? <Square className="h-3.5 w-3.5 fill-white" /> : <Mic className="h-4 w-4" />}
          </motion.button>
        )}

        {/* Botón enviar */}
        <motion.button
          onClick={() => { if (isRecording) stopRecording(); onSend(); }}
          disabled={isDisabled || isTranscribing || !value.trim()}
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ush-600 text-white transition-colors hover:bg-ush-500 disabled:cursor-not-allowed disabled:opacity-40"
          whileTap={{ scale: 0.88 }}
          aria-label="Enviar"
        >
          {isDisabled
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />
          }
        </motion.button>
      </div>

      <p className="mt-2 text-center text-[10px] text-gray-600">
        SYHbot
      </p>
    </div>
  );
}
