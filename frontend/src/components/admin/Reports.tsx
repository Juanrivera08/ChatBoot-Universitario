import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FileBarChart, FileSpreadsheet, FileText, Filter, RefreshCw,
  MessageSquare, Clock, Star, UserCheck, Hash,
} from 'lucide-react';
import { adminApi } from '../../api/chatApi';
import type { ReportFilters, ReportPreview, ReportQueryType, ReportRow } from '../../types';

// Fecha YYYY-MM-DD para los <input type="date"> (rango por defecto: últimos 30 días)
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const today = new Date();
const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

const STATUS_STYLES: Record<ReportRow['status'], string> = {
  'En atención humana': 'bg-emerald-500/15 text-emerald-300',
  Resuelta: 'bg-ush-500/15 text-ush-300',
  Activa: 'bg-amber-500/15 text-amber-300',
  Inactiva: 'bg-gray-500/15 text-gray-400',
};

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}
function SummaryCard({ label, value, icon: Icon, color }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <div className={`rounded-lg p-1.5 ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function Reports() {
  const [queryTypes, setQueryTypes] = useState<ReportQueryType[]>([]);
  const [filters, setFilters] = useState<ReportFilters>({
    from: isoDate(monthAgo),
    to: isoDate(today),
    queryType: '',
    includeTranscript: false,
  });
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloading, setDownloading] = useState<'pdf' | 'excel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getReportQueryTypes()
      .then(({ data }) => setQueryTypes(data.queryTypes))
      .catch(() => {});
  }, []);

  const loadPreview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await adminApi.getReportPreview(filters);
      setPreview(data);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'No se pudo generar la vista previa.');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // Vista previa inicial al montar (con el rango por defecto)
  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (format: 'pdf' | 'excel') => {
    setDownloading(format);
    setError(null);
    try {
      const res = await adminApi.exportReport(format, filters);
      const disposition = res.headers['content-disposition'] as string | undefined;
      const match = disposition?.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `informe_conversaciones.${format === 'pdf' ? 'pdf' : 'xlsx'}`;

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo descargar el archivo. Inténtalo de nuevo.');
    } finally {
      setDownloading(null);
    }
  };

  const update = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const s = preview?.summary;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ush-600/20">
          <FileBarChart className="h-5 w-5 text-ush-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">Reportes</h1>
          <p className="text-sm text-gray-500">Genera y descarga informes de conversaciones en PDF o Excel</p>
        </div>
      </div>

      {/* Panel de filtros */}
      <div className="rounded-xl border border-white/10 bg-gray-900 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-ush-400" />
          <h2 className="text-sm font-medium text-white">Filtros del informe</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Desde</label>
            <input
              type="date"
              value={filters.from}
              max={filters.to}
              onChange={(e) => update({ from: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500/50 focus:ring-1 focus:ring-ush-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Hasta</label>
            <input
              type="date"
              value={filters.to}
              min={filters.from}
              onChange={(e) => update({ to: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500/50 focus:ring-1 focus:ring-ush-500/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Tipo de consulta</label>
            <select
              value={filters.queryType}
              onChange={(e) => update({ queryType: e.target.value })}
              className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-ush-500/50 focus:ring-1 focus:ring-ush-500/20"
            >
              <option value="">Todos los tipos</option>
              {queryTypes.map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadPreview}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ush-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ush-500 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Aplicar filtros
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={filters.includeTranscript}
              onChange={(e) => update({ includeTranscript: e.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-gray-800 text-ush-600 focus:ring-ush-500/30"
            />
            Incluir transcripción completa en la descarga
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => handleDownload('excel')}
              disabled={downloading !== null || isLoading}
              className="flex items-center gap-2 rounded-lg bg-emerald-600/20 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-600/40 disabled:opacity-50"
            >
              {downloading === 'excel'
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                : <FileSpreadsheet className="h-4 w-4" />}
              Descargar Excel
            </button>
            <button
              onClick={() => handleDownload('pdf')}
              disabled={downloading !== null || isLoading}
              className="flex items-center gap-2 rounded-lg bg-red-600/20 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-600/40 disabled:opacity-50"
            >
              {downloading === 'pdf'
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-transparent" />
                : <FileText className="h-4 w-4" />}
              Descargar PDF
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Resumen */}
      {s && (
        <motion.div
          className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <SummaryCard label="Conversaciones" value={s.totalConversations} icon={MessageSquare} color="bg-ush-600" />
          <SummaryCard label="Mensajes" value={s.totalMessages} icon={Hash} color="bg-blue-600" />
          <SummaryCard label="Prom. msj/conv." value={s.avgMessagesPerConversation} icon={MessageSquare} color="bg-cyan-600" />
          <SummaryCard label="Duración prom." value={s.avgDurationLabel} icon={Clock} color="bg-amber-600" />
          <SummaryCard label="Satisfacción" value={s.avgSatisfaction != null ? `${s.avgSatisfaction}/5` : 'N/D'} icon={Star} color="bg-violet-600" />
          <SummaryCard label="Atención humana" value={s.humanHandledConversations} icon={UserCheck} color="bg-emerald-600" />
        </motion.div>
      )}

      {/* Tabla de vista previa */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-gray-900">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-medium text-white">Vista previa</h2>
          {preview && (
            <span className="text-xs text-gray-500">
              {preview.rows.length} conversación{preview.rows.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-ush-500 border-t-transparent" />
          </div>
        ) : !preview || preview.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FileBarChart className="h-12 w-12 text-gray-700" />
            <p className="text-gray-500">No hay conversaciones para los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Inicio</th>
                  <th className="px-4 py-3 font-medium">Duración</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 text-center font-medium">Msj</th>
                  <th className="px-4 py-3 text-center font-medium">Satisf.</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Resumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {preview.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-gray-300">{r.user}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(r.startedAt).toLocaleString('es-CO', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{r.durationLabel}</td>
                    <td className="px-4 py-3 text-gray-300">{r.queryTypeLabel}</td>
                    <td className="px-4 py-3 text-center text-gray-300">{r.messageCount}</td>
                    <td className="px-4 py-3 text-center">
                      {r.satisfaction != null
                        ? <span className="text-amber-400">{r.satisfaction}/5</span>
                        : <span className="text-gray-600">N/D</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-gray-400">
                      <span className="line-clamp-2">{r.summary}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
