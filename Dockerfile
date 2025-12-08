# Build
FROM node:25-alpine3.22 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:25-alpine3.22

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node

EXPOSE 9100
CMD ["node", "dist/index.js"]