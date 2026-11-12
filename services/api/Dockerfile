FROM node:22-alpine

WORKDIR /app

# Copy package descriptors for layer caching
COPY services/api/package.json ./services/api/

WORKDIR /app/services/api
RUN npm install --omit=dev

WORKDIR /app
COPY deployment-scope.json* blast-radius.json* metrics-history.json* ./
COPY services/api/ ./services/api/

WORKDIR /app/services/api

ENV NODE_ENV=production
ENV API_PORT=4000

EXPOSE 4000

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

CMD ["node", "index.js"]
