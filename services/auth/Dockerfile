FROM node:22-alpine
WORKDIR /app
COPY services/shared /services/shared
COPY services/auth ./services/auth
WORKDIR /app/services/auth
RUN npm install --omit=dev || true
CMD ["npm", "test"]
