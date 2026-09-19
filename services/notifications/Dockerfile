FROM node:22-alpine

WORKDIR /app

# Copy package.json files for dependency caching
COPY services/shared/package.json ./services/shared/
COPY services/auth/package.json ./services/auth/
COPY services/payments/package.json ./services/payments/
COPY services/notifications/package.json ./services/notifications/

WORKDIR /app/services/notifications

# Install dependencies
RUN npm install

# Copy source files
WORKDIR /app
COPY services/shared/ ./services/shared/
COPY services/auth/ ./services/auth/
COPY services/payments/ ./services/payments/
COPY services/notifications/ ./services/notifications/

WORKDIR /app/services/notifications

# Run service tests on container start
CMD ["node", "--test"]
