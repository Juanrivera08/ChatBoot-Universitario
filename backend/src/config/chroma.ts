import { ChromaClient } from 'chromadb';
import { logger } from '../utils/logger';

const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
export const COLLECTION_NAME = 'ush_documentos';

export const chromaClient = new ChromaClient({ path: CHROMA_URL });

export async function getOrCreateCollection() {
  try {
    const collection = await chromaClient.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { description: 'Documentos institucionales USH' },
    });
    return collection;
  } catch (error) {
    logger.error('Error conectando a ChromaDB:', error);
    throw error;
  }
}
