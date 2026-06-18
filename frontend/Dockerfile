FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# URL de la API — /api como ruta relativa, nginx la proxea al backend internamente
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Compilar panel admin
RUN npm run build

# Compilar widget embebible (genera dist-widget/)
RUN npm run build:widget

# ─── Servir con Nginx ─────────────────────────────────────────
FROM nginx:alpine

# Panel admin
COPY --from=builder /app/dist /usr/share/nginx/html

# Widget en /widget/ — nginx lo sirve directamente sin pasar por el backend
COPY --from=builder /app/dist-widget /usr/share/nginx/html/widget

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
