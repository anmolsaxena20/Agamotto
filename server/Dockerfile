FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY server.js ./
COPY src/ ./src/
RUN node --check server.js

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/src ./src

USER node
EXPOSE 3000
CMD ["node", "server.js"]