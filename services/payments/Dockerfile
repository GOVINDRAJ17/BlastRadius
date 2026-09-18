FROM node:22-alpine
WORKDIR /app
COPY services/shared /services/shared
COPY services/auth /services/auth
COPY services/payments ./services/payments
WORKDIR /app/services/payments
RUN npm install --omit=dev || true
CMD ["npm", "test"]
