import { Routes, Route } from 'react-router-dom';
import Sidebar from '../components/admin/Sidebar';
import Dashboard from '../components/admin/Dashboard';
import DocumentManager from '../components/admin/DocumentManager';
import ConversationViewer from '../components/admin/ConversationViewer';
import FAQManager from '../components/admin/FAQManager';
import AISettings from '../components/admin/AISettings';
// Módulo de Flujos Guiados desactivado (no eliminado) — ver nota en la ruta de abajo.
// import FlowManager from '../components/admin/FlowManager';

export default function AdminPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 font-sans text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="documents" element={<DocumentManager />} />
          <Route path="conversations" element={<ConversationViewer />} />
          <Route path="faqs" element={<FAQManager />} />
          <Route path="settings" element={<AISettings />} />
          {/* Módulo de Flujos Guiados desactivado (no eliminado) — no se necesita por
              ahora. Para reactivarlo: descomentar el import FlowManager de arriba, esta
              ruta, la entrada del Sidebar, y poner FLOWS_ENABLED=true en el .env backend. */}
          {/* <Route path="flows" element={<FlowManager />} /> */}
        </Routes>
      </main>
    </div>
  );
}
