import rateLimit from 'express-rate-limit';

// X-Forwarded-For lo gestiona app.set('trust proxy', 1) en index.ts — no se repite aquí
const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

// Global: protege rutas públicas — admin usa JWT propio, no necesita este límite
export const globalRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Demasiadas peticiones, intenta más tarde.' },
});

// Chat: 60 mensajes por minuto por IP (incluye el polling /chat/poll cada 3s)
export const chatRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Estás enviando mensajes muy rápido, espera un momento.' },
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
