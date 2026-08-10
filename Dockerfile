# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
WORKDIR /app

# git is needed by VitePress' `lastUpdated: true` to read file timestamps.
RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# No network needed: copy-spec.mjs resolves the OpenAPI spec from the committed
# openapi-snapshots/ when no sibling orchestration repo is in the build context.
# The image therefore serves the SNAPSHOT — publish spec changes by re-snapshotting
# (`npm run copy:spec -- --refresh`) and merging that PR, not by rebuilding.
RUN npm run build


FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.vitepress/dist /usr/share/nginx/html
EXPOSE 80
