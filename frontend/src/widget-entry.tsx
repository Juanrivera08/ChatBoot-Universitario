/**
 * PUNTO DE ENTRADA DEL WIDGET EMBEBIDO
 *
 * Este archivo compila el widget como un script IIFE que puede insertarse
 * en cualquier página web con una sola línea de código:
 *
 * <script src="https://tu-dominio.com/ush-chat-widget.iife.js"></script>
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatWidget from './components/widget/ChatWidget';
import './index.css';

function mountWidget() {
  const container = document.createElement('div');
  container.id = 'ush-chat-widget-root';
  document.body.appendChild(container);

  ReactDOM.createRoot(container).render(<ChatWidget />);
}

// Montar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountWidget);
} else {
  mountWidget();
}
