# API de autenticación del CRM. Dos etapas: las dependencias de desarrollo y el
# compilador de TypeScript no viajan a ECR.

# ── build ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── dependencias de produccion ───────────────────────────────────────────────────
# Se instalan aparte para no arrastrar las de desarrollo a la imagen final.
FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ── runtime ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine

# dumb-init reparte las senales al proceso de Node. Sin el, Node corre como PID 1
# y PID 1 ignora SIGTERM salvo que instale un manejador — el cierre ordenado que
# hay en index.ts no llegaria a ejecutarse y cada despliegue cortaria peticiones
# a la mitad.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
WORKDIR /app

# El usuario `node` viene en la imagen. Correr como root dentro del contenedor no
# aporta nada aqui y amplia lo que puede hacer un fallo de la aplicacion.
COPY --chown=node:node --from=deps  /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./

# Bundle de CA de AWS RDS. Sin el, la aplicacion no arranca con TLS activo: se
# conecta verificando el certificado del servidor (rejectUnauthorized: true) y la
# CA de AWS no esta en el store por defecto de Node. Se copia en la etapa final
# para que un cambio del bundle no invalide la cache de la compilacion.
COPY --chown=node:node certs-rds-global.pem ./

USER node
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
