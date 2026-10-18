FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS deps
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime-base
WORKDIR /app

ARG APP_ENV=production
ENV NODE_ENV=${APP_ENV}
ENV PORT=3000

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package*.json ./

EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM runtime-base AS testing
ENV NODE_ENV=testing
COPY --chown=node:node .env.testing ./.env
USER node

FROM runtime-base AS production
ENV NODE_ENV=production
COPY --chown=node:node .env.production ./.env
USER node
