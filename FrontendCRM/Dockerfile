# CRM (Vue 3 + Vite) servido como estatico por nginx. Dos etapas: la de build no viaja a
# ECR, asi que la imagen final no lleva ni node ni node_modules.

# ── build ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Los manifiestos primero y solos: mientras no cambien las dependencias esta capa se
# reutiliza y el npm ci no se vuelve a ejecutar en cada commit.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────────
FROM nginx:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
