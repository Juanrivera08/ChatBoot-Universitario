import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch, Trash2, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, ClipboardList, CheckCircle, Clock, XCircle,
} from 'lucide-react';
import { flowApi } from '../../api/chatApi';

interface Flow {
  id: string;
  name: string;
  description: string;
  trigger_keywords: string[];
  completion_message: string;
  notification_email: string;
  is_active: boolean;
  submission_count: number;
  steps?: FlowStep[];
}

interface FlowStep {
  id: string;
  step_order: number;
  field_name: string;
  question: string;
  field_type: string;
  options: Array<{ label: string; value: string }>;
}

interface Submission {
  id: string;
  radicado: string;
  flow_name: string;
  session_id: string;
  data: Record<string, any>;
  status: 'pendiente' | 'en_proceso' | 'completado' | 'rechazado';
  notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  en_proceso: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  completado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rechazado: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pendiente: Clock,
  en_proceso: GitBranch,
  completado: CheckCircle,
  rechazado: XCircle,
};

export default function FlowManager() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeTab, setActiveTab] = useState<'flows' | 'submissions'>('flows');
  const [expandedFlow, setExpandedFlow] = useState<string | null>(null);
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    try {
      const [flowsRes, subRes] = await Promise.all([
        flowApi.getAll(),
        flowApi.getSubmissions(),
      ]);
      setFlows(flowsRes.data.flows);
      setSubmissions(subRes.data.submissions);
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleFlow = async (id: string, current: boolean) => {
    try {
      await flowApi.toggle(id, !current);
      setFlows((prev) => prev.map((f) => f.id === id ? { ...f, is_active: !current } : f));
    } catch {
    }
  };

  const deleteFlow = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el flujo "${name}"? Esto borrará todos sus pasos y configuración.`)) return;
    try {
      await flowApi.delete(id);
      setFlows((prev) => prev.filter((f) => f.id !== id));
    } catch {
    }
  };

  const loadSteps = async (flowId: string) => {
    if (expandedFlow === flowId) { setExpandedFlow(null); return; }
    try {
      const { data } = await flowApi.getOne(flowId);
      setFlows((prev) => prev.map((f) => f.id === flowId ? { ...f, steps: data.flow.steps } : f));
      setExpandedFlow(flowId);
    } catch {
    }
  };

  const updateSubmissionStatus = async (id: string, status: string) => {
    try {
      await flowApi.updateSubmission(id, status, '');
      setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, status: status as any } : s));
    } catch {
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Flujos Guiados</h1>
          <p className="text-sm text-gray-500">Procesos paso a paso que guían al estudiante</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/10 bg-gray-900 p-1 w-fit">
        {(['flows', 'submissions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-ush-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'flows' ? `Flujos (${flows.length})` : `Solicitudes (${submissions.length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-ush-500 border-t-transparent" />
        </div>
      ) : activeTab === 'flows' ? (
        /* ── LISTA DE FLUJOS ── */
        <div className="space-y-3">
          {flows.map((flow) => (
            <div key={flow.id} className="overflow-hidden rounded-xl border border-white/10 bg-gray-900">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  flow.is_active ? 'bg-ush-600/20' : 'bg-gray-800'
                }`}>
                  <GitBranch className={`h-4 w-4 ${flow.is_active ? 'text-ush-400' : 'text-gray-600'}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white truncate">{flow.name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                      flow.is_active
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : 'border-gray-600/20 bg-gray-800 text-gray-500'
                    }`}>
                      {flow.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {flow.trigger_keywords.slice(0, 4).map((kw) => (
                      <span key={kw} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>

                <span className="shrink-0 text-xs text-gray-500">{flow.submission_count} solicitudes</span>

                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => loadSteps(flow.id)} className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white" title="Ver pasos">
                    {expandedFlow === flow.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <button onClick={() => toggleFlow(flow.id, flow.is_active)} className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white" title="Activar/desactivar">
                    {flow.is_active
                      ? <ToggleRight className="h-4 w-4 text-emerald-400" />
                      : <ToggleLeft className="h-4 w-4" />}
                  </button>
                  <button onClick={() => deleteFlow(flow.id, flow.name)} className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-red-400" title="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Pasos del flujo */}
              <AnimatePresence>
                {expandedFlow === flow.id && flow.steps && (
                  <motion.div
                    className="border-t border-white/5 px-5 py-4"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <p className="mb-3 text-xs font-medium text-gray-400">Pasos del flujo:</p>
                    <div className="space-y-2">
                      {flow.steps.map((step, i) => (
                        <div key={step.id} className="flex items-start gap-3 rounded-lg bg-gray-800/50 px-3 py-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ush-600/30 text-[10px] font-bold text-ush-300">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-white">{step.question}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
                                {step.field_type}
                              </span>
                              <span className="text-[10px] text-gray-600">{step.field_name}</span>
                            </div>
                            {step.options?.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {step.options.map((o) => (
                                  <span key={o.value} className="rounded bg-gray-700/60 px-1.5 py-0.5 text-[10px] text-gray-400">
                                    {o.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-gray-600">
                      Mensaje final: <span className="text-gray-400">{flow.completion_message}</span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      ) : (
        /* ── SOLICITUDES ── */
        <div className="space-y-2">
          {submissions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <ClipboardList className="h-12 w-12 text-gray-700" />
              <p className="text-gray-500">Aún no hay solicitudes radicadas.</p>
            </div>
          ) : submissions.map((sub) => {
            const Icon = STATUS_ICONS[sub.status] || Clock;
            return (
              <div key={sub.id} className="overflow-hidden rounded-xl border border-white/10 bg-gray-900">
                <button
                  onClick={() => setExpandedSubmission(expandedSubmission === sub.id ? null : sub.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-ush-300">{sub.radicado}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[sub.status]}`}>
                        <Icon className="mr-1 inline h-3 w-3" />{sub.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{sub.flow_name} · {formatDate(sub.created_at)}</p>
                  </div>
                  {expandedSubmission === sub.id
                    ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-500" />
                    : <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />}
                </button>

                <AnimatePresence>
                  {expandedSubmission === sub.id && (
                    <motion.div
                      className="border-t border-white/5 px-5 py-4"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <div className="mb-4 grid grid-cols-2 gap-2">
                        {Object.entries(sub.data)
                          .filter(([k]) => k !== 'confirmacion')
                          .map(([key, val]) => (
                            <div key={key} className="rounded-lg bg-gray-800 px-3 py-2">
                              <p className="text-[10px] capitalize text-gray-500">{key.replace(/_/g, ' ')}</p>
                              <p className="text-sm text-white">{String(val)}</p>
                            </div>
                          ))}
                      </div>
                      <div className="flex gap-2">
                        {['pendiente', 'en_proceso', 'completado', 'rechazado'].map((s) => (
                          <button
                            key={s}
                            onClick={() => updateSubmissionStatus(sub.id, s)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              sub.status === s
                                ? 'bg-ush-600 text-white'
                                : 'border border-white/10 text-gray-400 hover:text-white'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
