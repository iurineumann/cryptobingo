FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund --loglevel=warn
COPY . .
RUN npx tsc

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --loglevel=warn

COPY --from=builder /app/dist ./dist

# module-alias registrado em module-alias.ts → server.ts resolve @azure/functions para o shim

USER appuser
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/server.js"]
