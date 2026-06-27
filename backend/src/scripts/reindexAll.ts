import 'dotenv/config';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import { pool, query } from '../config/database';
import { ragService } from '../services/ragService';
import { logger } from '../utils/logger';

/**
 * Re-indexa TODOS los documentos institucionales con el nuevo modelo de embeddings.
 *
 * Necesario tras migrar de Gemini a OpenAI: los vectores antiguos (3072 dims de
 * Gemini) son incompatibles con los nuevos (1536 dims de text-embedding-3-small),
 * así que recreamos la colección de Chroma desde cero y volvemos a embeber todo.
 *
 * Ejecutar (desde backend/):
 *   npm run build && node dist/scripts/reindexAll.js
 *   — o en desarrollo —
 *   npx ts-node --require dotenv/config src/scripts/reindexAll.ts
 */
async function main() {
  const { rows } = await query<{
    id: string;
    title: string;
    category: string;
    filename: string;
    file_path: string;
  }>('SELECT id, title, category, filename, file_path FROM documents ORDER BY created_at');

  logger.info(`Encontrados ${rows.length} documentos para re-indexar.`);

  // 1) Recrear la colección de Chroma desde cero (borra los vectores de Gemini)
  await ragService.resetCollection();

  // 2) Limpiar las referencias de chunks antiguos en PostgreSQL
  await query('TRUNCATE document_chunks');
  await query('UPDATE documents SET is_indexed = false, chunk_count = 0, indexed_at = NULL');

  let ok = 0;
  let fail = 0;

  for (const doc of rows) {
    if (!fs.existsSync(doc.file_path)) {
      logger.warn(`✗ "${doc.title}": no se encontró el archivo en ${doc.file_path} (se omite).`);
      fail++;
      continue;
    }

    try {
      const buffer = fs.readFileSync(doc.file_path);
      const pdfData = await pdfParse(buffer);

      if (!pdfData.text.trim()) {
        logger.warn(`✗ "${doc.title}": el PDF no tiene texto extraíble (se omite).`);
        fail++;
        continue;
      }

      const chunkCount = await ragService.indexDocument(doc.id, pdfData.text, {
        title: doc.title,
        category: doc.category,
        filename: doc.filename,
      });

      await query(
        'UPDATE documents SET is_indexed = true, chunk_count = $1, indexed_at = NOW() WHERE id = $2',
        [chunkCount, doc.id]
      );

      logger.info(`✓ "${doc.title}" re-indexado (${chunkCount} chunks).`);
      ok++;
    } catch (error) {
      logger.error(`✗ "${doc.title}": error al re-indexar:`, error);
      fail++;
    }
  }

  logger.info(`Re-indexación terminada. OK: ${ok} | Fallidos/omitidos: ${fail}`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  logger.error('Error fatal en la re-indexación:', error);
  process.exit(1);
});
