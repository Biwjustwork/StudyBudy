FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
ENV NODE_ENV=production
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3004
CMD ["npm", "start"]
