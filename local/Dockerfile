# LOCAL — long-lived backend + built frontend in one container.
# Mount a persistent volume at /app/data for the SQLite database and uploads.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm i -D vite@5 @vitejs/plugin-react@4 --ignore-scripts
COPY . .
RUN npx vite build && npm prune --omit=dev
ENV NODE_ENV=production PORT=8787 LOCAL_DB_PATH=/app/data/local.db
VOLUME ["/app/data"]
EXPOSE 8787
CMD ["node", "server/index.js"]
