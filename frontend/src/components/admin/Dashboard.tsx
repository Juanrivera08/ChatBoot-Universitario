import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare, Users, FileText, Star,
  TrendingUp, Database, Zap, BarChart2,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import { adminApi } from '../../api/chatApi';
import type { DashboardStats } from '../../types';

const COLORS = ['#6e8afc', '#34d399', '#f59e0b', '#f87171', '#a78bfa'];

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}

function StatCard({ title, value, icon: Icon, color, subtitle }: StatCardProps) {
  return (
    <motion.div
      className="rounded-xl border border-white/10 bg-gray-900 p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-3xl font-bold text-white">{value ?? '—'}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-600">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [charts, setCharts] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getStats(), adminApi.getCharts()])
      .then(([statsRes, chartsRes]) => {
        setStats(statsRes.data.stats);
        setCharts(chartsRes.data);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ush-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500">Resumen general del chatbot institucional</p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          title="Conversaciones Totales"
          value={stats?.total_conversations || 0}
          icon={MessageSquare}
          color="bg-ush-600"
          subtitle={`${stats?.conversations_today || 0} hoy`}
        />
        <StatCard
          title="Mensajes de Usuarios"
          value={stats?.total_user_messages || 0}
          icon={Users}
          color="bg-emerald-600"
          subtitle={`${stats?.messages_today || 0} hoy`}
        />
        <StatCard
          title="Documentos Indexados"
          value={`${stats?.indexed_documents || 0}/${stats?.active_documents || 0}`}
          icon={FileText}
          color="bg-amber-600"
          subtitle={`${stats?.totalChunks || 0} fragmentos en ChromaDB`}
        />
        <StatCard
          title="Satisfacción Promedio"
          value={stats?.avg_satisfaction ? `${stats.avg_satisfaction}/5` : 'N/D'}
          icon={Star}
          color="bg-violet-600"
          subtitle="Valoraciones de usuarios"
        />
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Mensajes por día */}
        <div className="rounded-xl border border-white/10 bg-gray-900 p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-ush-400" />
            <h2 className="text-sm font-medium text-white">Mensajes (últimos 30 días)</h2>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={charts?.dailyMessages || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#6e8afc' }}
              />
              <Line
                type="monotone" dataKey="count" stroke="#6e8afc"
                strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#6e8afc' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Distribución por categoría */}
        <div className="rounded-xl border border-white/10 bg-gray-900 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-ush-400" />
            <h2 className="text-sm font-medium text-white">Documentos por Categoría</h2>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={charts?.categoryDist || []}
                dataKey="count"
                nameKey="category"
                cx="50%" cy="50%"
                outerRadius={80}
                label={({ category, percent }) =>
                  `${category} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {(charts?.categoryDist || []).map((_: any, index: number) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                itemStyle={{ color: '#9ca3af' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top consultas */}
        <div className="rounded-xl border border-white/10 bg-gray-900 p-5 xl:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-ush-400" />
            <h2 className="text-sm font-medium text-white">Consultas más frecuentes</h2>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={(charts?.topQueries || []).slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
              <YAxis
                type="category" dataKey="query"
                tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} width={200}
                tickFormatter={(v) => v.length > 40 ? v.slice(0, 40) + '...' : v}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                itemStyle={{ color: '#6e8afc' }}
              />
              <Bar dataKey="count" fill="#6e8afc" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tokens usados */}
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-gray-900 px-5 py-4">
        <Zap className="h-5 w-5 text-amber-400" />
        <div>
          <p className="text-sm font-medium text-white">
            Tokens OpenAI utilizados: <span className="text-amber-400">{stats?.total_tokens_used?.toLocaleString() || 0}</span>
          </p>
          <p className="text-xs text-gray-500">Costo estimado: ~${((stats?.total_tokens_used || 0) * 0.00000015).toFixed(4)} USD (GPT-4o mini)</p>
        </div>
      </div>
    </div>
  );
}
