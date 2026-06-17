import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { adminApi } from '../../api/chatApi';
import type { FAQ } from '../../types';

export default function FAQManager() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ question: '', answer: '', category: 'general' });
  const [isSaving, setIsSaving] = useState(false);

  const load = () =>
    adminApi.getFAQs().then(({ data }) => setFaqs(data.faqs));

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await adminApi.createFAQ(form);
      setForm({ question: '', answer: '', category: 'general' });
      setShowForm(false);
      load();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta FAQ?')) return;
    await adminApi.deleteFAQ(id);
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Preguntas Frecuentes</h1>
          <p className="text-sm text-gray-500">Gestiona las respuestas predefinidas del chatbot</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-ush-600 px-4 py-2 text-sm font-medium text-white hover:bg-ush-500"
        >
          <Plus className="h-4 w-4" /> Nueva FAQ
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            onSubmit={handleCreate}
            className="rounded-xl border border-white/10 bg-gray-900 p-6"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <h2 className="mb-4 text-sm font-semibold text-white">Nueva Pregunta Frecuente</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-gray-400">Pregunta *</label>
                <input
                  type="text"
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  required
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500"
                  placeholder="¿Cuáles son las fechas de matrícula?"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Respuesta *</label>
                <textarea
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                  required
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500"
                  placeholder="La matrícula para el período 2024-2 se realizará del 15 al 30 de julio..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Categoría</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500"
                  placeholder="matrícula, bienestar, programas..."
                />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 rounded-lg bg-ush-600 px-4 py-2 text-sm font-medium text-white hover:bg-ush-500 disabled:opacity-60"
              >
                {isSaving ? 'Guardando...' : 'Guardar FAQ'}
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

      {faqs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <HelpCircle className="h-12 w-12 text-gray-700" />
          <p className="text-gray-500">No hay FAQs creadas aún.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {faqs.map((faq) => (
            <div key={faq.id} className="overflow-hidden rounded-xl border border-white/10 bg-gray-900">
              <button
                onClick={() => setExpanded(expanded === faq.id ? null : faq.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02]"
              >
                <HelpCircle className="h-4 w-4 shrink-0 text-ush-400" />
                <p className="flex-1 text-sm font-medium text-white">{faq.question}</p>
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-500">
                  {faq.category}
                </span>
                {expanded === faq.id
                  ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
                  : <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(faq.id); }}
                  className="ml-1 rounded p-1 text-gray-600 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </button>
              {expanded === faq.id && (
                <div className="border-t border-white/5 px-5 py-4">
                  <p className="text-sm text-gray-400 whitespace-pre-wrap">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
