import rateLimit from 'express-rate-limit';

// X-Forwarded-For lo gestiona app.set('trust proxy', 1) en index.ts — no se repite aquí
const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

// Global: protege rutas públicas — admin usa JWT propio, no necesita este límite.
// Excluye el polling del modo humano (/chat/poll): es de alta frecuencia (cada 1.5s)
// y tiene su propio límite, así no agota el presupuesto compartido con los mensajes.
export const globalRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) => req.originalUrl.includes('/chat/poll'),
  message: { error: 'Demasiadas peticiones, intenta más tarde.' },
});

// Chat: 60 mensajes por minuto por IP (solo envío de mensajes; el polling va aparte)
export const chatRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Estás enviando mensajes muy rápido, espera un momento.' },
});

// Polling del modo humano (/chat/poll): el widget consulta el estado cada 1.5s
// (~40/min por pestaña). Es una sola query indexada y muy barata, así que damos un
// límite propio y holgado que tolera varias pestañas/recargas sin bloquear el chat.
export const pollRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas consultas de estado, espera un momento.' },
});

// Carga de documentos: 50 subidas por hora
export const uploadRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Límite de subida de documentos alcanzado.' },
});

// Autenticación: 20 intentos por 15 minutos
export const authRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de inicio de sesión.' },
});
