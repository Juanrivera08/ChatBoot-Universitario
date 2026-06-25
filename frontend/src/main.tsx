import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import ChatWidget from './components/widget/ChatWidget';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/admin/ProtectedRoute';

// basename desde la base de Vite (import.meta.env.BASE_URL).
// En local es '/'; en prod bajo IIS es '/chatbot-demo/'.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/admin/login" element={<LoginPage />} />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        {/* Demo del widget embebido */}
        <Route path="/" element={<DemoPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

function DemoPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white">
            Institución Universitaria
            <br />
            <span className="text-ush-400">Salazar y Herrera</span>
          </h1>
          <p className="mt-4 text-gray-400">
            Haz clic en el botón de la esquina inferior derecha para interactuar con el asistente virtual.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-4 text-center text-sm text-gray-500">
          {['Académico', 'Administrativo', 'Bienestar'].map((cat) => (
            <div key={cat} className="rounded-xl border border-white/10 bg-gray-900 p-4">
              {cat}
            </div>
          ))}
        </div>
      </div>
      {/* El widget flotante */}
      <ChatWidget />
    </div>
  );
}
