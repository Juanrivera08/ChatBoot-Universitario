import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, MessageSquare, HelpCircle,
  Settings, LogOut, Bot, FileBarChart, Bell, BellOff,
  // GitBranch,  // ← módulo de Flujos Guiados desactivado (ver nota abajo)
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAdminAlertsStore } from '../../store/adminAlertsStore';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/documents', label: 'Documentos', icon: FileText },
  { to: '/admin/conversations', label: 'Conversaciones', icon: MessageSquare },
  { to: '/admin/reports', label: 'Reportes', icon: FileBarChart },
  // Módulo de Flujos Guiados desactivado (no eliminado) — no se necesita por ahora.
  // Para reactivarlo: descomentar esta línea, el import GitBranch de arriba y la ruta
  // en AdminPage.tsx, y poner FLOWS_ENABLED=true en el .env del backend.
  // { to: '/admin/flows', label: 'Flujos Guiados', icon: GitBranch },
  { to: '/admin/faqs', label: 'FAQs', icon: HelpCircle },
  { to: '/admin/settings', label: 'Configuración IA', icon: Settings },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const attentionCount = useAdminAlertsStore((s) => s.attentionCount);
  const soundEnabled = useAdminAlertsStore((s) => s.soundEnabled);
  const toggleSound = useAdminAlertsStore((s) => s.toggleSound);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-gray-900">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-ush-500 to-ush-700">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">ChatBot USH</p>
          <p className="text-xs text-gray-500">Panel Admin</p>
        </div>
        {/* Silenciar / activar el sonido de las alertas de nuevas conversaciones */}
        <button
          onClick={toggleSound}
          title={soundEnabled ? 'Silenciar alertas' : 'Activar sonido de alertas'}
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
        >
          {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => {
          const badge = to === '/admin/conversations' ? attentionCount : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-ush-600/20 text-ush-400'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-3 rounded-lg bg-gray-800 px-3 py-2.5">
          <p className="text-xs font-medium text-white">{user?.fullName}</p>
          <p className="text-[11px] text-gray-500">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
