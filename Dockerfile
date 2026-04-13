# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
WORKDIR /app

# git is needed by VitePress' `lastUpdated: true` to read file timestamps.
RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# copy-spec.mjs will fall back to fetching from orchestration.civitai.com
# when no sibling repo is present in the build context.
RUN npm run build


FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.vitepress/dist /usr/share/nginx/html
EXPOSE 80
