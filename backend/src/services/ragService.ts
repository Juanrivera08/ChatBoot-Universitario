import { ChromaClient, Collection } from 'chromadb';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { query } from '../config/database';
import { COLLECTION_NAME } from '../config/chroma';
import { openai } from '../config/openai';

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '500');
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '50');
const TOP_K = parseInt(process.env.TOP_K || '5');
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
// Modelo de embeddings de OpenAI (1536 dimensiones). NOTA: cambiar de modelo de
// embeddings invalida la colección de Chroma existente — hay que re-indexar todo.
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

class RAGService {
  private chromaClient: ChromaClient;
  private collection: Collection | null = null;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.chromaClient = new ChromaClient({ path: CHROMA_URL });
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    });
  }

  // Elimina y recrea la colección de Chroma desde cero. Necesario al cambiar el
  // modelo de embeddings (la dimensión de los vectores cambia y los antiguos son
  // incompatibles). Tras llamarla hay que re-indexar todos los documentos.
  async resetCollection(): Promise<void> {
    try {
      await this.chromaClient.deleteCollection({ name: COLLECTION_NAME });
      logger.info(`Colección "${COLLECTION_NAME}" eliminada.`);
    } catch {
      logger.info(`La colección "${COLLECTION_NAME}" no existía (se creará nueva).`);
    }
    this.collection = null;
    await this.getCollection();
  }

  private async getCollection(): Promise<Collection> {
    if (!this.collection) {
      this.collection = await this.chromaClient.getOrCreateCollection({
        name: COLLECTION_NAME,
        metadata: {
          description: 'Documentos institucionales USH',
          'hnsw:space': 'cosine', // distancia coseno — mejor para búsqueda semántica
        },
      });
    }
    return this.collection;
  }

  // Genera embeddings con reintentos automáticos ante rate limit (429).
  // OpenAI acepta un solo texto o un lote de textos en la misma petición.
  private async embedInputs(inputs: string[], attempt = 1): Promise<number[][]> {
    try {
      const result = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
      // La API mantiene el orden de entrada, pero ordenamos por index por seguridad
      return result.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    } catch (error: any) {
      const status = error?.status ?? error?.code ?? error?.response?.status ?? 0;
      const message = error?.message ?? '';
      const isRateLimit =
        status === 429 ||
        message.includes('429') ||
        message.toLowerCase().includes('too many requests') ||
        message.toLowerCase().includes('rate limit');

      if (isRateLimit && attempt <= 5) {
        const waitMs = Math.min(Math.pow(2, attempt) * 1000, 32000); // cap en 32s
        logger.warn(`Rate limit alcanzado. Reintentando en ${waitMs / 1000}s (intento ${attempt}/5)...`);
        await new Promise((r) => setTimeout(r, waitMs));
        return this.embedInputs(inputs, attempt + 1);
      }
      throw error;
    }
  }

  // Embedding de un solo texto (usado en la recuperación RAG por consulta)
  private async embedText(text: string): Promise<number[]> {
    const [embedding] = await this.embedInputs([text]);
    return embedding;
  }

  // Genera embeddings en lotes — OpenAI permite hasta ~2048 entradas por petición.
  // Usamos lotes de 100 para mantener cada petición dentro de límites razonables.
  private async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    const BATCH_SIZE = 100;

    logger.info(`Generando ${texts.length} embeddings con OpenAI (${EMBEDDING_MODEL})...`);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const slice = texts.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = await this.embedInputs(slice);
      embeddings.push(...batchEmbeddings);
      logger.info(`Embeddings: ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length} completados...`);
    }
    return embeddings;
  }

  async indexDocument(
    documentId: string,
    text: string,
    metadata: Record<string, any>
  ): Promise<number> {
    const collection = await this.getCollection();

    // Dividir texto en chunks
    const langchainDocs = await this.textSplitter.createDocuments([text]);

    if (langchainDocs.length === 0) return 0;

    const chunks: string[] = langchainDocs.map((d) => d.pageContent);
    const ids: string[] = [];
    const metadatas: Record<string, string | number | boolean>[] = [];

    for (let i = 0; i < chunks.length; i++) {
      ids.push(`${documentId}_chunk_${i}_${uuidv4()}`);
      // Solo valores primitivos — ChromaDB no acepta null/undefined/objetos
      const cleanMeta: Record<string, string | number | boolean> = {
        document_id: String(documentId),
        chunk_index: i,
      };
      for (const [k, v] of Object.entries(metadata)) {
        if (v !== null && v !== undefined && typeof v !== 'object') {
          cleanMeta[k] = v;
        }
      }
      metadatas.push(cleanMeta);
    }

    logger.info(`Generando embeddings para ${chunks.length} chunks del documento ${documentId}...`);

    // Generar embeddings con OpenAI
    const embeddingVectors = await this.embedBatch(chunks);

    // Insertar en ChromaDB en lotes de 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      await collection.add({
        ids: ids.slice(i, i + BATCH_SIZE),
        embeddings: embeddingVectors.slice(i, i + BATCH_SIZE),
        documents: chunks.slice(i, i + BATCH_SIZE),
        metadatas: metadatas.slice(i, i + BATCH_SIZE),
      });
    }

    // Guardar referencia en PostgreSQL
    for (let i = 0; i < chunks.length; i++) {
      await query(
        `INSERT INTO document_chunks (document_id, chroma_id, chunk_index, content, token_count)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (chroma_id) DO NOTHING`,
        [documentId, ids[i], i, chunks[i], Math.ceil(chunks[i].length / 4)]
      );
    }

    logger.info(`Documento ${documentId} indexado con ${chunks.length} chunks`);
    return chunks.length;
  }

  async retrieveContext(queryText: string): Promise<
    Array<{ content: string; metadata: Record<string, any>; distance: number }>
  > {
    const collection = await this.getCollection();
    const queryEmbedding = await this.embedText(queryText);

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: TOP_K,
      include: ['documents', 'metadatas', 'distances'] as any,
    });

    const items: Array<{ content: string; metadata: Record<string, any>; distance: number }> = [];

    if (results.documents?.[0]) {
      for (let i = 0; i < results.documents[0].length; i++) {
        const doc = results.documents[0][i];
        const meta = results.metadatas?.[0]?.[i] || {};
        const dist = results.distances?.[0]?.[i] ?? 1;
        if (doc) {
          items.push({ content: doc, metadata: meta, distance: dist });
        }
      }
    }

    logger.debug(`RAG: ${items.length} fragmentos recuperados`);
    return items;
  }

  async deleteDocument(documentId: string): Promise<void> {
    const collection = await this.getCollection();
    const { rows } = await query<{ chroma_id: string }>(
      'SELECT chroma_id FROM document_chunks WHERE document_id = $1',
      [documentId]
    );
    if (rows.length > 0) {
      await collection.delete({ ids: rows.map((r) => r.chroma_id) });
      await query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
    }
  }

  async getStats(): Promise<{ totalChunks: number; collectionName: string }> {
    const collection = await this.getCollection();
    const count = await collection.count();
    return { totalChunks: count, collectionName: COLLECTION_NAME };
  }
}

export const ragService = new RAGService();
