FROM node:22-alpine

WORKDIR /app

# Copy package.json files for dependency caching
COPY services/shared/package.json ./services/shared/
COPY services/auth/package.json ./services/auth/
COPY services/payments/package.json ./services/payments/

WORKDIR /app/services/payments

# Install dependencies
RUN npm install

# Copy source files
WORKDIR /app
COPY services/shared/ ./services/shared/
COPY services/auth/ ./services/auth/
COPY services/payments/ ./services/payments/

WORKDIR /app/services/payments

# Run service tests on container start
CMD ["node", "--test"]
