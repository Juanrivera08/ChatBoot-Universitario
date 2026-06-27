-- ============================================================
-- MIGRACIÓN: Gemini → OpenAI (GPT)
-- ============================================================
-- El schema.sql solo inserta la config por defecto en instalaciones nuevas
-- (ON CONFLICT DO NOTHING). En una base de datos YA existente, el valor del
-- modelo sigue siendo 'gemini-2.5-flash', así que hay que actualizarlo a mano.
--
-- Ejecutar una sola vez contra la base de datos de producción, por ejemplo:
--   psql "$DATABASE_URL" -f sql/migrate_to_openai.sql
-- ============================================================

UPDATE ai_config
SET value = 'gpt-4o-mini',
    description = 'Modelo de OpenAI (GPT) a utilizar',
    updated_at = NOW()
WHERE key = 'model';
