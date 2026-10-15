FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src
RUN mkdir -p /app/data && chown node:node /app/data
USER node

VOLUME ["/app/data"]
EXPOSE 3001
CMD ["node", "src/server.js"]
