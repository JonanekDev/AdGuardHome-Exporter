# =========================
# Build stage
# =========================
FROM node:26-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# =========================
# Runtime stage
# =========================
FROM node:26-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN apk add --no-cache su-exec

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

EXPOSE 9100

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
