FROM node:20-alpine AS build
WORKDIR /app

ARG CONFIGURATION=production

COPY package*.json ./
RUN npm ci

COPY angular.json tsconfig*.json ./
COPY src ./src
RUN npm run build -- --configuration=${CONFIGURATION}

FROM nginx:1.27-alpine AS runtime-base

COPY --from=build /app/dist/smart-gate-web/browser /usr/share/nginx/html

EXPOSE 80

FROM runtime-base AS testing
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

FROM runtime-base AS production
COPY docker/nginx.production.conf /etc/nginx/conf.d/default.conf
