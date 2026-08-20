# Build context is the monorepo root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile

FROM deps AS build
# Baked into the client bundle at build time. Leave empty (default) when web
# sits behind the bundled nginx, which proxies /v1 to the api service on the
# same origin — set it explicitly only for a standalone/cross-origin deploy.
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN pnpm exec turbo run build --filter=@cryptopay/web

FROM build AS pruned
RUN pnpm --filter=@cryptopay/web deploy --prod /deployed

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S cryptopay && adduser -S cryptopay -G cryptopay
COPY --from=pruned --chown=cryptopay:cryptopay /deployed .
USER cryptopay
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "--port", "3000"]
