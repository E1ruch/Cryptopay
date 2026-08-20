# One-off migration runner — needs the full (unpruned) workspace install
# since `prisma` itself is a devDependency, unlike the api/worker runtime
# images which only ship pruned production dependencies.
# Build context is the monorepo root.
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile

WORKDIR /repo/packages/database
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
