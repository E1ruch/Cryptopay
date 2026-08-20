# Build context is the monorepo root: docker build -f apps/api/Dockerfile .
# (pnpm workspaces need every package.json present to resolve the lockfile.)
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
RUN pnpm exec turbo run build --filter=@cryptopay/api

FROM build AS pruned
RUN pnpm --filter=@cryptopay/api deploy --prod /deployed

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S cryptopay && adduser -S cryptopay -G cryptopay
COPY --from=pruned --chown=cryptopay:cryptopay /deployed .
USER cryptopay
EXPOSE 3010
CMD ["node", "dist/main.js"]
