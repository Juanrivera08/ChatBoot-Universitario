import { useEffect, useState } from 'react';
import { Settings, Save, Info } from 'lucide-react';
import { adminApi } from '../../api/chatApi';

interface ConfigItem {
  key: string;
  value: string;
  description: string;
}

const CONFIG_LABELS: Record<string, { label: string; type: 'text' | 'textarea' | 'number'; hint?: string }> = {
  model: { label: 'Modelo de IA', type: 'text', hint: 'Ej: gpt-4o-mini, gpt-4o, gpt-4-turbo' },
  temperature: { label: 'Temperatura (0.0 - 1.0)', type: 'number', hint: 'Valores bajos = más preciso. Altos = más creativo.' },
  max_tokens: { label: 'Máx. Tokens por respuesta', type: 'number', hint: 'Límite de longitud de la respuesta de la IA' },
  top_k: { label: 'Fragmentos RAG a recuperar (Top-K)', type: 'number', hint: 'Cuántos fragmentos de documentos usar como contexto' },
  system_prompt: { label: 'Prompt del Sistema', type: 'textarea', hint: 'Instrucciones base que guían el comportamiento de la IA' },
};

export default function AISettings() {
  const [config, setConfig] = useState<ConfigItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    adminApi.getAIConfig().then(({ data }) => {
      setConfig(data.config);
      const vals: Record<string, string> = {};
      data.config.forEach((c: ConfigItem) => { vals[c.key] = c.value; });
      setValues(vals);
    });
  }, []);

  const handleSave = async (key: string) => {
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await adminApi.updateAIConfig(key, values[key]);
      setSaved((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2000);
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Configuración de la IA</h1>
        <p className="text-sm text-gray-500">Ajusta el comportamiento del asistente virtual</p>
      </div>

      <div className="space-y-4">
        {config.map((item) => {
          const meta = CONFIG_LABELS[item.key];
          if (!meta) return null;
          return (
            <div key={item.key} className="rounded-xl border border-white/10 bg-gray-900 p-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <label className="text-sm font-medium text-white">{meta.label}</label>
                  {meta.hint && (
                    <div className="mt-1 flex items-start gap-1.5">
                      <Info className="mt-0.5 h-3 w-3 shrink-0 text-gray-600" />
                      <p className="text-xs text-gray-600">{meta.hint}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleSave(item.key)}
                  disabled={saving[item.key]}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    saved[item.key]
                      ? 'bg-emerald-600/20 text-emerald-400'
                      : 'bg-ush-600 text-white hover:bg-ush-500 disabled:opacity-60'
                  }`}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saved[item.key] ? 'Guardado' : saving[item.key] ? 'Guardando...' : 'Guardar'}
                </button>
              </div>

              {meta.type === 'textarea' ? (
                <textarea
                  value={values[item.key] || ''}
                  onChange={(e) => setValues({ ...values, [item.key]: e.target.value })}
                  rows={6}
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-sm text-white outline-none focus:border-ush-500 font-mono"
                />
              ) : (
                <input
                  type={meta.type}
                  value={values[item.key] || ''}
                  onChange={(e) => setValues({ ...values, [item.key]: e.target.value })}
                  step={meta.type === 'number' && item.key === 'temperature' ? '0.1' : '1'}
                  min={item.key === 'temperature' ? '0' : '1'}
                  max={item.key === 'temperature' ? '1' : undefined}
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-sm text-white outline-none focus:border-ush-500"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
