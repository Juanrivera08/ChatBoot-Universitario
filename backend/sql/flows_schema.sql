-- ============================================================
-- ESQUEMA: FLUJOS GUIADOS
-- ============================================================

-- Flujos disponibles (configurados por el admin)
CREATE TABLE IF NOT EXISTS flows (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  trigger_keywords    TEXT[]  NOT NULL DEFAULT '{}',
  completion_message  TEXT    NOT NULL DEFAULT '¡Tu solicitud fue registrada exitosamente!',
  notification_email  VARCHAR(255),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Pasos de cada flujo
CREATE TABLE IF NOT EXISTS flow_steps (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id          UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  step_order       INTEGER NOT NULL,
  field_name       VARCHAR(100) NOT NULL,
  question         TEXT NOT NULL,
  field_type       VARCHAR(50) NOT NULL DEFAULT 'text',
  -- tipos: text | email | phone | number | select | confirmation
  options          JSONB NOT NULL DEFAULT '[]',
  -- para select: [{"label": "Física", "value": "fisica"}, ...]
  validation_regex VARCHAR(255),
  error_message    TEXT DEFAULT 'Por favor ingresa un valor válido.',
  is_required      BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_steps_flow_id ON flow_steps(flow_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_steps_order ON flow_steps(flow_id, step_order);

-- Sesión activa de un usuario en un flujo
CREATE TABLE IF NOT EXISTS flow_sessions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id     VARCHAR(255) NOT NULL,
  flow_id        UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  current_step   INTEGER NOT NULL DEFAULT 0,
  collected_data JSONB NOT NULL DEFAULT '{}',
  status         VARCHAR(50) NOT NULL DEFAULT 'active',
  -- active | completed | abandoned
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_sessions_session ON flow_sessions(session_id, status);

-- Solicitudes completadas (radicados)
CREATE TABLE IF NOT EXISTS flow_submissions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  radicado   VARCHAR(30) UNIQUE NOT NULL,
  flow_id    UUID NOT NULL REFERENCES flows(id),
  flow_name  VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',
  status     VARCHAR(50) NOT NULL DEFAULT 'pendiente',
  -- pendiente | en_proceso | completado | rechazado
  notes      TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON flow_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON flow_submissions(created_at DESC);

-- Trigger updated_at
CREATE TRIGGER update_flows_updated_at
  BEFORE UPDATE ON flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flow_sessions_updated_at
  BEFORE UPDATE ON flow_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flow_submissions_updated_at
  BEFORE UPDATE ON flow_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FLUJOS DE EJEMPLO PARA LA USH
-- ============================================================
INSERT INTO flows (name, description, trigger_keywords, completion_message, notification_email) VALUES
(
  'Solicitud de Certificado de Notas',
  'El estudiante solicita un certificado de notas o calificaciones',
  ARRAY['certificado', 'certificado de notas', 'notas', 'calificaciones', 'constancia de notas'],
  'Tu solicitud de certificado de notas fue radicada exitosamente. Te contactaremos al correo indicado en un plazo de 3 días hábiles.',
  'registro@ush.edu.co'
),
(
  'Solicitud de Paz y Salvo',
  'El estudiante solicita un paz y salvo institucional',
  ARRAY['paz y salvo', 'paz y salvo institucional', 'paz salvo'],
  'Tu solicitud de paz y salvo fue radicada. El documento estará disponible en 5 días hábiles.',
  'registro@ush.edu.co'
),
(
  'Reporte de Problema Técnico',
  'El estudiante reporta un problema con plataformas digitales de la universidad',
  ARRAY['problema técnico', 'no funciona', 'error sistema', 'problema plataforma', 'bug', 'soporte técnico'],
  'Tu reporte fue registrado. El equipo de soporte te contactará en menos de 24 horas.',
  'soporte@ush.edu.co'
),
(
  'Solicitud de Información sobre Programas',
  'Persona interesada solicita información de programas académicos',
  ARRAY['quiero estudiar', 'información programa', 'inscripción', 'admisiones', 'cómo inscribirme'],
  'Gracias por tu interés en la USH. Un asesor académico te contactará pronto con información detallada.',
  'admisiones@ush.edu.co'
)
ON CONFLICT DO NOTHING;

-- Pasos: Certificado de Notas
WITH flow AS (SELECT id FROM flows WHERE name = 'Solicitud de Certificado de Notas' LIMIT 1)
INSERT INTO flow_steps (flow_id, step_order, field_name, question, field_type, validation_regex, error_message) VALUES
((SELECT id FROM flow), 1, 'codigo_estudiantil', '¿Cuál es tu **código estudiantil**?', 'text', '^\d{6,12}$', 'El código debe tener entre 6 y 12 dígitos.'),
((SELECT id FROM flow), 2, 'nombre_completo', '¿Cuál es tu **nombre completo**?', 'text', NULL, NULL),
((SELECT id FROM flow), 3, 'correo', '¿A qué **correo electrónico** enviamos la notificación?', 'email', NULL, 'Ingresa un correo válido.'),
((SELECT id FROM flow), 4, 'tipo_certificado', '¿Qué tipo de certificado necesitas?', 'select', NULL, NULL),
((SELECT id FROM flow), 5, 'confirmacion', '¿Confirmas que los datos son correctos y deseas radicar la solicitud?', 'confirmation', NULL, NULL)
ON CONFLICT DO NOTHING;

-- Opciones para tipo_certificado
UPDATE flow_steps SET options = '[
  {"label": "Certificado de notas del período actual", "value": "periodo_actual"},
  {"label": "Certificado de notas histórico", "value": "historico"},
  {"label": "Constancia de matrícula con notas", "value": "constancia_matricula"}
]'::jsonb
WHERE field_name = 'tipo_certificado'
AND flow_id = (SELECT id FROM flows WHERE name = 'Solicitud de Certificado de Notas' LIMIT 1);

-- Pasos: Paz y Salvo
WITH flow AS (SELECT id FROM flows WHERE name = 'Solicitud de Paz y Salvo' LIMIT 1)
INSERT INTO flow_steps (flow_id, step_order, field_name, question, field_type, validation_regex) VALUES
((SELECT id FROM flow), 1, 'codigo_estudiantil', '¿Cuál es tu **código estudiantil**?', 'text', '^\d{6,12}$'),
((SELECT id FROM flow), 2, 'nombre_completo', '¿Cuál es tu **nombre completo**?', 'text', NULL),
((SELECT id FROM flow), 3, 'correo', '¿A qué **correo** enviamos el paz y salvo cuando esté listo?', 'email', NULL),
((SELECT id FROM flow), 4, 'motivo', '¿Para qué necesitas el paz y salvo?', 'select', NULL),
((SELECT id FROM flow), 5, 'confirmacion', '¿Confirmas radicar la solicitud con estos datos?', 'confirmation', NULL)
ON CONFLICT DO NOTHING;

UPDATE flow_steps SET options = '[
  {"label": "Grado", "value": "grado"},
  {"label": "Retiro voluntario", "value": "retiro"},
  {"label": "Transferencia externa", "value": "transferencia"},
  {"label": "Trámite administrativo", "value": "administrativo"}
]'::jsonb
WHERE field_name = 'motivo'
AND flow_id = (SELECT id FROM flows WHERE name = 'Solicitud de Paz y Salvo' LIMIT 1);

-- Pasos: Reporte Técnico
WITH flow AS (SELECT id FROM flows WHERE name = 'Reporte de Problema Técnico' LIMIT 1)
INSERT INTO flow_steps (flow_id, step_order, field_name, question, field_type) VALUES
((SELECT id FROM flow), 1, 'nombre', '¿Cuál es tu **nombre**?', 'text'),
((SELECT id FROM flow), 2, 'correo', '¿Tu **correo institucional**?', 'email'),
((SELECT id FROM flow), 3, 'plataforma', '¿En qué plataforma ocurre el problema?', 'select'),
((SELECT id FROM flow), 4, 'descripcion', 'Describe el problema con el mayor detalle posible:', 'text'),
((SELECT id FROM flow), 5, 'confirmacion', '¿Enviar el reporte?', 'confirmation')
ON CONFLICT DO NOTHING;

UPDATE flow_steps SET options = '[
  {"label": "Campus Virtual / Moodle", "value": "moodle"},
  {"label": "Portal Estudiantil", "value": "portal"},
  {"label": "Correo institucional", "value": "correo"},
  {"label": "Biblioteca Virtual", "value": "biblioteca"},
  {"label": "Otra plataforma", "value": "otra"}
]'::jsonb
WHERE field_name = 'plataforma'
AND flow_id = (SELECT id FROM flows WHERE name = 'Reporte de Problema Técnico' LIMIT 1);

