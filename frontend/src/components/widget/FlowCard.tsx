import { motion } from 'framer-motion';
import { CheckCircle, ClipboardList, XCircle } from 'lucide-react';
import type { FlowState } from '../../types';

interface Props {
  flowState: FlowState;
  onOptionSelect: (value: string) => void;
}

// Barra de progreso del flujo
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="mb-3 mt-1">
      <div className="mb-1 flex items-center justify-between text-[10px] text-gray-500">
        <span>Paso {current} de {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-700">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-ush-500 to-ush-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// Tarjeta de radicado exitoso
function CompletionCard({ radicado, flowName, data }: {
  radicado: string;
  flowName: string;
  data: Record<string, any>;
}) {
  return (
    <motion.div
      className="mt-2 overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-2 border-b border-emerald-500/15 bg-emerald-500/10 px-4 py-2.5">
        <CheckCircle className="h-4 w-4 text-emerald-400" />
        <span className="text-xs font-semibold text-emerald-300">{flowName}</span>
      </div>
      <div className="px-4 py-3">
        <p className="mb-3 text-xs text-gray-400">Número de radicado:</p>
        <div className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2">
          <span className="font-mono text-sm font-bold tracking-wider text-ush-300">
            {radicado}
          </span>
          <button
            onClick={() => navigator.clipboard?.writeText(radicado)}
            className="ml-2 text-[10px] text-gray-500 hover:text-gray-300"
          >
            copiar
          </button>
        </div>
        <div className="mt-3 space-y-1">
          {Object.entries(data)
            .filter(([k]) => k !== 'confirmacion')
            .map(([key, val]) => (
              <div key={key} className="flex gap-2 text-[11px]">
                <span className="capitalize text-gray-500">{key.replace(/_/g, ' ')}:</span>
                <span className="text-gray-300">{String(val)}</span>
              </div>
            ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function FlowCard({ flowState, onOptionSelect }: Props) {
  const { type, step, currentStep, totalSteps, radicado, submissionData, flowName } = flowState;

  return (
    <div className="mt-1">
      {/* Encabezado del flujo */}
      {flowName && type !== 'flow_complete' && type !== 'flow_cancelled' && (
        <div className="mb-2 flex items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5 text-ush-400" />
          <span className="text-[11px] font-medium text-ush-400">{flowName}</span>
        </div>
      )}

      {/* Barra de progreso */}
      {currentStep && totalSteps && type === 'flow_question' && (
        <ProgressBar current={currentStep} total={totalSteps} />
      )}

      {/* Botones de selección múltiple */}
      {type === 'flow_question' && step?.field_type === 'select' && step.options && (
        <div className="mt-2 flex flex-wrap gap-2">
          {step.options.map((opt) => (
            <motion.button
              key={opt.value}
              onClick={() => onOptionSelect(opt.value)}
              className="rounded-lg border border-ush-600/40 bg-ush-900/40 px-3 py-1.5 text-xs text-ush-200 transition-all hover:border-ush-400 hover:bg-ush-800 hover:text-white active:scale-95"
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {opt.label}
            </motion.button>
          ))}
        </div>
      )}

      {/* Botones Sí / No para confirmación */}
      {type === 'flow_question' && step?.field_type === 'confirmation' && (
        <div className="mt-2 flex gap-2">
          <motion.button
            onClick={() => onOptionSelect('Sí, confirmar')}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 active:scale-95"
            whileTap={{ scale: 0.95 }}
          >
            <CheckCircle className="h-3.5 w-3.5" /> Confirmar
          </motion.button>
          <motion.button
            onClick={() => onOptionSelect('No, cancelar')}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 active:scale-95"
            whileTap={{ scale: 0.95 }}
          >
            <XCircle className="h-3.5 w-3.5" /> Cancelar
          </motion.button>
        </div>
      )}

      {/* Tarjeta de radicado al completar */}
      {type === 'flow_complete' && radicado && submissionData && (
        <CompletionCard radicado={radicado} flowName={flowName!} data={submissionData} />
      )}
    </div>
  );
}
