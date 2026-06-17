# ChatBot USH — Widget Conversacional Inteligente

> Asistente virtual institucional para la **Institución Universitaria Salazar y Herrera**, impulsado por GPT-4o mini + RAG con LangChain y ChromaDB.

---

## Arquitectura

```
Usuario (Web USH)
      │
      ▼
┌─────────────────┐
│  Widget React   │  ← Botón flotante embebido en la web institucional
│  (Framer Motion)│
└────────┬────────┘
         │ HTTP / REST
         ▼
┌─────────────────┐
│  API Node.js    │  ← Express + TypeScript
│  + Middleware   │     Helmet, Rate Limit, JWT, Winston
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌──────────────────────────┐
│  PG   │ │  LangChain + OpenAI      │
│  SQL  │ │  GPT-4o mini             │
└───────┘ └──────────┬───────────────┘
                     │
                     ▼
              ┌────────────┐
              │  ChromaDB  │  ← Búsqueda semántica sobre PDFs
              └────────────┘
```

---

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Widget | React 18, Vite, TailwindCSS, Framer Motion |
| Estado | Zustand |
| Backend | Node.js, Express, TypeScript |
| IA | OpenAI GPT-4o mini |
| RAG | LangChain, ChromaDB |
| BD | PostgreSQL 16 |
| Auth | JWT |
| Seguridad | Helmet, express-rate-limit |
| Logs | Winston |
| Deploy | Docker, Docker Compose, Nginx |

---

## Instalación rápida (Docker)

### Requisitos
- Docker Desktop
- Clave API de OpenAI

### Pasos

```bash
# 1. Clonar / copiar el proyecto
cd ChatBoot

# 2. Crear archivo de variables de entorno
cp .env.example .env

# 3. Editar .env y agregar tu OPENAI_API_KEY
#    También cambia JWT_SECRET y DB_PASSWORD

# 4. Levantar todo con Docker
docker compose up --build -d

# 5. Verificar que todo esté corriendo
docker compose ps
```

El sistema estará disponible en:
- **Widget + App**: http://localhost:5173
- **API Backend**: http://localhost:3001
- **ChromaDB**: http://localhost:8000

---

## Instalación manual (desarrollo)

### Backend

```bash
cd backend
npm install

# Crear archivo .env (ver .env.example)
cp ../.env.example .env

# Necesitas PostgreSQL y ChromaDB corriendo
# Aplicar esquema SQL
npm run db:migrate

# Iniciar en modo desarrollo
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Cómo embeber el widget en la web institucional

Una vez desplegado, agrega **una sola línea** al HTML de la página de la universidad:

```html
<!-- Antes de </body> en la web institucional de la USH -->
<script src="https://chatbot.ush.edu.co/ush-chat-widget.iife.js"></script>
```

O en la versión de desarrollo:

```html
<script src="http://localhost:5173/ush-chat-widget.iife.js"></script>
```

El widget aparecerá automáticamente como un botón flotante en la esquina inferior derecha, sin modificar el resto de la página.

Para compilar el widget como archivo único:

```bash
cd frontend
npm run build:widget
# Resultado: dist-widget/ush-chat-widget.iife.js
```

---

## Panel Administrativo

Accede al dashboard en: **http://localhost:5173/admin**

Crear el primer administrador (una sola vez):

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ush.edu.co","password":"TuPasswordSeguro123","fullName":"Administrador USH"}'
```

### Funcionalidades del panel

| Sección | Descripción |
|---------|-------------|
| Dashboard | Estadísticas, gráficas, tokens usados |
| Documentos | Subir PDFs, ver estado de indexación |
| Conversaciones | Ver historial completo de chats |
| FAQs | Respuestas predefinidas |
| Configuración IA | Ajustar modelo, temperatura, prompt |

---

## Sistema RAG — Cómo funciona

```
PDF Institucional
      │
      ▼
Extracción de texto (pdf-parse)
      │
      ▼
División en chunks (RecursiveCharacterTextSplitter)
      │
      ▼
Generación de embeddings (text-embedding-3-small)
      │
      ▼
Almacenamiento en ChromaDB
      │
      ▼
━━━━━━━ En tiempo real ━━━━━━━
      │
      ▼
Query del usuario
      │
      ▼
Embedding de la consulta
      │
      ▼
Búsqueda semántica (Top-K fragmentos más similares)
      │
      ▼
Contexto → GPT-4o mini → Respuesta basada en documentos
```

---

## Estructura del proyecto

