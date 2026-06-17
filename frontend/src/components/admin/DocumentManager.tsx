import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, RefreshCw, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { documentApi } from '../../api/chatApi';
import type { Document } from '../../types';

const CATEGORIES = [
  { value: 'reglamento', label: 'Reglamento' },
  { value: 'calendario', label: 'Calendario Académico' },
  { value: 'programas', label: 'Programas Académicos' },
  { value: 'bienestar', label: 'Bienestar Universitario' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'faq', label: 'Preguntas Frecuentes' },
  { value: 'otro', label: 'Otro' },
];

function IndexBadge({ isIndexed }: { isIndexed: boolean }) {
  if (isIndexed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
        <CheckCircle className="h-3 w-3" /> Indexado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
      <Clock className="h-3 w-3" /> Procesando...
    </span>
  );
}

export default function DocumentManager() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: '', category: 'reglamento', description: '', file: null as File | null,
  });

  const load = () => {
    documentApi.getAll().then(({ data }) => {
      setDocuments(data.documents);
      setIsLoading(false);
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.file || !form.title) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append('file', form.file);
    fd.append('title', form.title);
    fd.append('category', form.category);
    fd.append('description', form.description);
    try {
      await documentApi.upload(fd);
      setForm({ title: '', category: 'reglamento', description: '', file: null });
      setShowForm(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error subiendo el documento');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`¿Eliminar "${title}"? Esta acción no se puede deshacer.`)) return;
    await documentApi.delete(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleReindex = async (id: string) => {
    await documentApi.reindex(id);
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, is_indexed: false } : d))
    );
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Documentos</h1>
          <p className="text-sm text-gray-500">Gestiona los documentos institucionales para el RAG</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-ush-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-ush-500"
        >
          <Upload className="h-4 w-4" />
          Subir PDF
        </button>
      </div>

      {/* Formulario de subida */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            onSubmit={handleUpload}
            className="rounded-xl border border-white/10 bg-gray-900 p-6"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <h2 className="mb-4 text-sm font-semibold text-white">Nuevo Documento</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">Título *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500"
                  placeholder="Reglamento Estudiantil 2024"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Categoría</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-gray-400">Descripción (opcional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500"
                  placeholder="Breve descripción del documento"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-gray-400">Archivo PDF *</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                  required
                  className="w-full cursor-pointer rounded-lg border border-dashed border-white/20 bg-gray-800 px-3 py-4 text-sm text-gray-400 file:mr-3 file:rounded file:border-0 file:bg-ush-600 file:px-3 file:py-1 file:text-xs file:text-white"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={isUploading}
                className="flex items-center gap-2 rounded-lg bg-ush-600 px-4 py-2 text-sm font-medium text-white hover:bg-ush-500 disabled:opacity-60"
              >
                {isUploading ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Subiendo...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Subir y procesar</>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Lista de documentos */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-ush-500 border-t-transparent" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileText className="h-12 w-12 text-gray-700" />
          <p className="text-gray-500">No hay documentos. Sube el primer PDF para comenzar.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-gray-900/50">
                {['Documento', 'Categoría', 'Estado', 'Tamaño', 'Chunks', 'Acciones'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-gray-900">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-ush-400" />
                      <div>
                        <p className="font-medium text-white">{doc.title}</p>
                        <p className="text-xs text-gray-600">{doc.filename}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ush-900/50 px-2 py-0.5 text-xs text-ush-300">
                      {doc.category}
                    </span>
                  </td>
                  <td className="px-4 py-3"><IndexBadge isIndexed={doc.is_indexed} /></td>
                  <td className="px-4 py-3 text-gray-500">{formatSize(doc.file_size)}</td>
                  <td className="px-4 py-3 text-gray-500">{doc.chunk_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReindex(doc.id)}
                        className="rounded p-1 text-gray-500 hover:text-ush-400"
                        title="Re-indexar"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id, doc.title)}
                        className="rounded p-1 text-gray-500 hover:text-red-400"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
