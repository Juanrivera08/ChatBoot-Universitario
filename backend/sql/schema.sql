-- ============================================================
-- ESQUEMA DE BASE DE DATOS — CHATBOT USH
-- Institución Universitaria Salazar y Herrera
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TABLA: users (administradores del sistema)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  full_name   VARCHAR(255) NOT NULL,
  role        VARCHAR(50) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  last_login  TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: conversations (sesiones de chat de usuarios)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_agent  TEXT,
  ip_address  VARCHAR(45),
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  feedback    INTEGER CHECK (feedback BETWEEN 1 AND 5),
  metadata    JSONB DEFAULT '{}',
  started_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON conversations(started_at DESC);

-- ============================================================
-- TABLA: messages (mensajes individuales del chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  tokens_used     INTEGER DEFAULT 0,
  model_used      VARCHAR(100),
  sources         JSONB DEFAULT '[]',
  processing_time INTEGER DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- ============================================================
-- TABLA: documents (documentos institucionales)
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(255) NOT NULL,
  filename        VARCHAR(255) NOT NULL,
  file_path       TEXT NOT NULL,
  file_size       INTEGER NOT NULL DEFAULT 0,
  mime_type       VARCHAR(100) DEFAULT 'application/pdf',
  category        VARCHAR(100) NOT NULL DEFAULT 'otro'
                  CHECK (category IN ('reglamento','calendario','programas','bienestar','administrativo','faq','otro')),
  description     TEXT,
  chunk_count     INTEGER DEFAULT 0,
  is_indexed      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  indexed_at      TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_is_active ON documents(is_active);

-- ============================================================
-- TABLA: document_chunks (fragmentos de documentos para RAG)
-- ============================================================
CREATE TABLE IF NOT EXISTS document_chunks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chroma_id      VARCHAR(255) UNIQUE NOT NULL,
  chunk_index    INTEGER NOT NULL,
  content        TEXT NOT NULL,
  token_count    INTEGER DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);

-- ============================================================
-- TABLA: faqs (preguntas frecuentes gestionadas manualmente)
-- ============================================================
CREATE TABLE IF NOT EXISTS faqs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  category    VARCHAR(100) DEFAULT 'general',
  tags        TEXT[] DEFAULT '{}',
  view_count  INTEGER DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faqs_is_active ON faqs(is_active);
CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category);
CREATE INDEX IF NOT EXISTS idx_faqs_question_gin ON faqs USING gin(to_tsvector('spanish', question));

-- ============================================================
-- TABLA: system_logs (logs de eventos del sistema)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level        VARCHAR(20) NOT NULL CHECK (level IN ('info','warn','error','debug')),
  event        VARCHAR(255) NOT NULL,
  message      TEXT,
  metadata     JSONB DEFAULT '{}',
  ip_address   VARCHAR(45),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON system_logs(created_at DESC);

-- ============================================================
-- TABLA: ai_config (configuración dinámica de la IA)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key             VARCHAR(100) UNIQUE NOT NULL,
  value           TEXT NOT NULL,
  description     TEXT,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Configuración inicial por defecto
INSERT INTO ai_config (key, value, description) VALUES
  ('model', 'gemini-2.5-flash', 'Modelo de Gemini a utilizar'),
  ('temperature', '0.3', 'Temperatura de respuestas (0-1)'),
  ('max_tokens', '1000', 'Máximo de tokens por respuesta'),
  ('system_prompt', 'Eres el asistente virtual oficial de la Institución Universitaria Salazar y Herrera (USH). Tu función es ayudar a estudiantes, docentes y personas interesadas con información académica y administrativa precisa. Responde siempre en español, de forma amable, clara y profesional. Solo proporciona información que esté respaldada por los documentos institucionales. Si no encuentras información relevante, indica amablemente que la persona debe contactar directamente a la institución.', 'Prompt del sistema para la IA'),
  ('chunk_size', '500', 'Tamaño de chunks para procesamiento de documentos'),
  ('chunk_overlap', '50', 'Solapamiento entre chunks'),
  ('top_k', '5', 'Número de documentos a recuperar en RAG')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_faqs_updated_at
  BEFORE UPDATE ON faqs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VISTA: estadísticas del sistema
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM conversations) AS total_conversations,
  (SELECT COUNT(*) FROM conversations WHERE started_at >= NOW() - INTERVAL '24 hours') AS conversations_today,
  (SELECT COUNT(*) FROM messages WHERE role = 'user') AS total_user_messages,
  (SELECT COUNT(*) FROM messages WHERE role = 'user' AND created_at >= NOW() - INTERVAL '24 hours') AS messages_today,
  (SELECT COUNT(*) FROM documents WHERE is_active = true) AS active_documents,
  (SELECT COUNT(*) FROM documents WHERE is_indexed = true) AS indexed_documents,
  (SELECT ROUND(AVG(feedback), 2) FROM conversations WHERE feedback IS NOT NULL) AS avg_satisfaction,
  (SELECT SUM(tokens_used) FROM messages) AS total_tokens_used;
