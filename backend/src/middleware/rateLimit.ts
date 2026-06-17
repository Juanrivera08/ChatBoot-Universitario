import rateLimit from 'express-rate-limit';

// X-Forwarded-For lo gestiona app.set('trust proxy', 1) en index.ts — no se repite aquí
const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
};

// Global: 200 peticiones por 15 minutos por IP
export const globalRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas peticiones, intenta más tarde.' },
});

// Chat: 30 mensajes por minuto por IP
export const chatRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Estás enviando mensajes muy rápido, espera un momento.' },
});

// Carga de documentos: 50 subidas por hora (anteriormente 10, muy restrictivo para admins)
export const uploadRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Límite de subida de documentos alcanzado.' },
});

// Autenticación: 5 intentos por 15 minutos
export const authRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados intentos de inicio de sesión.' },
});