```
ChatBoot/
├── backend/
│   ├── src/
│   │   ├── index.ts              ← Servidor Express
│   │   ├── config/
│   │   │   ├── database.ts       ← Pool PostgreSQL
│   │   │   ├── chroma.ts         ← Cliente ChromaDB
│   │   │   └── migrate.ts        ← Ejecutar schema.sql
│   │   ├── middleware/
│   │   │   ├── auth.ts           ← JWT verify
│   │   │   ├── rateLimit.ts      ← Rate limiting por ruta
│   │   │   ├── errorHandler.ts   ← Error global
│   │   │   └── logger.ts         ← Request logger
│   │   ├── routes/
│   │   │   ├── chat.ts           ← POST /api/chat/message
│   │   │   ├── documents.ts      ← CRUD documentos
│   │   │   ├── auth.ts           ← Login / me
│   │   │   └── admin.ts          ← Dashboard / stats
│   │   ├── controllers/          ← Lógica de las rutas
│   │   ├── services/
│   │   │   ├── aiService.ts      ← OpenAI + construcción de prompt
│   │   │   ├── ragService.ts     ← ChromaDB embeddings / búsqueda
│   │   │   ├── documentService.ts ← Upload + indexación PDF
│   │   │   └── conversationService.ts ← Historial de chat
│   │   └── utils/
│   │       ├── logger.ts         ← Winston
│   │       └── validators.ts     ← express-validator
│   ├── sql/schema.sql            ← Esquema completo PostgreSQL
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── widget/           ← El chatbot flotante
│   │   │   │   ├── ChatWidget.tsx
│   │   │   │   ├── ChatButton.tsx
│   │   │   │   ├── ChatWindow.tsx
│   │   │   │   ├── ChatHeader.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   ├── MessageInput.tsx
│   │   │   │   └── TypingIndicator.tsx
│   │   │   └── admin/            ← Panel de administración
│   │   │       ├── Dashboard.tsx
│   │   │       ├── DocumentManager.tsx
│   │   │       ├── ConversationViewer.tsx
│   │   │       ├── FAQManager.tsx
│   │   │       ├── AISettings.tsx
│   │   │       └── Sidebar.tsx
│   │   ├── store/
│   │   │   ├── chatStore.ts      ← Zustand: estado del widget
│   │   │   └── authStore.ts      ← Zustand: sesión admin
│   │   ├── api/chatApi.ts        ← Axios: llamadas al backend
│   │   ├── pages/
│   │   │   ├── AdminPage.tsx
│   │   │   └── LoginPage.tsx
│   │   ├── types/index.ts
│   │   ├── main.tsx
│   │   └── widget-entry.tsx      ← Entrada para build del widget IIFE
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API REST — Endpoints

### Chat (público)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/chat/message` | Enviar mensaje, obtener respuesta IA |
| `GET` | `/api/chat/history/:sessionId` | Historial de la sesión |
| `POST` | `/api/chat/feedback/:sessionId` | Valoración del chat |

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Iniciar sesión admin |
| `GET` | `/api/auth/me` | Info del usuario actual |

### Documentos (requiere admin)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/documents` | Listar documentos |
| `POST` | `/api/documents` | Subir PDF y comenzar indexación |
| `DELETE` | `/api/documents/:id` | Eliminar documento |
| `POST` | `/api/documents/:id/reindex` | Re-indexar documento |

### Admin (requiere admin)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/admin/stats` | Estadísticas del dashboard |
| `GET` | `/api/admin/charts` | Datos para gráficas |
| `GET` | `/api/admin/conversations` | Lista de conversaciones |
| `GET` | `/api/admin/conversations/:id/messages` | Mensajes de una conversación |
| `GET/POST/DELETE` | `/api/admin/faqs` | CRUD de FAQs |
| `GET/PUT` | `/api/admin/ai-config` | Configuración de la IA |

---

## Variables de entorno requeridas

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `OPENAI_API_KEY` | **Sí** | Clave de OpenAI |
| `JWT_SECRET` | **Sí** | Secreto para firmar tokens |
| `DB_PASSWORD` | **Sí** | Password de PostgreSQL |
| `DB_HOST` | Sí | Host de PostgreSQL |
| `CHROMA_URL` | Sí | URL de ChromaDB |
| `ALLOWED_ORIGINS` | No | Dominios CORS permitidos |

---

## Seguridad implementada

- **Helmet** — HTTP security headers
- **CORS** configurado por origen
- **Rate limiting** diferenciado por ruta
- **JWT** para todas las rutas administrativas
- **bcryptjs** (salt 12) para contraseñas
- **express-validator** en todos los inputs
- **Multer** con filtro de tipo de archivo (solo PDF)
- Variables de entorno nunca en código fuente

---

## Licencia

Proyecto desarrollado para la **Institución Universitaria Salazar y Herrera**. Uso interno institucional.
