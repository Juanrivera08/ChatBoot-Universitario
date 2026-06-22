import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { query } from '../config/database';
import { ragService } from './ragService';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface DocumentRecord {
  id: string;
  title: string;
  filename: string;
  file_path: string;
  file_size: number;
  category: string;
  description: string | null;
  chunk_count: number;
  is_indexed: boolean;
  is_active: boolean;
  created_at: Date;
}

class DocumentService {
  async uploadAndIndex(
    file: Express.Multer.File,
    title: string,
    category: string,
    description: string,
    uploadedBy: string
  ): Promise<DocumentRecord> {
    // Extraer texto del PDF
    let extractedText = '';
    try {
      const pdfBuffer = fs.readFileSync(file.path);
      const pdfData = await pdfParse(pdfBuffer);
      extractedText = pdfData.text;
    } catch (error) {
      fs.unlinkSync(file.path);
      throw new AppError('No se pudo procesar el PDF. Asegúrate de que el archivo no esté dañado.', 422);
    }

    if (!extractedText.trim()) {
      fs.unlinkSync(file.path);
      throw new AppError('El PDF no contiene texto extraíble (puede ser un PDF escaneado).', 422);
    }

    // Guardar registro en PostgreSQL
    const { rows } = await query<DocumentRecord>(
      `INSERT INTO documents (title, filename, file_path, file_size, mime_type, category, description, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        title,
        file.originalname,
        file.path,
        file.size,
        file.mimetype,
        category,
        description || null,
        uploadedBy,
      ]
    );

    const document = rows[0];

    // Indexar en ChromaDB de forma asíncrona
    this.indexDocumentAsync(document.id, extractedText, {
      title,
      category,
      filename: file.originalname,
    });

    return document;
  }

  private async indexDocumentAsync(
    documentId: string,
    text: string,
    metadata: Record<string, string>
  ): Promise<void> {
    try {
      const chunkCount = await ragService.indexDocument(documentId, text, metadata);
      await query(
        `UPDATE documents SET is_indexed = true, chunk_count = $1, indexed_at = NOW() WHERE id = $2`,
        [chunkCount, documentId]
      );
      logger.info(`Documento ${documentId} indexado exitosamente con ${chunkCount} chunks`);
    } catch (error) {
      logger.error(`Error indexando documento ${documentId}:`, error);
      await query(
        `UPDATE documents SET is_indexed = false WHERE id = $1`,
        [documentId]
      );
    }
  }

  async getAll(category?: string): Promise<DocumentRecord[]> {
    let sql = `SELECT d.*, u.full_name as uploaded_by_name
               FROM documents d
               LEFT JOIN users u ON d.uploaded_by = u.id
               WHERE d.is_active = true`;
    const params: any[] = [];
    if (category) {
      sql += ` AND d.category = $1`;
      params.push(category);
    }
    sql += ` ORDER BY d.created_at DESC`;
    const { rows } = await query<DocumentRecord>(sql, params);
    return rows;
  }

  async getById(id: string): Promise<DocumentRecord> {
    const { rows } = await query<DocumentRecord>(
      'SELECT * FROM documents WHERE id = $1 AND is_active = true',
      [id]
    );
    if (!rows[0]) throw new AppError('Documento no encontrado', 404);
    return rows[0];
  }

  async delete(id: string): Promise<void> {
    const doc = await this.getById(id);
    // Eliminar de ChromaDB
    await ragService.deleteDocument(id);
    // Eliminar archivo físico
    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }
    // Marcar como inactivo en PostgreSQL
    await query('UPDATE documents SET is_active = false WHERE id = $1', [id]);
    logger.info(`Documento ${id} eliminado`);
  }

  async reindex(id: string): Promise<void> {
    const doc = await this.getById(id);
    if (!fs.existsSync(doc.file_path)) {
      throw new AppError('El archivo físico del documento no existe en el servidor.', 404);
    }
    let pdfData;
    try {
      const pdfBuffer = fs.readFileSync(doc.file_path);
      pdfData = await pdfParse(pdfBuffer);
    } catch {
      throw new AppError('No se pudo leer el PDF para reindexar.', 422);
    }
    await ragService.deleteDocument(id);
    this.indexDocumentAsync(id, pdfData.text, {
      title: doc.title,
      category: doc.category,
      filename: doc.filename,
    });
  }
}

export const documentService = new DocumentService();
