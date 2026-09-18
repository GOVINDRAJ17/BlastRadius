FROM node:22-alpine
WORKDIR /app
COPY services/search ./services/search
WORKDIR /app/services/search
RUN npm install --omit=dev || true
CMD ["npm", "test"]
