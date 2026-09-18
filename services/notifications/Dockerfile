FROM node:22-alpine
WORKDIR /app
COPY services/shared /services/shared
COPY services/auth /services/auth
COPY services/payments /services/payments
COPY services/notifications ./services/notifications
WORKDIR /app/services/notifications
RUN npm install --omit=dev || true
CMD ["npm", "test"]