-- Pasos: Info Programas
WITH flow AS (SELECT id FROM flows WHERE name = 'Solicitud de Información sobre Programas' LIMIT 1)
INSERT INTO flow_steps (flow_id, step_order, field_name, question, field_type) VALUES
((SELECT id FROM flow), 1, 'nombre', '¿Cuál es tu **nombre completo**?', 'text'),
((SELECT id FROM flow), 2, 'correo', '¿Tu **correo electrónico**?', 'email'),
((SELECT id FROM flow), 3, 'telefono', '¿Tu **número de celular**?', 'phone'),
((SELECT id FROM flow), 4, 'programa_interes', '¿Qué programa te interesa?', 'select'),
((SELECT id FROM flow), 5, 'confirmacion', '¿Enviar tu solicitud de información?', 'confirmation')
ON CONFLICT DO NOTHING;

UPDATE flow_steps SET options = '[
  {"label": "Ingeniería de Sistemas", "value": "ingenieria_sistemas"},
  {"label": "Contaduría Pública", "value": "contaduria"},
  {"label": "Administración de Empresas", "value": "administracion"},
  {"label": "Psicología", "value": "psicologia"},
  {"label": "Derecho", "value": "derecho"},
  {"label": "Otro programa", "value": "otro"}
]'::jsonb
WHERE field_name = 'programa_interes'
AND flow_id = (SELECT id FROM flows WHERE name = 'Solicitud de Información sobre Programas' LIMIT 1);
