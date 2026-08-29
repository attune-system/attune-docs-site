FROM node:24-alpine AS build

ARG PUBLIC_SLACK_INVITE_URL
ARG PUBLIC_SUPPORT_URL
ENV PUBLIC_SLACK_INVITE_URL=$PUBLIC_SLACK_INVITE_URL
ENV PUBLIC_SUPPORT_URL=$PUBLIC_SUPPORT_URL

WORKDIR /site
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
