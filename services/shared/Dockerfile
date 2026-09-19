FROM node:22-alpine

WORKDIR /app/services/shared

# Copy only package.json for layer caching
COPY services/shared/package.json ./

# Install dependencies
RUN npm install

# Copy service source code and test files
COPY services/shared/ ./

# Run service tests on container start
CMD ["node", "--test"]
