FROM node:22-alpine

WORKDIR /app/services/search

# Copy only package.json for layer caching
COPY services/search/package.json ./

# Install dependencies
RUN npm install

# Copy service source code and test files
COPY services/search/ ./

# Run service tests on container start
CMD ["node", "--test"]
