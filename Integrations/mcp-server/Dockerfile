# MCP-сервер планера: сборки нет — образ копирует исходники как есть.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY contract ./contract
USER node
ENV MCP_TRANSPORT=http MCP_HOST=0.0.0.0 MCP_PORT=8085 NODE_ENV=production
EXPOSE 8085
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8085/healthz >/dev/null || exit 1
CMD ["node", "src/index.js"]
