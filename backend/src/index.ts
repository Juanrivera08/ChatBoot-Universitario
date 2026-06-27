// Debe ser el primer import — carga .env antes de que cualquier módulo lea process.env
import 'dotenv/config';

import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { globalRateLimit } from './middleware/rateLimit';
import chatRoutes from './routes/chat';
import documentRoutes from './routes/documents';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import flowRoutes from './routes/flows';
import whatsappRoutes from './routes/whatsapp';
import { testDatabaseConnection, pool } from './config/database';
import { logger } from './utils/logger';

// Validar variables de entorno críticas antes de arrancar
const REQUIRED_ENV_VARS = [
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'DB_HOST',
  'DB_PASSWORD',
];
const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[ERROR] Variables de entorno faltantes: ${missing.join(', ')}`);
  console.error('Verifica tu archivo .env y vuelve a intentar.');
  process.exit(1);
}

// Advertir (no bloquear) sobre vars opcionales recomendadas en producción
if (process.env.NODE_ENV === 'production') {
  const recommended = ['ALLOWED_ORIGINS', 'CHROMA_URL', 'WHATSAPP_APP_SECRET'];
  const missingRec = recommended.filter((v) => !process.env[v]);
  if (missingRec.length > 0) {
    console.warn(`[WARN] Variables recomendadas no configuradas: ${missingRec.join(', ')}`);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Seguridad HTTP headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

// Respetar X-Forwarded-For de proxies confiables
app.set('trust proxy', 1);

// CORS — el widget es público (origin: true); el panel admin usa ALLOWED_ORIGINS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Peticiones sin origin (curl, Postman, same-origin) siempre OK
    if (!origin) return callback(null, true);
    // Si no hay lista configurada o el origin está en ella, permitir
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origen no permitido — ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Parseo de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging HTTP — morgan registra método, URL, status y tiempo; es suficiente
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// Ruta de salud
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'USH ChatBot API' });
});

// Servir el widget JS compilado — permite embeber en WordPress con una sola URL
// Archivo generado por: npm run build:widget (en el directorio frontend/)
const widgetDir = path.join(process.cwd(), '..', 'frontend', 'dist-widget');
app.use('/widget', express.static(widgetDir, {
  maxAge: '7d',        // cachear el bundle 7 días en el navegador
  immutable: true,
}));

// Rutas — globalRateLimit solo en rutas públicas; admin/flows usan autenticación JWT
app.use('/api/auth', authRoutes);
app.use('/api/chat', globalRateLimit, chatRoutes);
app.use('/api/documents', globalRateLimit, documentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Manejo de rutas no encontradas
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejo global de errores
app.use(errorHandler);

let server: ReturnType<typeof app.listen>;

async function bootstrap() {
  try {
    await testDatabaseConnection();
    logger.info('Conexión a PostgreSQL establecida');

    server = app.listen(PORT, () => {
      logger.info(`Servidor USH ChatBot corriendo en puerto ${PORT}`);
      logger.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Error iniciando el servidor:', error);
    process.exit(1);
  }
}

// Graceful shutdown — cierra conexiones limpiamente ante señales del sistema
async function shutdown(signal: string) {
  logger.info(`Señal ${signal} recibida. Cerrando servidor...`);
  const forceExit = setTimeout(() => {
    logger.error('Shutdown forzado por timeout (10s)');
    process.exit(1);
  }, 10_000);
  forceExit.unref(); // No bloquea el event loop ni interfiere con el exit normal

  server?.close(async () => {
    clearTimeout(forceExit);
    await pool.end();
    logger.info('Servidor cerrado correctamente.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap();

export default app;
